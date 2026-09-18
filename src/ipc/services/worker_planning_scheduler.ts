import { eq } from "drizzle-orm";
import log from "electron-log";
import { db } from "@/db";
import { workerPlanning } from "@/db/schema";
import { dispatchSquadRun } from "./worker_run_service";

const logger = log.scope("worker_planning_scheduler");

const TICK_INTERVAL_MS = 60 * 60 * 1000; // check once an hour

export const PLANNING_GOAL =
  "Review this project's current state and its .workers/consensus.md file, then propose the next set of actions (1–3, typed, each naming the tool that would execute it).";

function cadenceMs(cadence: string): number {
  return cadence === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

function isDue(cadence: string, lastPlannedAt: Date | null, now: number): boolean {
  if (!lastPlannedAt) return true;
  return now - lastPlannedAt.getTime() >= cadenceMs(cadence);
}

/**
 * Run one planning cycle for a project (Plan Now or scheduler): dispatch a
 * Propose-mode squad run and stamp the last-planned time.
 */
export async function runPlanningCycle(
  projectId: number,
): Promise<{ runId: number; chatId: number }> {
  const result = await dispatchSquadRun({
    projectId,
    goal: PLANNING_GOAL,
    mode: "propose",
  });
  await db
    .update(workerPlanning)
    .set({ lastPlannedAt: new Date(), updatedAt: new Date() })
    .where(eq(workerPlanning.projectId, projectId));
  return result;
}

export async function runDuePlanningCycles(): Promise<void> {
  const plans = await db.query.workerPlanning.findMany({
    where: eq(workerPlanning.enabled, true),
  });
  const now = Date.now();
  for (const plan of plans) {
    if (!isDue(plan.cadence, plan.lastPlannedAt, now)) continue;
    try {
      await runPlanningCycle(plan.projectId);
    } catch (error) {
      logger.error(`Planning cycle for project ${plan.projectId} failed:`, error);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startWorkerPlanningScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void runDuePlanningCycles(), TICK_INTERVAL_MS);
}

export function stopWorkerPlanningScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
