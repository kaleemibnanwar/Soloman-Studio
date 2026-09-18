import { describe, expect, it } from "vitest";
import {
  TokenUsageAccumulator,
  chargeDagBudget,
  type DagBudget,
} from "./agent_budget";

describe("TokenUsageAccumulator", () => {
  it("accumulates usage and reports exceeded", () => {
    const acc = new TokenUsageAccumulator({
      contextBudget: 1000,
      outputBudget: 500,
      executionBudget: 3,
    });
    acc.record({ inputTokens: 600, outputTokens: 200, modelCalls: 1 });
    expect(acc.exceeded).toBe(false);
    acc.record({ inputTokens: 500, modelCalls: 2 });
    expect(acc.exceeded).toBe(true); // input 1100 > 1000
    expect(acc.used.inputTokens).toBe(1100);
  });

  it("reports remaining budget", () => {
    const acc = new TokenUsageAccumulator({
      contextBudget: 1000,
      outputBudget: 500,
      executionBudget: 3,
    });
    acc.record({ inputTokens: 400, outputTokens: 100, modelCalls: 1 });
    expect(acc.remaining).toEqual({
      inputTokens: 600,
      outputTokens: 400,
      modelCalls: 2,
    });
  });

  it("reports exceeded on the call budget", () => {
    const acc = new TokenUsageAccumulator({
      contextBudget: 1000,
      outputBudget: 500,
      executionBudget: 2,
    });
    acc.record({ modelCalls: 3 });
    expect(acc.exceeded).toBe(true);
  });
});

describe("chargeDagBudget", () => {
  function dag(): DagBudget {
    return { totalTokenCeiling: 100, totalRetryCeiling: 2, usedTokens: 0, usedRetries: 0 };
  }

  it("charges tokens and reports the token ceiling", () => {
    const budget = dag();
    expect(chargeDagBudget(budget, 50)).toBeNull();
    expect(chargeDagBudget(budget, 60)).toBe("token-ceiling");
    expect(budget.usedTokens).toBe(110);
  });

  it("charges retries and reports the retry ceiling", () => {
    const budget = dag();
    expect(chargeDagBudget(budget, 10, true)).toBeNull();
    expect(chargeDagBudget(budget, 10, true)).toBeNull();
    expect(chargeDagBudget(budget, 10, true)).toBe("retry-ceiling");
    expect(budget.usedRetries).toBe(3);
  });
});
