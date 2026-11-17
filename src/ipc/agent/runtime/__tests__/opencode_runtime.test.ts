import type { LanguageModel } from "ai";
import { afterEach, describe, expect, it } from "vitest";

import { buildOpenCodePermissionRules, canUseOpenCodeRuntime } from "../opencode_policy";

const originalRuntime = process.env.OCTOPUS_STUDIO_AGENT_RUNTIME;

afterEach(() => {
  if (originalRuntime === undefined) delete process.env.OCTOPUS_STUDIO_AGENT_RUNTIME;
  else process.env.OCTOPUS_STUDIO_AGENT_RUNTIME = originalRuntime;
});

function model(version: "v2" | "v3"): LanguageModel {
  return { specificationVersion: version } as LanguageModel;
}

describe("OpenCode runtime selection", () => {
  it("uses OpenCode for a compatible coding task", () => {
    expect(canUseOpenCodeRuntime({ model: model("v3") })).toBe(true);
  });

  it("uses OpenCode when toolAllowlist contains native supported tools", () => {
    expect(
      canUseOpenCodeRuntime({
        model: model("v3"),
        toolAllowlist: ["read_file", "write_file", "search_replace", "run_command", "grep"],
      }),
    ).toBe(true);
  });

  it("keeps specialized Soloman tools and MCP tasks on the legacy runtime", () => {
    expect(canUseOpenCodeRuntime({ model: model("v3"), requestedMcpServers: ["browser"] })).toBe(
      false,
    );
    expect(canUseOpenCodeRuntime({ model: model("v3"), toolAllowlist: ["read_office_file"] })).toBe(
      false,
    );
  });

  it("falls back for old AI SDK models and supports the emergency override", () => {
    expect(canUseOpenCodeRuntime({ model: model("v2") })).toBe(false);
    process.env.OCTOPUS_STUDIO_AGENT_RUNTIME = "legacy";
    expect(canUseOpenCodeRuntime({ model: model("v3") })).toBe(false);
  });
});

describe("OpenCode permission boundary", () => {
  it("keeps scoped tasks inside their deterministic DAG file boundary", () => {
    const rules = buildOpenCodePermissionRules({
      role: "executor",
      workspacePath: "/workspace",
      allowedFiles: ["src/feature"],
    });

    expect(rules).toContainEqual({ action: "*", resource: "*", effect: "deny" });
    expect(rules).toContainEqual({
      action: "read",
      resource: "/workspace/src/feature",
      effect: "allow",
    });
    expect(rules).toContainEqual({
      action: "edit",
      resource: "/workspace/src/feature/*",
      effect: "ask",
    });
    expect(rules.some((rule) => rule.action === "shell" && rule.effect !== "deny")).toBe(false);
  });

  it("asks through Soloman consent for unscoped edits and shell commands", () => {
    const rules = buildOpenCodePermissionRules({
      role: "debugger",
      workspacePath: "/workspace",
      allowedFiles: null,
    });

    expect(rules).toContainEqual({ action: "edit", resource: "*", effect: "ask" });
    expect(rules).toContainEqual({ action: "shell", resource: "*", effect: "ask" });
    expect(rules).toContainEqual({
      action: "external_directory",
      resource: "*",
      effect: "deny",
    });
  });
});
