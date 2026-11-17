import { and, desc, eq, inArray } from "drizzle-orm";
import log from "electron-log";
import { db } from "@/db";
import { apps, chats, mcpServers, messages, tasks } from "@/db/schema";
import { ensureDefaultChatProject } from "@/db/default_chat_project";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { createChatForApp } from "../utils/chat_creation_utils";
import { dispatchScheduledTaskTurn, waitForChatActorIdle } from "./chat_actor_service";
import { getPersonaByKey } from "@/ipc/agent/persona_library";

const logger = log.scope("task_scheduler");

const TICK_INTERVAL_MS = 60_000; // check once a minute

/**
 * Run a task: create a chat in the target project and dispatch the task prompt
 * as a model turn. The chat-stream actor admits the intent, persists the user
 * message, and streams the assistant reply. Returns the chat so the renderer
 * can open it.
 *
 * `lastRunAt`/`lastChatId` are only updated after the turn is accepted, so a
 * failed dispatch is retried on the next tick.
 */
export async function runTask(
  taskId: number,
  options: { waitForCompletion?: boolean; signal?: AbortSignal } = {},
): Promise<{ chatId: number; appId: number; summary?: string }> {
  options.signal?.throwIfAborted();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) {
    throw new OctopusStudioError("Task not found", OctopusStudioErrorKind.NotFound);
  }

  // Target the task's project, else the default chat project.
  let projectId = task.projectId;
  if (projectId == null) {
    projectId = (await ensureDefaultChatProject()).id;
  }

  const project = await db.query.apps.findFirst({
    where: eq(apps.id, projectId),
    columns: { type: true },
  });
  if (!project) {
    throw new OctopusStudioError("Task project not found", OctopusStudioErrorKind.NotFound);
  }
  // Prefer Agent mode (local-agent) for all coworker bot runs so OpenCode is utilized
  const requestedChatMode = "local-agent";

  await db
    .update(tasks)
    .set({ lastStatus: "running", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  let chatId: number;
  try {
    chatId = await createChatForApp({
      appId: projectId,
      title: `[${task.botType ? task.botType.toUpperCase() : "BOT"}] ${task.title}`,
      initialChatMode: requestedChatMode,
    });

    if (task.modelSelection) {
      await db
        .update(chats)
        .set({ modelSelection: task.modelSelection })
        .where(eq(chats.id, chatId));
    }

    // Dispatches the intent and fires the model turn. The actor inserts the user
    // message itself when the intent is accepted.
    const personaKeyByBotType = {
      scout: "lead_prospector",
      operator: "commercial_communicator",
      steward: "code_steward",
      sentinel: "qa_sentinel",
    } as const;
    const personaKey = personaKeyByBotType[task.botType as keyof typeof personaKeyByBotType];
    const persona = personaKey ? getPersonaByKey(personaKey) : undefined;
    const selectedMcpServers = task.mcpServerIds?.length
      ? await db
          .select({ name: mcpServers.name })
          .from(mcpServers)
          .where(inArray(mcpServers.id, task.mcpServerIds))
      : [];
    const coworkerPrompt = [
      persona?.systemPrompt,
      selectedMcpServers.length
        ? `SELECTIVE MCP BOUNDARY: You may use only these configured MCP servers for this task: ${selectedMcpServers.map(({ name }) => name).join(", ")}. When delegating, pass exactly these names in mcp_servers.`
        : "SELECTIVE MCP BOUNDARY: No MCP servers are provisioned for this task.",
      task.missionSlug
        ? `MISSION EXECUTION CONTRACT: This is mission '${task.missionSlug}', milestone '${task.missionMilestoneId ?? "unassigned"}', and your bot name is '${task.botName ?? task.title}'. Every spawn_subagent call MUST pass mission_slug='${task.missionSlug}' and bot_name='${task.botName ?? task.title}'. Read the consensus ledger before acting, save durable artifacts, and finish with evidence plus a recommendation for the manager.`
        : undefined,
      "TASK OBJECTIVE:",
      task.prompt,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await dispatchScheduledTaskTurn({
      chatId,
      appId: projectId,
      prompt: coworkerPrompt,
      requestedChatMode,
    });
    if (result === "rejected") {
      throw new OctopusStudioError(
        "Scheduled task turn was rejected",
        OctopusStudioErrorKind.Conflict,
      );
    }

    let completionSummary = "Bot mission accepted by the agent runtime.";
    if (options.waitForCompletion) {
      try {
        await waitForChatActorIdle(chatId, { signal: options.signal });
      } catch (error) {
        if (options.signal?.aborted) {
          await waitForChatActorIdle(chatId, { cancelActive: true });
        }
        throw error;
      }
      const assistantMessage = await db.query.messages.findFirst({
        where: and(eq(messages.chatId, chatId), eq(messages.role, "assistant")),
        orderBy: [desc(messages.id)],
      });
      if (assistantMessage?.role === "assistant" && assistantMessage.content?.trim()) {
        completionSummary = assistantMessage.content.trim().slice(0, 500);
      } else {
        completionSummary = "Agent turn completed without a textual summary.";
      }
    }

    await db
      .update(tasks)
      .set({
        lastRunAt: new Date(),
        lastChatId: chatId,
        lastStatus: "completed",
        lastResultSummary: completionSummary,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await db
      .update(tasks)
      .set({
        lastStatus: "failed",
        lastResultSummary: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    throw error;
  }

  const completedTask = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  return { chatId, appId: projectId, summary: completedTask?.lastResultSummary ?? undefined };
}

/** Whether a recurring task's interval has elapsed as of `nowMs`. */
export function isTaskDue(
  task: { scheduleMinutes: number | null; lastRunAt: Date | null },
  nowMs: number,
): boolean {
  if (task.scheduleMinutes == null) {
    return false;
  }
  if (task.lastRunAt == null) {
    return true; // never run → due now
  }
  return nowMs - task.lastRunAt.getTime() >= task.scheduleMinutes * 60_000;
}

/** Fire every enabled recurring task whose interval has elapsed. */
export async function runDueTasks(): Promise<void> {
  const scheduled = await db.query.tasks.findMany({
    where: eq(tasks.enabled, true),
  });

  const now = Date.now();
  for (const task of scheduled) {
    if (!isTaskDue(task, now)) {
      continue;
    }
    try {
      await runTask(task.id);
    } catch (error) {
      logger.error(`Scheduled task ${task.id} failed:`, error);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startTaskScheduler(): void {
  if (timer) {
    return;
  }
  void runDueTasks(); // best-effort catch-up on launch
  timer = setInterval(() => {
    void runDueTasks();
  }, TICK_INTERVAL_MS);
}

export function stopTaskScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
