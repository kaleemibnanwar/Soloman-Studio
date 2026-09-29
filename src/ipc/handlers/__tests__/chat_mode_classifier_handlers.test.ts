// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  generateText: vi.fn(),
  resolveBuiltinModelAlias: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcMain: undefined,
}));

vi.mock("electron-log", () => ({
  default: { scope: () => mocks.logger },
}));

vi.mock("../../main/settings", () => ({
  readSettings: mocks.readSettings,
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    responses: (apiName: string) => ({ apiName }),
  }),
}));

vi.mock("../utils/test_fetch_override", () => ({
  getTestFetchOption: () => ({}),
}));

vi.mock("../shared/remote_language_model_catalog", () => ({
  resolveBuiltinModelAlias: mocks.resolveBuiltinModelAlias,
}));

const { getRegisteredHandlerForTesting } = await import("../base");
const { chatContracts } = await import("../../types/chat");
const { registerChatModeClassifierHandlers } = await import("../chat_mode_classifier_handlers");

registerChatModeClassifierHandlers();

const classifyMode = getRegisteredHandlerForTesting(chatContracts.classifyMode.channel);

describe("chat mode classifier handler", () => {
  beforeEach(() => {
    mocks.readSettings.mockReset();
    mocks.readSettings.mockResolvedValue({
      providerSettings: { auto: { apiKey: { value: "test-api-key" } } },
    });
    mocks.resolveBuiltinModelAlias.mockReset();
    mocks.resolveBuiltinModelAlias.mockResolvedValue({
      providerId: "openai",
      apiName: "gpt-5-nano",
    });
    mocks.generateText.mockReset();
    mocks.logger.warn.mockReset();
    mocks.logger.error.mockReset();
  });

  it.each([
    ["ASK", "ask"],
    ["ask", "ask"],
    ["BUILD", "build"],
    ["AGENT", "local-agent"],
  ])("maps model output %s to mode %s", async (modelOutput, expectedMode) => {
    mocks.generateText.mockResolvedValue({ text: modelOutput });

    await expect(classifyMode({} as never, { prompt: "why is this broken?" })).resolves.toEqual({
      mode: expectedMode,
    });
  });

  it("falls back to null on unparseable model output", async () => {
    mocks.generateText.mockResolvedValue({ text: "unsure" });

    await expect(classifyMode({} as never, { prompt: "do something" })).resolves.toEqual({
      mode: null,
    });
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it("falls back to null when the model call throws", async () => {
    mocks.generateText.mockRejectedValue(new Error("network error"));

    await expect(classifyMode({} as never, { prompt: "do something" })).resolves.toEqual({
      mode: null,
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("falls back to null when the alias does not resolve to OpenAI", async () => {
    mocks.resolveBuiltinModelAlias.mockResolvedValue({
      providerId: "anthropic",
      apiName: "claude",
    });

    await expect(classifyMode({} as never, { prompt: "do something" })).resolves.toEqual({
      mode: null,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("truncates an overly long prompt before classifying", async () => {
    mocks.generateText.mockResolvedValue({ text: "BUILD" });
    const longPrompt = "a".repeat(5000);

    await classifyMode({} as never, { prompt: longPrompt });

    const call = mocks.generateText.mock.calls[0][0];
    expect(call.prompt.length).toBeLessThanOrEqual(1000);
  });
});
