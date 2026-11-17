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
  explorer: { contextBudget: 6000, outputBudget: 1200, executionBudget: 8 },
  executor: { contextBudget: 16000, outputBudget: 4000, executionBudget: 20 },
  tester: { contextBudget: 8000, outputBudget: 1500, executionBudget: 10 },
  debugger: { contextBudget: 16000, outputBudget: 4000, executionBudget: 20 },
  reviewer: { contextBudget: 8000, outputBudget: 1500, executionBudget: 8 },
  architect: { contextBudget: 12000, outputBudget: 2500, executionBudget: 8 },
  verifier: { contextBudget: 6000, outputBudget: 1200, executionBudget: 8 },
};
