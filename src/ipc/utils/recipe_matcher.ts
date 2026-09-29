/**
 * Domain-agnostic recipe matching, lifted out of the OctoLimb MCP server.
 *
 * The recipe store (octolimb_task_recipes) treats `domain` as a free-form
 * namespace, so "have I done this before?" is not inherently browser-only:
 * this module exposes the same lookup to the unified tool dispatch for any
 * tool call — builtin, office, or generic user MCP — by simply using a task
 * namespace instead of a site domain.
 */

import {
  getRecipeByFingerprint,
  listRecipesForDomain,
  type OctoLimbRecipe,
  type RecipeSummary,
} from "../../main/octolimb_recipes";

export type { RecipeSummary } from "../../main/octolimb_recipes";

/**
 * List saved trajectories for a task namespace (a site domain for browser
 * tasks, or a tool/task category such as "write_file" / "office" / "git"
 * otherwise). Returns compact summaries (instruction + fingerprint + outcome
 * counts), most reliable first.
 */
export function searchRecipes(namespace: string): RecipeSummary[] {
  return listRecipesForDomain(namespace);
}

/** Fetch one saved trajectory's full step list by fingerprint. */
export function getRecipeSteps(fingerprint: string): OctoLimbRecipe | undefined {
  return getRecipeByFingerprint(fingerprint);
}
