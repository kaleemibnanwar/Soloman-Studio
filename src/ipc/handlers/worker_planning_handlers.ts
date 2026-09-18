import { eq } from "drizzle-orm";
import { db } from "../../db";
import { apps, workerPlanning } from "../../db/schema";
import { createTypedHandler } from "./base";
import { workerPlanningContracts } from "../types/worker_planning";
import { runPlanningCycle } from "../services/worker_planning_scheduler";
import {
  getOctopusStudioAppPath,
  getChatProjectRootPath,
} from "../../paths/paths";
import { readConsensus } from "../utils/worker_consensus";

function toWorkerPlanning(row: typeof workerPlanning.$inferSelect) {
  return {
    projectId: row.projectId,
    enabled: row.enabled,
    cadence: row.cadence,
    lastPlannedAt: row.lastPlannedAt,
  };
}

export function registerWorkerPlanningHandlers() {
  createTypedHandler(
    workerPlanningContracts.getPlanning,
    async (_event, { projectId }) => {
      const row = await db.query.workerPlanning.findFirst({
        where: eq(workerPlanning.projectId, projectId),
      });
      return row ? toWorkerPlanning(row) : null;
    },
  );

  createTypedHandler(
    workerPlanningContracts.setPlanning,
    async (_event, { projectId, enabled, cadence }) => {
      const existing = await db.query.workerPlanning.findFirst({
        where: eq(workerPlanning.projectId, projectId),
      });
      if (existing) {
        const [updated] = await db
          .update(workerPlanning)
          .set({
            enabled,
            ...(cadence ? { cadence } : {}),
            updatedAt: new Date(),
          })
          .where(eq(workerPlanning.id, existing.id))
          .returning();
        return toWorkerPlanning(updated);
      }
      const [created] = await db
        .insert(workerPlanning)
        .values({ projectId, enabled, cadence: cadence ?? "weekly" })
        .returning();
      return toWorkerPlanning(created);
    },
  );

  createTypedHandler(workerPlanningContracts.planNow, async (_event, { projectId }) => {
    return runPlanningCycle(projectId);
  });

  createTypedHandler(
    workerPlanningContracts.getConsensus,
    async (_event, { projectId }) => {
      const project = await db.query.apps.findFirst({
        where: eq(apps.id, projectId),
        columns: { id: true, type: true, path: true, directory: true },
      });
      if (!project) {
        return {
          lastUpdated: "",
          phase: "Exploring",
          nextAction: "",
          activeProjects: [],
          whatWeDid: [],
          keyDecisions: [],
          openQuestions: [],
          history: [],
        };
      }
      const projectPath =
        project.type === "chat"
          ? getChatProjectRootPath(project.directory, project.id)
          : getOctopusStudioAppPath(project.path ?? "");
      const consensus = readConsensus(projectPath);
      return {
        lastUpdated: consensus.lastUpdated,
        phase: consensus.phase,
        nextAction: consensus.nextAction,
        activeProjects: consensus.activeProjects,
        whatWeDid: consensus.whatWeDid,
        keyDecisions: consensus.keyDecisions,
        openQuestions: consensus.openQuestions,
        history: consensus.history,
      };
    },
  );

  createTypedHandler(workerPlanningContracts.listWorkerProjects, async () => {
    const plans = await db.query.workerPlanning.findMany();
    const result: Array<{
      projectId: number;
      name: string;
      enabled: boolean;
      cadence: string;
    }> = [];
    for (const plan of plans) {
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, plan.projectId),
        columns: { name: true },
      });
      if (!app) continue;
      result.push({
        projectId: plan.projectId,
        name: app.name,
        enabled: plan.enabled,
        cadence: plan.cadence,
      });
    }
    return result;
  });
}
