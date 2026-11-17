import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const AgentTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "partial",
  "blocked",
]);

export const AgentTaskSnapshotSchema = z.object({
  id: z.string(),
  role: z.string(),
  description: z.string(),
  status: AgentTaskStatusSchema,
  dependencies: z.array(z.string()),
  model: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  resultStatus: z.string().nullable(),
  notes: z.string().nullable(),
  cached: z.boolean().nullable(),
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
