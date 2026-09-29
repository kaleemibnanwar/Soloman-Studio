import type { LargeLanguageModel, UserSettings } from "@/lib/schemas";
import type { AgentRole } from "./task_types";

/**
 * Per-role model-tier selection — the orchestration plan's biggest cost lever.
 *
 * Read-only roles (explore / review) don't need a frontier reasoning model to
 * do their job, so they run on the user's lightweight `routerModel` (the same
 * "cheap classifier" concept already configured in Settings). Heavy roles that
 * write code or debug keep the primary model.
 *
 * Provider-agnostic by construction: the chosen tier is just a
 * `LargeLanguageModel` handed to `getModelClient`, so Ollama, DeepSeek, GPT,
 * Claude, Gemini, Vertex, Bedrock, LM Studio, and custom OpenAI-compatible
 * providers all work identically. If no `routerModel` is configured, the
 * primary model is used (no behavior change).
 */

export type AgentModelTier = "fast" | "strong";

const FAST_ROLES: ReadonlySet<AgentRole> = new Set([
  "explorer",
  "reviewer",
  "verifier",
  "tester", // runs tests + parses results; no reasoning-heavy code generation
]);

export function getAgentModelTier(role: AgentRole): AgentModelTier {
  return FAST_ROLES.has(role) ? "fast" : "strong";
}

export function resolveAgentRoleModel({
  role,
  settings,
  selectedModel,
}: {
  role: AgentRole;
  settings: UserSettings;
  selectedModel: LargeLanguageModel;
}): LargeLanguageModel {
  if (getAgentModelTier(role) === "fast" && settings.routerModel) {
    return settings.routerModel;
  }
  return selectedModel;
}
