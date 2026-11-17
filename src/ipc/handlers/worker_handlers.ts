import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { workerRuns } from "../../db/schema";
import { createTypedHandler } from "./base";
import { workerContracts } from "../types/worker";
import { cancelSquadRun, dispatchSquadRun } from "../services/worker_run_service";

export function registerWorkerHandlers() {
  createTypedHandler(workerContracts.listRuns, async () => {
    return db.query.workerRuns.findMany({
      orderBy: [desc(workerRuns.createdAt)],
      with: { steps: { orderBy: (steps, { asc }) => [asc(steps.stepIndex)] } },
    });
  });

  createTypedHandler(workerContracts.getRun, async (_, runId) => {
    const run = await db.query.workerRuns.findFirst({
      where: eq(workerRuns.id, runId),
      with: { steps: { orderBy: (steps, { asc }) => [asc(steps.stepIndex)] } },
    });
    return run ?? null;
  });

  createTypedHandler(workerContracts.dispatchSquadRun, async (_, params) => {
    return dispatchSquadRun(params);
  });

  createTypedHandler(workerContracts.cancelRun, async (_, runId) => {
    await cancelSquadRun(runId);
  });
}
