import { createTypedHandler } from "../handlers/base";
import { agentContracts } from "../types/agent";
import { AGENT_TOOL_REGISTRY } from "./tool_registry";
import { readEffectiveSettings, writeSettings } from "../../main/settings";
import type { AgentToolConsent } from "../../lib/schemas";

export function registerAgentToolHandlers() {
  createTypedHandler(agentContracts.getTools, async () => {
    const settings = await readEffectiveSettings();
    const storedConsents = settings.agentToolConsents ?? {};
    return AGENT_TOOL_REGISTRY.map((tool) => ({
      ...tool,
      consent:
        storedConsents[tool.name] ??
        ((tool.isAllowedByDefault ? "always" : "ask") satisfies AgentToolConsent),
    }));
  });

  createTypedHandler(agentContracts.setConsent, async (_, params) => {
    const settings = await readEffectiveSettings();
    writeSettings({
      agentToolConsents: {
        ...settings.agentToolConsents,
        [params.toolName]: params.consent,
      },
    });
  });
}
