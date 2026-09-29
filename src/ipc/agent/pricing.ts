/**
 * Best-effort USD cost estimation for sub-agent token usage.
 *
 * The pricing table covers the most common models across the providers the
 * model client supports (OpenAI, Anthropic, Google, DeepSeek, …). It is a
 * coarse calibration, not an invoice: prices change, and provider-specific
 * pricing tiers (cached input, batch, etc.) are deliberately not modeled.
 *
 * Unknown models return `null` so callers render "—" rather than a wrong
 * number — the cost ledger must never report a made-up dollar figure.
 */

// [input USD per 1M tokens, output USD per 1M tokens]
const PRICE_PER_MILLION: Array<[matcher: string, input: number, output: number]> = [
  // OpenAI
  ["gpt-4.1-nano", 0.1, 0.4],
  ["gpt-4.1-mini", 0.4, 1.6],
  ["gpt-4o-mini", 0.15, 0.6],
  ["gpt-4.1", 2, 8],
  ["gpt-4o", 2.5, 10],
  ["o4-mini", 1.1, 4.4],
  ["o3-mini", 1.1, 4.4],
  ["o3", 2, 8],
  // Anthropic
  ["claude-opus", 15, 75],
  ["claude-sonnet", 3, 15],
  ["claude-haiku", 0.8, 4],
  // Google
  ["gemini-2.5-flash", 0.3, 2.5],
  ["gemini-2.0-flash", 0.1, 0.4],
  ["gemini-flash", 0.3, 2.5],
  ["gemini-2.5-pro", 1.25, 10],
  ["gemini-pro", 1.25, 5],
  // DeepSeek
  ["deepseek-reasoner", 0.55, 2.19],
  ["deepseek-chat", 0.27, 1.1],
  ["deepseek", 0.27, 1.1], // family fallback (deepseek-flash, -v3, etc.)
  // xAI
  ["grok-3-mini", 0.3, 0.5],
  ["grok-3", 3, 15],
  ["grok-2", 2, 10],
];

/** Longest-matcher-wins, so "gpt-4.1-mini" beats "gpt-4.1". */
export function estimateAgentCostUsd(
  modelName: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!modelName) return null;
  const name = modelName.toLowerCase();

  let best: { input: number; output: number } | null = null;
  let bestLen = 0;
  for (const [matcher, input, output] of PRICE_PER_MILLION) {
    if (name.includes(matcher) && matcher.length > bestLen) {
      best = { input, output };
      bestLen = matcher.length;
    }
  }

  if (!best) return null;
  const cost = (inputTokens / 1_000_000) * best.input + (outputTokens / 1_000_000) * best.output;
  // Round to a stable 4 decimal places to avoid float noise in the ledger.
  return Math.round(cost * 10_000) / 10_000;
}
