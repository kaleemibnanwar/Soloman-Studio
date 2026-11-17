import path from "node:path";

import type { LanguageModel } from "ai";

import type { AgentRole } from "../task_types";

export function isLanguageModelV3(
  model: LanguageModel,
): model is Extract<LanguageModel, { specificationVersion: "v3" }> {
  return (
    typeof model === "object" &&
    model !== null &&
    "specificationVersion" in model &&
    model.specificationVersion === "v3"
  );
}

const OPENCODE_SUPPORTED_TOOLS = new Set([
  "read_file",
  "write_file",
  "search_replace",
  "edit_file",
  "list_files",
  "directory_list",
  "grep",
  "code_search",
  "file_search",
  "find_by_name",
  "run_command",
  "shell",
  "exec",
  "build_type_check",
]);

export function canUseOpenCodeRuntime(input: {
  model: LanguageModel;
  requestedMcpServers?: string[];
  toolAllowlist?: string[] | null;
}): boolean {
  if (process.env.OCTOPUS_STUDIO_AGENT_RUNTIME === "legacy") return false;
  if (!isLanguageModelV3(input.model)) return false;
  if ((input.requestedMcpServers?.length ?? 0) > 0) return false;
  // If a tool allowlist is present, ensure all requested tools are supported by OpenCode's
  // native capabilities (files, search, edit, command execution, inspection).
  // Soloman-specific external tools (like office/browser/etc.) fall back to the legacy tool registry.
  if (input.toolAllowlist != null) {
    const isSupported = input.toolAllowlist.every((tool) => OPENCODE_SUPPORTED_TOOLS.has(tool));
    if (!isSupported) return false;
  }
  return true;
}

function roleCanEdit(role: AgentRole): boolean {
  return role === "executor" || role === "debugger";
}

function roleCanRunShell(role: AgentRole): boolean {
  return roleCanEdit(role) || role === "tester" || role === "verifier";
}

export function buildOpenCodePermissionRules(input: {
  allowedFiles?: string[] | null;
  role: AgentRole;
  workspacePath: string;
}) {
  const rules: Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }> = [
    { action: "*", resource: "*", effect: "deny" },
    { action: "question", resource: "*", effect: "deny" },
    { action: "subagent", resource: "*", effect: "deny" },
    { action: "external_directory", resource: "*", effect: "deny" },
  ];

  if (input.allowedFiles != null) {
    for (const entry of input.allowedFiles) {
      const absolute = path.resolve(input.workspacePath, entry);
      rules.push({ action: "read", resource: absolute, effect: "allow" });
      rules.push({ action: "read", resource: path.join(absolute, "*"), effect: "allow" });
      if (roleCanEdit(input.role)) {
        rules.push({ action: "edit", resource: absolute, effect: "ask" });
        rules.push({ action: "edit", resource: path.join(absolute, "*"), effect: "ask" });
      }
    }
    // Shell/glob/grep can escape a file-scoped task, so scoped runs stay on
    // explicit reads and edits. The deterministic DAG remains the authority.
    return rules;
  }

  rules.push(
    { action: "read", resource: "*", effect: "allow" },
    { action: "glob", resource: "*", effect: "allow" },
    { action: "grep", resource: "*", effect: "allow" },
    { action: "read", resource: "*.env", effect: "ask" },
    { action: "read", resource: "*.env.*", effect: "ask" },
    { action: "read", resource: "*.env.example", effect: "allow" },
  );
  if (roleCanEdit(input.role)) rules.push({ action: "edit", resource: "*", effect: "ask" });
  if (roleCanRunShell(input.role)) rules.push({ action: "shell", resource: "*", effect: "ask" });
  return rules;
}
