import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const AgentTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const AgentTaskSnapshotSchema = z.object({
  id: z.string(),
  role: z.string(),
  description: z.string(),
  status: AgentTaskStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AgentTaskSnapshot = z.infer<typeof AgentTaskSnapshotSchema>;

export const agentTaskContracts = {
  listForChat: defineContract({
    channel: "agent-task-list-for-chat",
    input: z.object({ chatId: z.number() }),
    output: z.array(AgentTaskSnapshotSchema),
  }),
};

export const agentTaskClient = createClient(agentTaskContracts);
