import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const WorkerPlanningCadenceSchema = z.enum(["daily", "weekly"]);

export const WorkerPlanningSchema = z.object({
  projectId: z.number(),
  enabled: z.boolean(),
  cadence: WorkerPlanningCadenceSchema,
  lastPlannedAt: z.date().nullable(),
});

export type WorkerPlanning = z.infer<typeof WorkerPlanningSchema>;

export const workerPlanningContracts = {
  getPlanning: defineContract({
    channel: "worker-planning-get",
    input: z.object({ projectId: z.number() }),
    output: WorkerPlanningSchema.nullable(),
  }),
  setPlanning: defineContract({
    channel: "worker-planning-set",
    input: z.object({
      projectId: z.number(),
      enabled: z.boolean(),
      cadence: WorkerPlanningCadenceSchema.optional(),
    }),
    output: WorkerPlanningSchema,
  }),
  planNow: defineContract({
    channel: "worker-planning-plan-now",
    input: z.object({ projectId: z.number() }),
    output: z.object({ runId: z.number(), chatId: z.number() }),
  }),
  getConsensus: defineContract({
    channel: "worker-planning-get-consensus",
    input: z.object({ projectId: z.number() }),
    output: z.object({
      lastUpdated: z.string(),
      phase: z.string(),
      nextAction: z.string(),
      activeProjects: z.array(z.string()),
      whatWeDid: z.array(z.string()),
      keyDecisions: z.array(z.string()),
      openQuestions: z.array(z.string()),
      history: z.array(z.string()),
    }),
  }),
  listWorkerProjects: defineContract({
    channel: "worker-planning-list-projects",
    input: z.void(),
    output: z.array(
      z.object({
        projectId: z.number(),
        name: z.string(),
        enabled: z.boolean(),
        cadence: z.string(),
      }),
    ),
  }),
};

export const workerPlanningClient = createClient(workerPlanningContracts);
