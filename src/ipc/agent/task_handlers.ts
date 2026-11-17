import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { agentArtifacts, agentTasks } from "../../db/schema";
import { createTypedHandler } from "../handlers/base";
import { agentTaskContracts } from "../types/agent_task";

/**
 * Sub-agent task snapshots for a chat, enriched with the latest persisted
 * artifact (status, model, token usage, cost, notes). The snapshot is what the
 * composer surfaces, so a task that only made partial progress is shown as
 * "partial" — not silently collapsed into "completed".
 */
export function registerAgentTaskHandlers() {
  createTypedHandler(agentTaskContracts.listForChat, async (_event, { chatId }) => {
    const rows = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.chatId, chatId))
      .orderBy(desc(agentTasks.createdAt));

    const taskIds = rows.map((task) => task.id);
    const artifacts = taskIds.length
      ? await db
          .select()
          .from(agentArtifacts)
          .where(inArray(agentArtifacts.taskId, taskIds))
          .orderBy(asc(agentArtifacts.id))
      : [];

    // Latest artifact per task wins (id is auto-increment, so last = newest).
    const latestByTask = new Map<string, Record<string, unknown>>();
    for (const artifact of artifacts) {
      latestByTask.set(artifact.taskId, artifact.result);
    }

    return rows.map((task) => {
      const art = latestByTask.get(task.id);
      return {
        id: task.id,
        role: task.role,
        description: task.description,
        status: task.status,
        dependencies: task.dependencies ?? [],
        model: typeof art?.model === "string" ? (art.model as string) : null,
        inputTokens: typeof art?.inputTokens === "number" ? (art.inputTokens as number) : null,
        outputTokens: typeof art?.outputTokens === "number" ? (art.outputTokens as number) : null,
        costUsd: typeof art?.costUsd === "number" ? (art.costUsd as number) : null,
        resultStatus: typeof art?.status === "string" ? (art.status as string) : null,
        notes: typeof art?.notes === "string" ? (art.notes as string) : null,
        cached: typeof art?.cached === "boolean" ? (art.cached as boolean) : null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    });
  });
}
