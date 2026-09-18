import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { octolimbTaskRecipes } from "../db/schema";

export type RecipeStep = { tool: string; args: Record<string, unknown> };

export type OctoLimbRecipe = {
  fingerprint: string;
  domain: string;
  instruction: string;
  steps: RecipeStep[];
  successCount: number;
  failureCount: number;
};

/**
 * Recipes are looked up by (normalized instruction + starting domain), not
 * by exact string — trims whitespace/case so trivial phrasing differences
 * ("Post on X" vs "post on x") still hit the same cached trajectory.
 */
export function computeFingerprint(instruction: string, domain: string): string {
  const normalized = `${instruction.trim().toLowerCase().replace(/\s+/g, " ")}|${domain.trim().toLowerCase()}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function getRecipeByFingerprint(fingerprint: string): OctoLimbRecipe | undefined {
  const row = getDb()
    .select()
    .from(octolimbTaskRecipes)
    .where(eq(octolimbTaskRecipes.fingerprint, fingerprint))
    .get();
  if (!row) return undefined;
  return {
    fingerprint: row.fingerprint,
    domain: row.domain,
    instruction: row.instruction,
    steps: row.steps,
    successCount: row.successCount,
    failureCount: row.failureCount,
  };
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export type RecipeSummary = {
  fingerprint: string;
  instruction: string;
  successCount: number;
  failureCount: number;
  lastUsedAt: Date | null;
};

// A domain rarely accumulates more than a handful of distinct saved tasks;
// cap generously so a runaway domain can't blow up the find_recipe response.
const MAX_RECIPES_PER_DOMAIN = 20;

/**
 * Lists every recipe saved for `domain`, most reliable/recently-used
 * first, as compact summaries (no `steps` — those are fetched separately
 * via run_recipe once a fingerprint is chosen). The model reads the
 * instructions and picks whichever one actually matches the current task,
 * the same way it'd pick a document out of retrieved search results —
 * cheaper and more reliable than trying to replicate that judgment with a
 * string-similarity heuristic on our end.
 *
 * Filters, sorts, and limits in SQL rather than pulling every row (steps
 * JSON included) into JS to filter — this used to `select()` the full
 * table, deserializing every recipe's step list on every call just to
 * throw it away, for every domain, not only the one being asked about.
 */
export function listRecipesForDomain(domain: string): RecipeSummary[] {
  const normalizedDomain = normalizeDomain(domain);
  return getDb()
    .select({
      fingerprint: octolimbTaskRecipes.fingerprint,
      instruction: octolimbTaskRecipes.instruction,
      successCount: octolimbTaskRecipes.successCount,
      failureCount: octolimbTaskRecipes.failureCount,
      lastUsedAt: octolimbTaskRecipes.lastUsedAt,
    })
    .from(octolimbTaskRecipes)
    // `domain` is stored as given by the model (see upsertRecipe), not
    // normalized, so compare case/whitespace-insensitively via a SQL
    // expression rather than an exact-column match.
    .where(sql`lower(trim(${octolimbTaskRecipes.domain})) = ${normalizedDomain}`)
    .orderBy(desc(octolimbTaskRecipes.successCount), desc(octolimbTaskRecipes.lastUsedAt))
    .limit(MAX_RECIPES_PER_DOMAIN)
    .all();
}

/** Insert a new recipe, or overwrite an existing one's steps (a fresh successful run supersedes a stale trajectory). */
export function upsertRecipe(params: {
  instruction: string;
  domain: string;
  steps: RecipeStep[];
}): string {
  const fingerprint = computeFingerprint(params.instruction, params.domain);
  const db = getDb();
  const existing = db
    .select({ id: octolimbTaskRecipes.id })
    .from(octolimbTaskRecipes)
    .where(eq(octolimbTaskRecipes.fingerprint, fingerprint))
    .get();

  if (existing) {
    db.update(octolimbTaskRecipes)
      .set({
        steps: params.steps,
        successCount: 1,
        failureCount: 0,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(octolimbTaskRecipes.fingerprint, fingerprint))
      .run();
  } else {
    db.insert(octolimbTaskRecipes)
      .values({
        fingerprint,
        domain: params.domain,
        instruction: params.instruction,
        steps: params.steps,
        successCount: 1,
        lastUsedAt: new Date(),
      })
      .run();
  }
  return fingerprint;
}

/** Bump the staleness signal after a replay attempt: full success vs. bailing out partway. */
export function recordRecipeOutcome(fingerprint: string, success: boolean): void {
  const db = getDb();
  const existing = db
    .select()
    .from(octolimbTaskRecipes)
    .where(eq(octolimbTaskRecipes.fingerprint, fingerprint))
    .get();
  if (!existing) return;
  db.update(octolimbTaskRecipes)
    .set({
      successCount: success ? existing.successCount + 1 : existing.successCount,
      failureCount: success ? existing.failureCount : existing.failureCount + 1,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(octolimbTaskRecipes.fingerprint, fingerprint))
    .run();
}
