import { describe, expect, it } from "vitest";
import {
  getPersonaByKey,
  listAvailablePersonas,
  recommendPersonasForObjective,
  synthesizeDomainPersona,
} from "../persona_library";

describe("persona_library", () => {
  it("provides built-in personas with rich domain tradecraft prompts", () => {
    const prospector = getPersonaByKey("lead_prospector");
    expect(prospector).toBeDefined();
    expect(prospector?.name).toBe("Web Scout");
    expect(prospector?.systemPrompt).toContain("Ideal Customer Profile");
    expect(prospector?.systemPrompt).toContain("discard generic role-based inboxes");
    expect(prospector?.targetMcpCategories).toContain("apollo");

    const communicator = getPersonaByKey("commercial_communicator");
    expect(communicator).toBeDefined();
    expect(communicator?.name).toBe("Commercial Communicator");
    expect(communicator?.systemPrompt).toContain("90–120 words");
    expect(communicator?.systemPrompt).toContain("Human-in-the-Loop Protocol");

    const steward = getPersonaByKey("code_steward");
    expect(steward?.systemPrompt).toContain("Surgical Precision");

    const qa = getPersonaByKey("qa_sentinel");
    expect(qa?.systemPrompt).toContain("Trust but Verify");
  });

  it("lists all available personas", () => {
    const list = listAvailablePersonas();
    expect(list.length).toBeGreaterThanOrEqual(4);
    const keys = list.map((p) => p.key);
    expect(keys).toContain("lead_prospector");
    expect(keys).toContain("commercial_communicator");
    expect(keys).toContain("code_steward");
    expect(keys).toContain("qa_sentinel");
  });

  it("synthesizes custom domain personas on the fly", () => {
    const custom = synthesizeDomainPersona("Audit for GDPR privacy compliance", "GDPR Auditor");
    expect(custom.name).toBe("GDPR Auditor");
    expect(custom.key).toBe("custom_gdpr_auditor");
    expect(custom.systemPrompt).toContain("Audit for GDPR privacy compliance");
  });

  it("recommends a minimal specialist roster and always includes QA", () => {
    expect(
      recommendPersonasForObjective("Find CTO leads and draft outreach").map((p) => p.key),
    ).toEqual(["lead_prospector", "commercial_communicator", "qa_sentinel"]);
    expect(recommendPersonasForObjective("Refactor the TypeScript app").map((p) => p.key)).toEqual([
      "code_steward",
      "qa_sentinel",
    ]);
  });
});
