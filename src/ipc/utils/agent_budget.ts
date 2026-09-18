/**
 * Token/call budgeting primitives for the multi-agent orchestration layer
 * (Octopus-Studio Implementation Guide v1.1, §12 / §12a / §26).
 *
 * Dependency-free so the orchestrator (main process) and any worker can import
 * these without pulling in Electron, DB, or the AI SDK.
 */

export interface TokenBudget {
  /** Max input tokens an agent may consume (context_budget). */
  contextBudget: number;
  /** Max output tokens an agent may produce (output_budget). */
  outputBudget: number;
  /** Max model calls an agent may make (execution_budget). */
  executionBudget: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Number of model calls (LLM roundtrips / steps). */
  modelCalls: number;
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  modelCalls: 0,
};

/**
 * A task-level accumulator that tracks usage against a single agent's budget.
 * Accumulation is intentional: retries re-read context, and the budget bounds
 * *spend*, not *unique* tokens (doc §21).
 */
export class TokenUsageAccumulator {
  private usage: TokenUsage = { ...EMPTY_USAGE };

  constructor(private readonly budget: TokenBudget) {}

  get used(): Readonly<TokenUsage> {
    return this.usage;
  }

  record(partial: Partial<TokenUsage>): void {
    this.usage.inputTokens += partial.inputTokens ?? 0;
    this.usage.outputTokens += partial.outputTokens ?? 0;
    this.usage.modelCalls += partial.modelCalls ?? 0;
  }

  get exceeded(): boolean {
    return (
      this.usage.inputTokens > this.budget.contextBudget ||
      this.usage.outputTokens > this.budget.outputBudget ||
      this.usage.modelCalls > this.budget.executionBudget
    );
  }

  get remaining(): TokenUsage {
    return {
      inputTokens: Math.max(0, this.budget.contextBudget - this.usage.inputTokens),
      outputTokens: Math.max(0, this.budget.outputBudget - this.usage.outputTokens),
      modelCalls: Math.max(0, this.budget.executionBudget - this.usage.modelCalls),
    };
  }
}

/**
 * Aggregate ceiling above the per-task budgets, so a DAG can't fail slowly
 * across many small retries (doc §12a).
 */
export interface DagBudget {
  totalTokenCeiling: number;
  totalRetryCeiling: number;
  usedTokens: number;
  usedRetries: number;
}

export type DagBudgetExhausted = "token-ceiling" | "retry-ceiling";

/**
 * Charge `tokens` (and optionally a retry) against the DAG ceiling. Returns
 * which ceiling was exceeded, or null while the DAG is still within budget.
 */
export function chargeDagBudget(
  budget: DagBudget,
  tokens: number,
  isRetry = false,
): DagBudgetExhausted | null {
  budget.usedTokens += tokens;
  if (isRetry) budget.usedRetries += 1;
  if (budget.usedTokens > budget.totalTokenCeiling) return "token-ceiling";
  if (budget.usedRetries > budget.totalRetryCeiling) return "retry-ceiling";
  return null;
}
