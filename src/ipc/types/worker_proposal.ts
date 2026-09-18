import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const WorkerProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export const WorkerProposalSchema = z.object({
  id: z.number(),
  projectId: z.number().nullable(),
  projectName: z.string().nullable(),
  runId: z.number().nullable(),
  summary: z.string(),
  name: z.string().nullable(),
  steps: z.array(z.string()),
  rationale: z.string().nullable(),
  type: z.string(),
  target: z.string().nullable(),
  tool: z.string().nullable(),
  scopeFiles: z.array(z.string()),
  personas: z.array(z.string()),
  estimatedToolCalls: z.number().nullable(),
  status: WorkerProposalStatusSchema,
  feedback: z.string().nullable(),
  guardrailFlags: z.array(z.string()),
  consensusDiff: z.string().nullable(),
  createdAt: z.date(),
  resolvedAt: z.date().nullable(),
  executionOutcome: z.record(z.string(), z.unknown()).nullable(),
});

export type WorkerProposal = z.infer<typeof WorkerProposalSchema>;

export const workerProposalContracts = {
  listProposals: defineContract({
    channel: "worker-proposal-list",
    input: z.object({ projectId: z.number().optional() }),
    output: z.array(WorkerProposalSchema),
  }),
  approveProposal: defineContract({
    channel: "worker-proposal-approve",
    input: z.object({
      proposalId: z.number(),
      // Optional edited summary/scope to run instead of the proposal verbatim.
      editedSummary: z.string().optional(),
    }),
    output: z.object({ runId: z.number(), chatId: z.number() }),
  }),
  rejectProposal: defineContract({
    channel: "worker-proposal-reject",
    input: z.object({ proposalId: z.number(), feedback: z.string() }),
    output: z.void(),
  }),
};

export const workerProposalClient = createClient(workerProposalContracts);
