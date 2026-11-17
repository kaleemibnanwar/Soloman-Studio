import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { apps, plannerTasks } from "@/db/schema";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { plannerContracts } from "@/ipc/types/planner";
import type { PlannerTask } from "@/ipc/types/planner";
import { readMissionConsensus, writeMissionConsensus } from "@/ipc/utils/mission_consensus";
import { resolveMissionProjectPath } from "@/ipc/utils/mission_project_path";
import { publishQueryInvalidations } from "@/ipc/utils/query_invalidation_delivery";
import { createTypedHandler } from "./base";

async function requireApp(appId: number) {
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId), columns: { id: true } });
  if (!app) {
    throw new OctopusStudioError("Project not found", OctopusStudioErrorKind.NotFound);
  }
}

async function syncMissionMilestone(task: PlannerTask): Promise<void> {
  if (!task.missionSlug || !task.missionMilestoneId) return;
  const projectPath = await resolveMissionProjectPath(task.appId);
  const mission = readMissionConsensus(projectPath, task.missionSlug);
  const milestoneStatus =
    task.status === "done" ? "done" : task.status === "in_progress" ? "in_progress" : "todo";
  const milestoneIndex = mission.milestones.findIndex(
    (milestone) => milestone.id === task.missionMilestoneId,
  );
  if (milestoneIndex < 0) {
    throw new OctopusStudioError(
      `Mission milestone '${task.missionMilestoneId}' not found`,
      OctopusStudioErrorKind.NotFound,
    );
  }

  const milestones = [...mission.milestones];
  milestones[milestoneIndex] = {
    ...milestones[milestoneIndex],
    title: task.title,
    status: milestoneStatus,
    botName: task.botName ?? milestones[milestoneIndex].botName,
  };
  const allDone =
    milestones.length > 0 && milestones.every((milestone) => milestone.status === "done");
  const hasStarted = milestones.some((milestone) => milestone.status !== "todo");
  const status = allDone
    ? "DONE"
    : ["BLOCKED", "PAUSED", "ABORTED"].includes(mission.status)
      ? mission.status
      : hasStarted
        ? "IN PROGRESS"
        : "PLANNING";

  writeMissionConsensus(projectPath, task.missionSlug, {
    milestones,
    status,
    history: [
      `[${new Date().toISOString()}] [Planner] ${task.title} moved to ${milestoneStatus}.`,
      ...mission.history,
    ],
  });
}

export function registerPlannerHandlers() {
  createTypedHandler(plannerContracts.listTasks, async (_, { appId }) => {
    return db.query.plannerTasks.findMany({
      where: appId === undefined ? undefined : eq(plannerTasks.appId, appId),
      orderBy: [asc(plannerTasks.status), asc(plannerTasks.position), asc(plannerTasks.createdAt)],
    });
  });

  createTypedHandler(plannerContracts.createTask, async (event, input) => {
    if (input.appId !== undefined && input.appId !== null) await requireApp(input.appId);
    const appPredicate =
      input.appId == null ? isNull(plannerTasks.appId) : eq(plannerTasks.appId, input.appId);
    const [{ nextPosition }] = await db
      .select({ nextPosition: sql<number>`coalesce(max(${plannerTasks.position}), -1) + 1` })
      .from(plannerTasks)
      .where(and(appPredicate, eq(plannerTasks.status, input.status)));
    const [created] = await db
      .insert(plannerTasks)
      .values({ ...input, position: Number(nextPosition) })
      .returning();
    await syncMissionMilestone(created);
    publishQueryInvalidations(
      [{ family: "planner" }, { family: "missions", projectId: created.appId }],
      event.sender,
    );
    return created;
  });

  createTypedHandler(plannerContracts.updateTask, async (event, input) => {
    const { taskId, ...fields } = input;
    if (fields.appId !== undefined && fields.appId !== null) await requireApp(fields.appId);
    const [updated] = await db
      .update(plannerTasks)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(plannerTasks.id, taskId))
      .returning();
    if (!updated) {
      throw new OctopusStudioError("Planner task not found", OctopusStudioErrorKind.NotFound);
    }
    await syncMissionMilestone(updated);
    publishQueryInvalidations(
      [{ family: "planner" }, { family: "missions", projectId: updated.appId }],
      event.sender,
    );
    return updated;
  });

  createTypedHandler(plannerContracts.moveTask, async (event, input) => {
    const existing = await db.query.plannerTasks.findFirst({
      where: eq(plannerTasks.id, input.taskId),
    });
    if (!existing) {
      throw new OctopusStudioError("Planner task not found", OctopusStudioErrorKind.NotFound);
    }

    const updated = db.transaction((tx) => {
      tx.update(plannerTasks)
        .set({ position: sql`${plannerTasks.position} + 1` })
        .where(
          and(
            existing.appId === null
              ? isNull(plannerTasks.appId)
              : eq(plannerTasks.appId, existing.appId),
            eq(plannerTasks.status, input.status),
            gte(plannerTasks.position, input.position),
          ),
        )
        .run();
      const [updated] = tx
        .update(plannerTasks)
        .set({ status: input.status, position: input.position, updatedAt: new Date() })
        .where(eq(plannerTasks.id, input.taskId))
        .returning()
        .all();
      return updated;
    });
    await syncMissionMilestone(updated);
    publishQueryInvalidations(
      [{ family: "planner" }, { family: "missions", projectId: updated.appId }],
      event.sender,
    );
    return updated;
  });

  createTypedHandler(plannerContracts.deleteTask, async (event, taskId) => {
    const deleted = await db.delete(plannerTasks).where(eq(plannerTasks.id, taskId)).returning();
    if (deleted.length === 0) {
      throw new OctopusStudioError("Planner task not found", OctopusStudioErrorKind.NotFound);
    }
    publishQueryInvalidations([{ family: "planner" }], event.sender);
  });
}
