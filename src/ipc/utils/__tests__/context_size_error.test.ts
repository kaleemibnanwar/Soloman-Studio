import { describe, expect, it } from "vitest";
import { friendlyContextExceededMessage } from "../context_size_error";

describe("friendlyContextExceededMessage", () => {
  it("maps an Ollama exceed_context_size error into actionable guidance", () => {
    const raw = JSON.stringify({
      error: {
        code: 400,
        message:
          "request (62120 tokens) exceeds the available context size (4096 tokens), try increasing it",
        type: "exceed_context_size_error",
        n_prompt_tokens: 62120,
        n_ctx: 4096,
      },
    });
    const message = friendlyContextExceededMessage(raw);
    expect(message).toContain("context window is too small");
    expect(message).toContain("62120 tokens requested, but the model only allows 4096");
    expect(message).toContain("num_ctx 32768");
  });

  it("maps a generic maximum-context-length error", () => {
    const message = friendlyContextExceededMessage(
      "This model's maximum context length is 4096 tokens.",
    );
    expect(message).toContain("context window is too small");
  });

  it("returns null for unrelated errors so the raw error surfaces unchanged", () => {
    expect(friendlyContextExceededMessage("invalid API key")).toBeNull();
    expect(friendlyContextExceededMessage("connection refused")).toBeNull();
  });
});
