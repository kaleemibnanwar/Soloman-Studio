import { ipc } from "@/ipc/types";
import type { ChatMode } from "./schemas";

const CLASSIFY_CLIENT_TIMEOUT_MS = 1500;

/**
 * Auto-classifies a first-message prompt into a chat mode using a cheap
 * model, so the UI can skip the "always defaults to build" behavior.
 * Never throws and never blocks the send path for long: any failure or
 * slow round-trip resolves to `null`, and callers must fall back to
 * today's default-resolution behavior in that case.
 */
export async function classifyChatModeIfNeeded(
  prompt: string,
): Promise<ChatMode | null> {
  if (!prompt.trim()) {
    return null;
  }

  try {
    const result = await Promise.race([
      ipc.chat.classifyMode({ prompt }),
      new Promise<{ mode: null }>((resolve) =>
        setTimeout(() => resolve({ mode: null }), CLASSIFY_CLIENT_TIMEOUT_MS),
      ),
    ]);
    return result.mode;
  } catch {
    return null;
  }
}
