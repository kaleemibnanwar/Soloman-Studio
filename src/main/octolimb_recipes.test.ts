import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setDatabaseForTesting } from "@/db";
import { createInMemoryTestDb, type TestDb } from "@/testing/test_db";
import {
  computeFingerprint,
  getRecipeByFingerprint,
  listRecipesForDomain,
  upsertRecipe,
  recordRecipeOutcome,
} from "./octolimb_recipes";

let db: TestDb;

beforeEach(() => {
  db = createInMemoryTestDb();
  setDatabaseForTesting(db);
});

afterEach(() => {
  db.$client.close();
  setDatabaseForTesting(null);
});

describe("octolimb_recipes", () => {
  it("fingerprints are stable across trivial phrasing differences", () => {
    expect(computeFingerprint("Post on X", "x.com")).toBe(computeFingerprint("post on x", "x.com"));
    expect(computeFingerprint("post on x", "x.com")).not.toBe(
      computeFingerprint("post on x", "reddit.com"),
    );
  });

  it("saves and looks up a recipe by fingerprint", () => {
    const steps = [
      { tool: "go_to_url", args: { url: "https://x.com" } },
      { tool: "click_element", args: { index: 3, xpath: "//button[1]" } },
    ];
    const fingerprint = upsertRecipe({ instruction: "post something", domain: "x.com", steps });

    const recipe = getRecipeByFingerprint(fingerprint);
    expect(recipe).toBeDefined();
    expect(recipe?.steps).toEqual(steps);
    expect(recipe?.successCount).toBe(1);
    expect(recipe?.failureCount).toBe(0);
  });

  it("returns undefined for an unknown fingerprint", () => {
    expect(getRecipeByFingerprint("does-not-exist")).toBeUndefined();
  });

  it("overwrites an existing recipe's steps on a fresh successful save", () => {
    const first = upsertRecipe({
      instruction: "post something",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com" } }],
    });
    const second = upsertRecipe({
      instruction: "post something",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com/compose" } }],
    });

    expect(second).toBe(first);
    const recipe = getRecipeByFingerprint(first);
    expect(recipe?.steps).toEqual([{ tool: "go_to_url", args: { url: "https://x.com/compose" } }]);
  });

  it("tracks success/failure counts across replays", () => {
    const fingerprint = upsertRecipe({
      instruction: "post something",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com" } }],
    });

    recordRecipeOutcome(fingerprint, true);
    recordRecipeOutcome(fingerprint, false);
    recordRecipeOutcome(fingerprint, true);

    const recipe = getRecipeByFingerprint(fingerprint);
    expect(recipe?.successCount).toBe(3); // 1 from the initial save + 2 successful replays
    expect(recipe?.failureCount).toBe(1);
  });

  it("recording an outcome for an unknown fingerprint is a no-op", () => {
    expect(() => recordRecipeOutcome("does-not-exist", true)).not.toThrow();
  });

  it("lists every recipe saved for a domain, without steps, for the model to pick from", () => {
    upsertRecipe({
      instruction: "post a tweet about the launch",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com/compose" } }],
    });
    upsertRecipe({
      instruction: "check notifications",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com/notifications" } }],
    });

    const recipes = listRecipesForDomain("x.com");
    expect(recipes).toHaveLength(2);
    expect(recipes.map((r) => r.instruction).sort()).toEqual(
      ["check notifications", "post a tweet about the launch"].sort(),
    );
    // Summaries are for the model to choose from, not to replay directly —
    // steps come back later from run_recipe once a fingerprint is chosen.
    expect(recipes[0]).not.toHaveProperty("steps");
  });

  it("only lists recipes for the matching domain, case/whitespace-insensitively", () => {
    upsertRecipe({
      instruction: "post a tweet",
      domain: "X.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com/compose" } }],
    });
    upsertRecipe({
      instruction: "post on reddit",
      domain: "reddit.com",
      steps: [{ tool: "go_to_url", args: { url: "https://reddit.com/submit" } }],
    });

    expect(listRecipesForDomain(" x.com ")).toHaveLength(1);
    expect(listRecipesForDomain("reddit.com")).toHaveLength(1);
    expect(listRecipesForDomain("unrelated.com")).toEqual([]);
  });

  it("ranks recipes by success count, most reliable first", () => {
    const flaky = upsertRecipe({
      instruction: "task a",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com/a" } }],
    });
    upsertRecipe({
      instruction: "task b",
      domain: "x.com",
      steps: [{ tool: "go_to_url", args: { url: "https://x.com/b" } }],
    });
    recordRecipeOutcome(flaky, true);
    recordRecipeOutcome(flaky, true);

    const recipes = listRecipesForDomain("x.com");
    expect(recipes[0].instruction).toBe("task a");
  });
});
