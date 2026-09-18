import { z } from "zod";
import type { TokenBudget } from "./agent_budget";

/**
 * The agent task contract — the boundary between orchestrator and worker
 * (Octopus-Studio Implementation Guide v1.1, §8 / §13).
 *
 * A subagent receives only its task contract, acceptance criteria, permissions,
 * retrieved chunks, prerequisite artifacts, and explicit budgets (§5) — never
 * the parent conversation.
 */

export const AGENT_ROLES = [
  "explorer",
  "coder",
  "tester",
  "debugger",
  "reviewer",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const AgentTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const AgentTaskSchema = z.object({
  id: z.string(),
  parentTaskId: z.string().nullable().optional(),
  description: z.string().min(1),
  role: z.enum(AGENT_ROLES),
  /** Task ids this task depends on (DAG edges). */
  dependencies: z.array(z.string()),
  /** Permission boundary (§9); null = unrestricted (matches the single-agent path). */
  allowedFiles: z.array(z.string()).nullable().optional(),
  allowedSymbols: z.array(z.string()).nullable().optional(),
  contextBudget: z.number().int().positive(),
  outputBudget: z.number().int().positive(),
  executionBudget: z.number().int().positive(),
  status: AgentTaskStatusSchema.default("pending"),
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

/**
 * A structured handoff — a worker reports a compact result, not prose (§13).
 * Downstream agents retrieve source by chunk/file id instead of reading a long
 * narrative report.
 */
export const AgentResultSchema = z.object({
  status: z.enum(["complete", "failed"]),
  changed: z.array(z.string()),
  tests: z.array(z.string()),
  decisions: z.array(z.string()),
  issues: z.array(z.string()),
  next: z.string().nullable().optional(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

/** The context actually handed to a worker (doc §5/§6). */
export interface AgentContext {
  task: AgentTask;
  /** Level 0–3 retrieved context (metadata → chunks → dependencies). Typed by
   * the progressive retriever; loose here because that lands in Increment 2. */
  retrievedContext: unknown;
  /** Compact artifacts produced by upstream tasks. */
  prerequisiteArtifacts: AgentResult[];
}

/**
 * Illustrative starting budgets per role (doc §12). These are calibrated
 * constants, not fixed specification values — retune from the §26 budget
 * reports. `executionBudget` is the max model-call count (§26 "Calls").
 */
export const ROLE_BUDGETS: Record<AgentRole, TokenBudget> = {
  explorer: { contextBudget: 2000, outputBudget: 500, executionBudget: 3 },
  coder: { contextBudget: 8000, outputBudget: 2000, executionBudget: 10 },
  tester: { contextBudget: 5000, outputBudget: 1000, executionBudget: 6 },
  debugger: { contextBudget: 8000, outputBudget: 2000, executionBudget: 10 },
  reviewer: { contextBudget: 6000, outputBudget: 1000, executionBudget: 4 },
};
