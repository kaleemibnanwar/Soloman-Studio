import { and, asc, eq, isNull } from "drizzle-orm";
import log from "electron-log";
import { db } from "@/db";
import { plannerTasks, tasks } from "@/db/schema";
import type { MissionStatus } from "@/ipc/types/mission";
import { readMissionConsensus, writeMissionConsensus } from "@/ipc/utils/mission_consensus";
import { resolveMissionProjectPath } from "@/ipc/utils/mission_project_path";
import { runTask } from "./task_scheduler";

const logger = log.scope("mission-runtime");
const activeRuns = new Map<string, AbortController>();

function runtimeKey(projectId: number | null | undefined, slug: string): string {
  return `${projectId ?? "default"}:${slug}`;
}

function ledgerLine(actor: string, message: string): string {
  return `[${new Date().toISOString()}] [${actor}] ${message}`;
}

async function updatePlannerMilestone(
  projectId: number | null | undefined,
  slug: string,
  milestoneId: string,
  status: "todo" | "in_progress" | "done",
): Promise<void> {
  await db
    .update(plannerTasks)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(plannerTasks.missionSlug, slug),
        eq(plannerTasks.missionMilestoneId, milestoneId),
        projectId == null ? isNull(plannerTasks.appId) : eq(plannerTasks.appId, projectId),
      ),
    );
}

async function executeMission(
  projectId: number | null | undefined,
  slug: string,
  signal: AbortSignal,
) {
  const projectPath = await resolveMissionProjectPath(projectId);
  let mission = readMissionConsensus(projectPath, slug);
  const missionTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.missionSlug, slug),
      projectId == null ? isNull(tasks.projectId) : eq(tasks.projectId, projectId),
    ),
    orderBy: [asc(tasks.id)],
  });

  for (const task of missionTasks) {
    signal.throwIfAborted();
    mission = readMissionConsensus(projectPath, slug);
    if (["PAUSED", "ABORTED"].includes(mission.status)) return;
    const milestoneId = task.missionMilestoneId;
    if (!milestoneId) continue;
    const milestone = mission.milestones.find((entry) => entry.id === milestoneId);
    if (!milestone || milestone.status === "done") continue;

    const botName = task.botName || task.title;
    const milestones = mission.milestones.map((entry) =>
      entry.id === milestoneId ? { ...entry, status: "in_progress" as const } : entry,
    );
    writeMissionConsensus(projectPath, slug, {
      status: "IN PROGRESS",
      activeBot: botName,
      nextMilestoneId: milestoneId,
      lastError: null,
      milestones,
      history: [
        ledgerLine(mission.manager, `Dispatched '${milestone.title}' to ${botName}.`),
        ...mission.history,
      ],
    });
    await updatePlannerMilestone(projectId, slug, milestoneId, "in_progress");

    const result = await runTask(task.id, { waitForCompletion: true, signal });
    mission = readMissionConsensus(projectPath, slug);
    const completedMilestones = mission.milestones.map((entry) =>
      entry.id === milestoneId ? { ...entry, status: "done" as const } : entry,
    );
    const next = completedMilestones.find((entry) => entry.status !== "done") ?? null;
    writeMissionConsensus(projectPath, slug, {
      milestones: completedMilestones,
      activeBot: mission.manager,
      nextMilestoneId: next?.id ?? null,
      history: [
        ledgerLine(
          botName,
          `Completed '${milestone.title}'. Evidence: ${result.summary || `chat #${result.chatId}`}`,
        ),
        ledgerLine(
          mission.manager,
          next ? `Accepted output; next is '${next.title}'.` : "Accepted final output.",
        ),
        ...mission.history,
      ],
    });
    await updatePlannerMilestone(projectId, slug, milestoneId, "done");
  }

  mission = readMissionConsensus(projectPath, slug);
  if (mission.milestones.every((milestone) => milestone.status === "done")) {
    writeMissionConsensus(projectPath, slug, {
      status: "DONE",
      activeBot: null,
      nextMilestoneId: null,
      lastError: null,
      history: [
        ledgerLine(mission.manager, "QA passed and all mission milestones are complete."),
        ...mission.history,
      ],
    });
  }
}

export async function startMissionRuntime(
  projectId: number | null | undefined,
  slug: string,
): Promise<void> {
  const key = runtimeKey(projectId, slug);
  if (activeRuns.has(key)) return;
  const controller = new AbortController();
  activeRuns.set(key, controller);
  try {
    await executeMission(projectId, slug, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return;
    logger.error(`Mission ${slug} failed`, error);
    const projectPath = await resolveMissionProjectPath(projectId);
    const mission = readMissionConsensus(projectPath, slug);
    const message = error instanceof Error ? error.message : String(error);
    writeMissionConsensus(projectPath, slug, {
      status: "BLOCKED",
      activeBot: null,
      lastError: message,
      history: [ledgerLine(mission.manager, `Execution blocked: ${message}`), ...mission.history],
    });
  } finally {
    activeRuns.delete(key);
  }
}

export function launchMissionRuntime(projectId: number | null | undefined, slug: string): void {
  void startMissionRuntime(projectId, slug);
}

export function stopMissionRuntime(
  projectId: number | null | undefined,
  slug: string,
  status: Extract<MissionStatus, "PAUSED" | "ABORTED">,
): void {
  activeRuns.get(runtimeKey(projectId, slug))?.abort(new Error(`Mission ${status.toLowerCase()}`));
}

export function isMissionRuntimeActive(
  projectId: number | null | undefined,
  slug: string,
): boolean {
  return activeRuns.has(runtimeKey(projectId, slug));
}

export async function recoverMissionRuntimes(): Promise<void> {
  const linkedTasks = await db.query.tasks.findMany({
    columns: { projectId: true, missionSlug: true },
  });
  const seen = new Set<string>();
  for (const task of linkedTasks) {
    if (!task.missionSlug) continue;
    const key = runtimeKey(task.projectId, task.missionSlug);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const projectPath = await resolveMissionProjectPath(task.projectId);
      const mission = readMissionConsensus(projectPath, task.missionSlug);
      if (mission.status === "IN PROGRESS") {
        launchMissionRuntime(task.projectId, task.missionSlug);
      }
    } catch (error) {
      logger.warn(`Could not recover mission ${task.missionSlug}`, error);
    }
  }
}
