/**
 * The agent task contract — the boundary between orchestrator and worker.
 *
 * A sub-agent receives only its bounded task (goal, role, permissions, and a
 * per-role budget) — never the parent conversation. `ROLE_BUDGETS` supplies the
 * per-role budgets; `executionBudget` is enforced as the sub-agent's step
 * limit, while `contextBudget`/`outputBudget` are stored on the task row as
 * metadata for observability and future enforcement.
 */

export interface TokenBudget {
  /** Max input tokens an agent may consume (context_budget). */
  contextBudget: number;
  /** Max output tokens an agent may produce (output_budget). */
  outputBudget: number;
  /** Max model calls an agent may make (execution_budget) — the step limit. */
  executionBudget: number;
}

export const AGENT_ROLES = [
  "explorer",
  "executor",
  "tester",
  "debugger",
  "reviewer",
  "architect",
  "verifier",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * Per-role budgets. These are calibrated starting constants, not fixed
 * specification values — retune from budget reports. `executionBudget` is the
 * max model-call count (the sub-agent's `stepCountIs` stop condition).
 */
export const ROLE_BUDGETS: Record<AgentRole, TokenBudget> = {
  explorer: { contextBudget: 2000, outputBudget: 500, executionBudget: 3 },
  executor: { contextBudget: 8000, outputBudget: 2000, executionBudget: 10 },
  tester: { contextBudget: 5000, outputBudget: 1000, executionBudget: 6 },
  debugger: { contextBudget: 8000, outputBudget: 2000, executionBudget: 10 },
  reviewer: { contextBudget: 6000, outputBudget: 1000, executionBudget: 4 },
  architect: { contextBudget: 10000, outputBudget: 2000, executionBudget: 6 },
  verifier: { contextBudget: 4000, outputBudget: 800, executionBudget: 4 },
};
