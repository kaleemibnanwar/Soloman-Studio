import { and, desc, eq, gt } from "drizzle-orm";
import log from "electron-log";
import { z } from "zod";
import { db } from "@/db";
import {
  apps,
  messages,
  workerProposals,
  workerRunSteps,
  workerRuns,
} from "@/db/schema";
import {
  OctopusStudioError,
  OctopusStudioErrorKind,
} from "@/errors/octopus_studio_error";
import { createChatForApp } from "../utils/chat_creation_utils";
import { extractJson } from "../utils/extract_json";
import {
  readConsensus,
  writeConsensus,
  consensusDiff,
} from "../utils/worker_consensus";
import {
  getOctopusStudioAppPath,
  getChatProjectRootPath,
} from "../../paths/paths";
import { readSettings, DEFAULT_SETTINGS } from "../../main/settings";
import {
  dispatchScheduledTaskTurn,
  waitForChatActorIdle,
} from "./chat_actor_service";

const logger = log.scope("worker_run_service");

// The autonomous planner replaces the fixed persona roster: it reads the
// project's .workers/consensus.md file, which defines the team's roles and
// methodology (Auto-Company style). No personas, no squad steps.
const PLANNER = {
  name: "Planner",
  role: "Autonomous Planner",
  systemPrompt:
    "You are the project's autonomous planner. Read the project state and the .workers/consensus.md file (which defines the team's roles and methodology), then carry out the objective with approval-gated actions.",
} as const;

function buildStepPrompt(goal: string, mode: "propose" | "execute"): string {
  const header = `[${PLANNER.name} — ${PLANNER.role}]\n${PLANNER.systemPrompt}`;
  if (mode === "propose") {
    return `${header}\n\nObjective: ${goal}\n\nRead the current project state and the .workers/consensus.md file, then produce a plan only — do NOT edit files or make commits. End by outputting a single JSON object (no markdown fences) with keys: name (a short title), steps (array of concrete bullet points describing what it will do), type (design/research/social/dev/content/admin/other), target, why, tool, estimatedToolCalls.`;
  }
  return `${header}\n\nObjective: ${goal}\n\nCarry out the objective — make real edits/commits as needed — then close with a concise Markdown standup report of what you accomplished.`;
}

async function getLatestAssistantMessage(chatId: number, afterId = 0) {
  return db.query.messages.findFirst({
    where: and(
      eq(messages.chatId, chatId),
      eq(messages.role, "assistant"),
      gt(messages.id, afterId),
    ),
    orderBy: [desc(messages.id)],
  });
}

