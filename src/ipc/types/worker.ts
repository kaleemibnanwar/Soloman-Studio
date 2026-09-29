import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const WorkerRunStepStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const WorkerRunStepSchema = z.object({
  id: z.number(),
  runId: z.number(),
  stepIndex: z.number(),
  personaId: z.number().nullable(),
  personaName: z.string(),
  personaRole: z.string(),
  instructions: z.string(),
  status: WorkerRunStepStatusSchema,
  messageId: z.number().nullable(),
  summary: z.string().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
});
export type WorkerRunStep = z.infer<typeof WorkerRunStepSchema>;

export const WorkerRunStatusSchema = z.enum(["running", "completed", "failed", "cancelled"]);

export const WorkerRunModeSchema = z.enum(["propose", "execute"]);

export const WorkerRunSchema = z.object({
  id: z.number(),
  projectId: z.number().nullable(),
  goal: z.string(),
  status: WorkerRunStatusSchema,
  mode: WorkerRunModeSchema,
  chatId: z.number().nullable(),
  currentStepIndex: z.number(),
  totalSteps: z.number(),
  cancelRequested: z.boolean(),
  report: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
  steps: z.array(WorkerRunStepSchema),
});
export type WorkerRun = z.infer<typeof WorkerRunSchema>;

export const DispatchSquadRunParamsSchema = z.object({
  projectId: z.number(),
  goal: z.string().min(1),
  // "propose" = read-only planning (produces an Approval Queue item);
  // "execute" = real edits + commits.
  mode: WorkerRunModeSchema.optional(),
});

export const workerContracts = {
  listRuns: defineContract({
    channel: "worker-list-runs",
    input: z.void(),
    output: z.array(WorkerRunSchema),
  }),
  getRun: defineContract({
    channel: "worker-get-run",
    input: z.number(),
    output: WorkerRunSchema.nullable(),
  }),
  dispatchSquadRun: defineContract({
    channel: "worker-dispatch-squad-run",
    input: DispatchSquadRunParamsSchema,
    output: z.object({ runId: z.number(), chatId: z.number() }),
  }),
  cancelRun: defineContract({
    channel: "worker-cancel-run",
    input: z.number(),
    output: z.void(),
  }),
};

export const workerClient = createClient(workerContracts);
