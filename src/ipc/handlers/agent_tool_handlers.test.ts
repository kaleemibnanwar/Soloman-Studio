// @vitest-environment node
//
// Handler-level tests for the built-in agent tools registry/consent IPC
// surface. `agentContracts.getTools`/`setConsent` previously returned `[]`
// and no-op'd; these tests guard against that regression.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (event: unknown, input: unknown) => unknown>(),
  readEffectiveSettings: vi.fn(),
  writeSettings: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, input: unknown) => unknown) => {
      mocks.ipcHandlers.set(channel, handler);
    },
  },
}));

vi.mock("../../main/settings", () => ({
  readEffectiveSettings: mocks.readEffectiveSettings,
  writeSettings: mocks.writeSettings,
}));

import { unwrapIpcEnvelope, isIpcInvokeEnvelope } from "@/ipc/contracts/core";
import { configureTrustedRenderer } from "@/ipc/utils/renderer_security";
import { agentContracts } from "../types/agent";
import { AGENT_TOOL_REGISTRY } from "../utils/agent_tool_registry";
import { registerAgentToolHandlers } from "./agent_tool_handlers";

configureTrustedRenderer({
  devServerUrl: "http://localhost:5173",
  packagedRendererUrl: "file:///app/renderer/main_window/index.html",
});

const rendererFrame = { url: "http://localhost:5173/" };
const rendererEvent = {
  sender: { mainFrame: rendererFrame },
  senderFrame: rendererFrame,
};

async function invoke(channel: string, input: unknown) {
  const handler = mocks.ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  const response = await handler(rendererEvent as never, input);
  return isIpcInvokeEnvelope(response) ? unwrapIpcEnvelope(response) : response;
}

describe("agent tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ipcHandlers.clear();
    mocks.readEffectiveSettings.mockResolvedValue({});
    registerAgentToolHandlers();
  });

  it("returns every registered built-in tool with a default consent", async () => {
    const tools = (await invoke(agentContracts.getTools.channel, undefined)) as Array<{
      name: string;
      isAllowedByDefault: boolean;
      consent: string;
    }>;

    expect(tools.length).toBe(AGENT_TOOL_REGISTRY.length);
    const readFile = tools.find((t) => t.name === "read_file")!;
    expect(readFile.isAllowedByDefault).toBe(true);
    expect(readFile.consent).toBe("always");

    const writeFile = tools.find((t) => t.name === "write_file")!;
    expect(writeFile.isAllowedByDefault).toBe(false);
    expect(writeFile.consent).toBe("ask");
  });

  it("reflects a stored consent instead of the default", async () => {
    mocks.readEffectiveSettings.mockResolvedValue({
      agentToolConsents: { write_file: "never" },
    });

    const tools = (await invoke(agentContracts.getTools.channel, undefined)) as Array<{
      name: string;
      consent: string;
    }>;

    expect(tools.find((t) => t.name === "write_file")!.consent).toBe("never");
  });

  it("persists a new consent by merging into existing settings", async () => {
    mocks.readEffectiveSettings.mockResolvedValue({
      agentToolConsents: { write_file: "ask" },
    });

    await invoke(agentContracts.setConsent.channel, {
      toolName: "search_replace",
      consent: "always",
    });

    expect(mocks.writeSettings).toHaveBeenCalledWith({
      agentToolConsents: { write_file: "ask", search_replace: "always" },
    });
  });
});