function summarize(content: string, max = 480): string {
  const trimmed = content.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Strip reasoning and serialized tool-call tags so only the real text remains. */
function cleanAgentText(text: string): string {
  return text
    .replace(/<think>([\s\S]*?)<\/think>/g, "")
    .replace(/<octopus-studio-[^>]*>[\s\S]*?<\/octopus-studio-[^>]*>/g, "")
    .replace(/<octopus-studio-[^>]*>/g, "")
    .trim();
}

const ProposalJsonSchema = z.object({
  // Generalized action shape (spec §1: { name, steps, type, target, why, tool }).
  name: z.string().optional(),
  steps: z.array(z.string()).optional(),
  type: z
    .enum(["design", "research", "social", "dev", "content", "admin", "other"])
    .optional(),
  target: z.string().optional(),
  proposedAction: z.string().optional(),
  why: z.string().optional(),
  tool: z.string().optional(),
  // Legacy code-shaped fields (still accepted for backward compat).
  summary: z.string().optional(),
  rationale: z.string().optional(),
  scopeFiles: z.array(z.string()).optional(),
  personas: z.array(z.string()).optional(),
  estimatedToolCalls: z.number().int().nonnegative().optional(),
});

export interface ExtractedProposal {
  name: string;
  steps: string[];
  type: string;
  target: string | null;
  summary: string; // == name
  rationale: string; // == why
  tool: string | null;
  scopeFiles: string[];
  personas: string[];
  estimatedToolCalls: number | null;
}

/** Turn a Propose-mode wrapup reply into a structured proposal (spec §4.1). */
function extractProposal(report: string): ExtractedProposal {
  const stripped = cleanAgentText(report);
  const json = extractJson(stripped);
  if (json) {
    try {
      const parsed = ProposalJsonSchema.parse(JSON.parse(json));
      const name =
        parsed.name ?? parsed.proposedAction ?? parsed.summary ?? stripped.slice(0, 120);
      return {
        name,
        steps: parsed.steps ?? [],
        type: parsed.type ?? "dev",
        target: parsed.target ?? null,
        summary: name,
        rationale: parsed.why ?? parsed.rationale ?? "",
        tool: parsed.tool ?? null,
        scopeFiles: parsed.scopeFiles ?? [],
        personas: parsed.personas ?? [],
        estimatedToolCalls: parsed.estimatedToolCalls ?? null,
      };
    } catch {
      // fall through to the prose fallback
    }
  }
  return {
    name: stripped.slice(0, 120),
    steps: [],
    type: "dev",
    target: null,
    summary: stripped.slice(0, 300),
    rationale: "",
    tool: null,
    scopeFiles: [],
    personas: [],
    estimatedToolCalls: null,
  };
}

const DANGER_PATTERNS: Array<{ re: RegExp; keyword: string }> = [
  { re: /force[- ]push/i, keyword: "force" },
  { re: /\bdelete\b[^.]*(project|app)/i, keyword: "delete" },
  { re: /(credential|secret|api[ -]?key|password|\.env|token)/i, keyword: "credential" },
];

/**
 * Flag guardrails a proposal's text appears to touch (crude keyword heuristic,
 * surfaced on the Approval Queue card — not an enforcement gate).
 */
function flagGuardrails(text: string, guardrails: string[]): string[] {
  const flags: string[] = [];
  for (const { re, keyword } of DANGER_PATTERNS) {
    if (!re.test(text)) continue;
    const match = guardrails.find((g) => g.toLowerCase().includes(keyword));
    flags.push(match ?? `Guardrail: ${keyword}`);
  }
  return flags;
}

function resolveProjectPath(app: {
  type: string;
  path: string | null;
  directory: string | null;
  id: number;
}): string {
  if (app.type === "chat") {
    return getChatProjectRootPath(app.directory, app.id);
  }
  return getOctopusStudioAppPath(app.path ?? "");
}

export async function dispatchSquadRun(input: {
  projectId: number;
  goal: string;
  mode?: "propose" | "execute";
}): Promise<{ runId: number; chatId: number }> {
  const mode = input.mode ?? "execute";
  const project = await db.query.apps.findFirst({
    where: eq(apps.id, input.projectId),
    columns: { id: true, type: true, name: true },
  });
  if (!project) {
    throw new OctopusStudioError("Project not found", OctopusStudioErrorKind.NotFound);
  }

  const steps = [{ name: PLANNER.name, role: PLANNER.role }];
  const requestedChatMode =
    mode === "propose"
      ? "ask" // read-only: blocks write tools + auto-apply, no commits
      : project.type === "chat"
        ? "local-agent"
        : "build";

  const chatId = await createChatForApp({
    appId: project.id,
    title:
      mode === "propose"
        ? `Planning run: ${input.goal.slice(0, 60)}`
        : `Squad run: ${input.goal.slice(0, 60)}`,
    initialChatMode: requestedChatMode,
  });

  const [run] = await db
    .insert(workerRuns)
    .values({
      projectId: project.id,
      goal: input.goal,
      status: "running",
      mode,
      chatId,
      totalSteps: steps.length,
    })
    .returning();

  await db.insert(workerRunSteps).values(
    steps.map((step, index) => ({
      runId: run.id,
      stepIndex: index,
      personaId: null,
      personaName: step.name,
      personaRole: step.role,
      instructions: buildStepPrompt(input.goal, mode),
    })),
  );

  // Runs in the background; the renderer polls listRuns()/getRun() for progress.
  void runSquad(run.id, chatId, requestedChatMode, mode).catch((error) => {
    logger.error(`Squad run ${run.id} crashed:`, error);
  });

  return { runId: run.id, chatId };
}

async function runSquad(
  runId: number,
  chatId: number,
  requestedChatMode: "local-agent" | "build" | "ask",
  mode: "propose" | "execute",
): Promise<void> {
  const run = await db.query.workerRuns.findFirst({
    where: eq(workerRuns.id, runId),
  });
  if (!run || run.projectId == null) {
    logger.error(`Squad run ${runId} has no project; aborting.`);
    return;
  }
  const appId = run.projectId;

  const steps = await db.query.workerRunSteps.findMany({
    where: eq(workerRunSteps.runId, runId),
    orderBy: [workerRunSteps.stepIndex],
  });

  for (const step of steps) {
    const fresh = await db.query.workerRuns.findFirst({
      where: eq(workerRuns.id, runId),
      columns: { cancelRequested: true },
    });
    if (fresh?.cancelRequested) {
      await db
        .update(workerRunSteps)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(workerRunSteps.id, step.id));
      await db
        .update(workerRuns)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(eq(workerRuns.id, runId));
      return;
    }

    await db
      .update(workerRunSteps)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(workerRunSteps.id, step.id));

    try {
      const priorMessage = await getLatestAssistantMessage(chatId);
      const acceptance = await dispatchScheduledTaskTurn({
        chatId,
        appId,
        prompt: step.instructions,
        requestedChatMode,
      });
      if (acceptance === "rejected") {
        throw new Error("Turn was rejected (app busy or locked)");
      }

      await waitForChatActorIdle(chatId);

      const reply = await getLatestAssistantMessage(chatId, priorMessage?.id ?? 0);
      const content = cleanAgentText(reply?.content ?? "") || "(no reply)";

      await db
        .update(workerRunSteps)
        .set({
          status: "completed",
          messageId: reply?.id ?? null,
          summary: summarize(content),
          completedAt: new Date(),
        })
        .where(eq(workerRunSteps.id, step.id));

      const isFinalStep = step.stepIndex === steps.length - 1;
      await db
        .update(workerRuns)
        .set({
          currentStepIndex: step.stepIndex + 1,
          ...(isFinalStep ? { report: content } : {}),
        })
        .where(eq(workerRuns.id, runId));
    } catch (error) {
      logger.error(`Squad run ${runId} step ${step.stepIndex} failed:`, error);
      await db
        .update(workerRunSteps)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(workerRunSteps.id, step.id));
      await db
        .update(workerRuns)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        })
        .where(eq(workerRuns.id, runId));
      return;
    }
  }

  try {
    if (mode === "propose") {
      await finalizeProposal(runId);
    } else {
      await finalizeExecutionOutcome(runId);
    }
  } catch (error) {
    logger.error(`Finalize step for run ${runId} failed:`, error);
  }

  await db
    .update(workerRuns)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(workerRuns.id, runId));
}

