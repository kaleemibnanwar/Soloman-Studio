/**
 * Maps raw provider errors into friendly, actionable messages for context-window
 * overflows — the most common failure with local models (Ollama, LM Studio,
 * llama.cpp), whose default context is far smaller than what this app sends.
 * Kept dependency-free so it can be unit-tested in isolation.
 */

/**
 * Return a friendly message when `raw` is a context-window overflow, otherwise
 * null (so the caller can surface the raw error unchanged).
 */
export function friendlyContextExceededMessage(raw: string): string | null {
  const lower = raw.toLowerCase();
  const isContextExceeded =
    lower.includes("exceed_context_size") ||
    lower.includes("exceeds the available context size") ||
    lower.includes("maximum context length") ||
    lower.includes("context_length_exceeded") ||
    lower.includes("exceeds context");
  if (!isContextExceeded) return null;

  const promptTokens = /n_prompt_tokens"?\s*[:=]\s*(\d+)/.exec(raw)?.[1];
  const nCtx = /n_ctx"?\s*[:=]\s*(\d+)/.exec(raw)?.[1];
  const sizes =
    promptTokens && nCtx
      ? ` (${promptTokens} tokens requested, but the model only allows ${nCtx})`
      : "";

  return (
    `The model's context window is too small for this request${sizes}. ` +
    "For Ollama, raise it with `ollama run <model>` then `/set parameter num_ctx 32768`, " +
    "or start Ollama with `OLLAMA_CONTEXT_LENGTH=32768` (or higher). " +
    "Alternatively, enable Economy mode or start a new chat to send less context."
  );
}
