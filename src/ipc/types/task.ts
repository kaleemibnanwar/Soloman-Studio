import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";
import { ModelSelectionSchema } from "@/lib/schemas";

export const BotTypeSchema = z.enum([
  "sentinel",
  "scout",
  "steward",
  "operator",
  "custom",
  "dot",
  "muse",
  "custodian",
]);
export type BotType = z.infer<typeof BotTypeSchema>;

export const BotRoleSchema = z.enum([
  "executor",
  "tester",
  "explorer",
  "debugger",
  "reviewer",
  "architect",
]);
export type BotRole = z.infer<typeof BotRoleSchema>;

export const BotStatusSchema = z.enum(["idle", "running", "completed", "failed", "needs_approval"]);
export type BotStatus = z.infer<typeof BotStatusSchema>;

export const TaskReportSchema = z.object({
  taskId: z.number(),
  title: z.string(),
  botType: BotTypeSchema,
  status: BotStatusSchema,
  lastRunAt: z.date().nullable(),
  totalTokens: z.number(),
  lastChatId: z.number().nullable(),
  summary: z.string(),
  outputPreview: z.string(),
});
export type TaskReport = z.infer<typeof TaskReportSchema>;

export const TaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  prompt: z.string(),
  scheduleMinutes: z.number().int().positive().nullable(),
  enabled: z.boolean(),
  projectId: z.number().nullable(),
  mcpServerIds: z.array(z.number()).nullable(),
  modelSelection: ModelSelectionSchema.nullable(),
  botType: BotTypeSchema.default("custom"),
  role: BotRoleSchema.default("executor"),
  lastStatus: BotStatusSchema.default("idle"),
  lastResultSummary: z.string().nullable(),
  lastRunAt: z.date().nullable(),
  lastChatId: z.number().nullable(),
  missionSlug: z.string().nullable(),
  missionMilestoneId: z.string().nullable(),
  botName: z.string().nullable(),
  // Null in a paginated list response — the token total isn't computed for
  // every row up front; fetch it lazily via getTaskTokenTotal when a row
  // expands. Create/update/run responses always populate the real value.
  totalTokens: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskParamsSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  scheduleMinutes: z.number().int().positive().nullable().optional(),
  projectId: z.number().nullable().optional(),
  mcpServerIds: z.array(z.number()).nullable().optional(),
  modelSelection: ModelSelectionSchema.nullable().optional(),
  botType: BotTypeSchema.optional(),
  role: BotRoleSchema.optional(),
});

export const UpdateTaskParamsSchema = z.object({
  taskId: z.number(),
  title: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  scheduleMinutes: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
  projectId: z.number().nullable().optional(),
  mcpServerIds: z.array(z.number()).nullable().optional(),
  modelSelection: ModelSelectionSchema.nullable().optional(),
  botType: BotTypeSchema.optional(),
  role: BotRoleSchema.optional(),
  lastStatus: BotStatusSchema.optional(),
  lastResultSummary: z.string().nullable().optional(),
});

export const ListTasksParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
});

export const ListTasksResultSchema = z.object({
  items: z.array(TaskSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export const taskContracts = {
  listTasks: defineContract({
    channel: "list-tasks",
    input: ListTasksParamsSchema,
    output: ListTasksResultSchema,
  }),
  getTaskTokenTotal: defineContract({
    channel: "get-task-token-total",
    input: z.number(),
    output: z.number(),
  }),
  getTaskReport: defineContract({
    channel: "get-task-report",
    input: z.number(),
    output: TaskReportSchema.nullable(),
  }),
  createTask: defineContract({
    channel: "create-task",
    input: CreateTaskParamsSchema,
    output: TaskSchema,
    invalidates: () => [{ family: "tasks" }],
  }),
  updateTask: defineContract({
    channel: "update-task",
    input: UpdateTaskParamsSchema,
    output: TaskSchema,
    invalidates: () => [{ family: "tasks" }],
  }),
  deleteTask: defineContract({
    channel: "delete-task",
    input: z.number(),
    output: z.void(),
    invalidates: () => [{ family: "tasks" }],
  }),
  runTaskNow: defineContract({
    channel: "run-task-now",
    input: z.number(),
    output: z.object({ chatId: z.number(), appId: z.number() }),
  }),
};

export const taskClient = createClient(taskContracts);