/**
 * Close the loop for an Execute-mode run: write the execution outcome back onto
 * the approved proposal (and the consensus History), so the Approval Queue and
 * the next planning cycle can see what actually happened (spec §1 Feedback).
 */
async function finalizeExecutionOutcome(runId: number): Promise<void> {
  const run = await db.query.workerRuns.findFirst({
    where: eq(workerRuns.id, runId),
  });
  if (!run?.projectId) return;

  const proposal = await db.query.workerProposals.findFirst({
    where: eq(workerProposals.executionRunId, runId),
  });
  if (!proposal) return;

  const outcome = {
    attempted: true,
    result: "completed",
    evidence: (run.report ?? "").slice(0, 500),
    toolUsed: "code-squad",
  };

  await db
    .update(workerProposals)
    .set({ executionOutcome: outcome })
    .where(eq(workerProposals.id, proposal.id));

  const project = await db.query.apps.findFirst({
    where: eq(apps.id, run.projectId),
    columns: { id: true, type: true, path: true, directory: true },
  });
  if (project) {
    writeConsensus(resolveProjectPath(project), {
      nextAction: proposal.summary,
      historyLine: `${new Date().toISOString()} — executed: ${proposal.summary}`,
    });
  }
}

/**
 * After a Propose-mode run, turn the wrapup report into a pending proposal,
 * update the per-project consensus file, and record the guardrail flags + the
 * consensus diff for the Approval Queue card (spec §4.1/§4.3/§5.1).
 */
async function finalizeProposal(runId: number): Promise<void> {
  const run = await db.query.workerRuns.findFirst({
    where: eq(workerRuns.id, runId),
  });
  if (!run?.projectId) return;
  const projectId = run.projectId;

  const proposal = extractProposal(run.report ?? "");

  const project = await db.query.apps.findFirst({
    where: eq(apps.id, projectId),
    columns: { id: true, type: true, path: true, directory: true },
  });
  if (!project) return;

  const projectPath = resolveProjectPath(project);
  const before = readConsensus(projectPath);
  const historyLine = `${new Date().toISOString()} — proposed: ${proposal.summary}`;
  writeConsensus(projectPath, { nextAction: proposal.summary, historyLine });
  const after = readConsensus(projectPath);
  const diff = consensusDiff(
    before.nextAction || "(none)",
    after.nextAction || "(none)",
  );

  const settings = await readSettings();
  const guardrails = settings.guardrails ?? DEFAULT_SETTINGS.guardrails ?? [];
  const guardrailFlags = flagGuardrails(run.report ?? "", guardrails);

  await db.insert(workerProposals).values({
    projectId,
    runId,
    type: proposal.type as
      | "design"
      | "research"
      | "social"
      | "dev"
      | "content"
      | "admin"
      | "other",
    target: proposal.target,
    tool: proposal.tool,
    summary: proposal.summary,
    name: proposal.name,
    steps: proposal.steps,
    rationale: proposal.rationale || null,
    scopeFiles: proposal.scopeFiles,
    personas: proposal.personas,
    estimatedToolCalls: proposal.estimatedToolCalls,
    status: "pending",
    guardrailFlags,
    consensusDiff: diff,
  });
}

export async function cancelSquadRun(runId: number): Promise<void> {
  const run = await db.query.workerRuns.findFirst({
    where: eq(workerRuns.id, runId),
  });
  if (!run) {
    throw new OctopusStudioError("Run not found", OctopusStudioErrorKind.NotFound);
  }
  if (run.status !== "running") {
    return;
  }
  await db
    .update(workerRuns)
    .set({ cancelRequested: true })
    .where(eq(workerRuns.id, runId));
  if (run.chatId != null) {
    // Interrupts the in-flight turn; the loop in runSquad() notices
    // cancelRequested before dispatching the next step regardless.
    await waitForChatActorIdle(run.chatId, { cancelActive: true });
  }
}
