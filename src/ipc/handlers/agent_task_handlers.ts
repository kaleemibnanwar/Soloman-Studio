import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentTasks } from "../../db/schema";
import { createTypedHandler } from "./base";
import { agentTaskContracts } from "../types/agent_task";

export function registerAgentTaskHandlers() {
  createTypedHandler(
    agentTaskContracts.listForChat,
    async (_event, { chatId }) => {
      const rows = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.chatId, chatId))
        .orderBy(desc(agentTasks.createdAt));
      return rows.map((task) => ({
        id: task.id,
        role: task.role,
        description: task.description,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }));
    },
  );
}
