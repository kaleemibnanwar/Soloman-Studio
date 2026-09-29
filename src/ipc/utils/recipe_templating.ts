/**
 * Recipe parameterization/templating.
 *
 * Ports the office-template placeholder pattern (collectPlaceholders /
 * applyPlaceholders in agent_tools.ts) to recipe steps, so a saved recipe's
 * literal args can carry `[placeholder]` slots that get filled with different
 * values on replay. This unlocks category-(a) reuse: repeatable tool sequences
 * whose values differ across posting/form-filling flows ("post to X" for one
 * account vs another) without storing a separate recipe per value.
 */

import type { RecipeStep } from "../../main/octolimb_recipes";

export type RecipeSlotValues = Record<string, string>;

/** Collect the unique `[...]` placeholder tokens found anywhere in step args. */
export function collectRecipeSlots(steps: Array<{ args: Record<string, unknown> }>): string[] {
  const out: string[] = [];
  const collect = (value: unknown): void => {
    if (value == null) return;
    if (typeof value === "string") {
      const matches = value.match(/\[[^\]]+\]/g);
      if (matches) {
        for (const m of matches) {
          if (!out.includes(m)) out.push(m);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) collect(v);
      return;
    }
    if (typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) {
        collect(v);
      }
    }
  };
  for (const step of steps) collect(step.args);
  return out;
}

/**
 * Deep-clone steps and replace every occurrence of each placeholder key
 * (e.g. `"[post title]"`) with its mapped text, mirroring the office-template
 * applyPlaceholders semantics. Keys are the literal placeholder strings
 * returned by collectRecipeSlots.
 */
export function applyRecipeSlots(steps: RecipeStep[], values: RecipeSlotValues): RecipeStep[] {
  const fill = (value: unknown): unknown => {
    if (value == null) return value;
    if (typeof value === "string") {
      let s = value;
      for (const [k, v] of Object.entries(values)) {
        if (k) s = s.split(k).join(v);
      }
      return s;
    }
    if (Array.isArray(value)) return value.map(fill);
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = fill(v);
      }
      return result;
    }
    return value;
  };
  return steps.map((step) => ({
    ...step,
    args: fill(step.args) as Record<string, unknown>,
  }));
}
