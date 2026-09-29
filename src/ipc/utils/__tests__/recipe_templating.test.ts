import { describe, it, expect } from "vitest";
import { applyRecipeSlots, collectRecipeSlots } from "../recipe_templating";

describe("recipe_templating", () => {
  const steps = [
    {
      tool: "input_text",
      args: { index: 1, text: "Hello [name], welcome to [site]" },
    },
    { tool: "input_text", args: { index: 2, text: "Posted to [site]" } },
  ];

  it("collects unique [placeholder] tokens from step args", () => {
    expect(collectRecipeSlots(steps)).toEqual(["[name]", "[site]"]);
  });

  it("fills placeholders on replay without mutating the original steps", () => {
    const filled = applyRecipeSlots(steps, {
      "[name]": "Ada",
      "[site]": "Example",
    });
    expect(filled[0].args.text).toBe("Hello Ada, welcome to Example");
    expect(filled[1].args.text).toBe("Posted to Example");
    // Original steps unchanged.
    expect(steps[0].args.text).toBe("Hello [name], welcome to [site]");
  });
});
