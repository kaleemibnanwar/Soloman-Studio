import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const PlannerTaskStatusSchema = z.enum(["backlog", "todo", "in_progress", "done"]);
export const PlannerTaskPrioritySchema = z.enum(["low", "medium", "high"]);

export const PlannerTaskSchema = z.object({
  id: z.number(),
  appId: z.number().nullable(),
  title: z.string(),
  description: z.string(),
  status: PlannerTaskStatusSchema,
  priority: PlannerTaskPrioritySchema,
  dueAt: z.date().nullable(),
  position: z.number().int(),
  botName: z.string().nullable().optional(),
  missionSlug: z.string().nullable().optional(),
  missionMilestoneId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PlannerTask = z.infer<typeof PlannerTaskSchema>;
export type PlannerTaskStatus = z.infer<typeof PlannerTaskStatusSchema>;

const PlannerTaskFieldsSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(8_000).default(""),
  status: PlannerTaskStatusSchema.default("todo"),
  priority: PlannerTaskPrioritySchema.default("medium"),
  dueAt: z.date().nullable().default(null),
  botName: z.string().nullable().optional(),
  missionSlug: z.string().nullable().optional(),
  missionMilestoneId: z.string().nullable().optional(),
});

export const plannerContracts = {
  listTasks: defineContract({
    channel: "planner:list-tasks",
    input: z.object({ appId: z.number().int().positive().optional() }),
    output: z.array(PlannerTaskSchema),
  }),
  createTask: defineContract({
    channel: "planner:create-task",
    input: PlannerTaskFieldsSchema.extend({
      appId: z.number().int().positive().nullable().optional(),
    }),
    output: PlannerTaskSchema,
    invalidates: (input) => [{ family: "planner", appId: input.appId ?? undefined }],
  }),
  updateTask: defineContract({
    channel: "planner:update-task",
    input: PlannerTaskFieldsSchema.partial().extend({
      taskId: z.number().int().positive(),
      appId: z.number().int().positive().nullable().optional(),
    }),
    output: PlannerTaskSchema,
    invalidates: () => [{ family: "planner" }],
  }),
  moveTask: defineContract({
    channel: "planner:move-task",
    input: z.object({
      taskId: z.number().int().positive(),
      status: PlannerTaskStatusSchema,
      position: z.number().int().nonnegative(),
    }),
    output: PlannerTaskSchema,
    invalidates: () => [{ family: "planner" }],
  }),
  deleteTask: defineContract({
    channel: "planner:delete-task",
    input: z.number().int().positive(),
    output: z.void(),
    invalidates: () => [{ family: "planner" }],
  }),
};

export const plannerClient = createClient(plannerContracts);
