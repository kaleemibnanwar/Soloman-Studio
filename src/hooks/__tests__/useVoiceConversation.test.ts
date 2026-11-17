import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Message } from "@/ipc/types";
import { assistantTextForSpeech, useVoiceConversation } from "@/hooks/useVoiceConversation";

const voiceMocks = vi.hoisted(() => ({
  callbacks: null as null | {
    onTranscription: (text: string) => void;
    onTranscriptionComplete?: (text: string) => void;
    onError?: (message: string) => void;
  },
  startRecording: vi.fn(),
  cancelRecording: vi.fn(),
  stopSpeaking: vi.fn(),
  prepareNeuralSpeech: vi.fn(),
  synthesizeNeuralSpeech: vi.fn(),
}));

vi.mock("@/ipc/types", () => ({
  ipc: {
    system: {
      stopSpeaking: voiceMocks.stopSpeaking,
    },
  },
}));

vi.mock("@/lib/neuralSpeech", () => ({
  prepareNeuralSpeech: voiceMocks.prepareNeuralSpeech,
  synthesizeNeuralSpeech: voiceMocks.synthesizeNeuralSpeech,
}));

vi.mock("@/hooks/useVoiceToText", () => ({
  useVoiceToText: (callbacks: typeof voiceMocks.callbacks) => {
    voiceMocks.callbacks = callbacks;
    return {
      isRecording: true,
      isTranscribing: false,
      startRecording: voiceMocks.startRecording,
      cancelRecording: voiceMocks.cancelRecording,
    };
  },
}));

class MockUtterance {
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

describe("useVoiceConversation", () => {
  const cancel = vi.fn();
  const play = vi.fn();
  const pause = vi.fn();
  const createObjectURL = vi.fn(() => "blob:neural-speech");
  const revokeObjectURL = vi.fn();
  let audioInstance: {
    play: typeof play;
    pause: typeof pause;
    onended: null | (() => void);
    onerror: null | (() => void);
  };

  beforeEach(() => {
    voiceMocks.callbacks = null;
    voiceMocks.startRecording.mockReset();
    voiceMocks.cancelRecording.mockReset();
    voiceMocks.stopSpeaking.mockReset().mockResolvedValue(undefined);
    voiceMocks.prepareNeuralSpeech.mockReset();
    voiceMocks.synthesizeNeuralSpeech.mockReset().mockResolvedValue(new Blob(["audio"]));
    cancel.mockReset();
    play.mockReset().mockResolvedValue(undefined);
    pause.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    audioInstance = { play, pause, onended: null, onerror: null };
    vi.stubGlobal(
      "Audio",
      vi.fn(() => audioInstance),
    );
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockUtterance,
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockUtterance,
    });
  });

  it("turns a transcript into a chat turn, speaks the reply, then listens again", async () => {
    const onTurn = vi.fn();
    const initialMessages: Message[] = [{ id: 1, role: "assistant", content: "How can I help?" }];
    const { result, rerender } = renderHook(
      ({ messages, isStreaming }: { messages: Message[]; isStreaming: boolean }) =>
        useVoiceConversation({ messages, isStreaming, onTurn }),
      { initialProps: { messages: initialMessages, isStreaming: false } },
    );

    act(() => result.current.startCall());
    expect(voiceMocks.startRecording).toHaveBeenCalledWith({ autoStopOnSilence: true });

    act(() => voiceMocks.callbacks?.onTranscription("Show me the failing test"));
    expect(onTurn).toHaveBeenCalledWith("Show me the failing test");
    expect(result.current.status).toBe("thinking");

    rerender({
      messages: [
        ...initialMessages,
        { id: 2, role: "user", content: "Show me the failing test" },
        { id: 3, role: "assistant", content: "The **auth test** is failing." },
      ],
      isStreaming: false,
    });

    await waitFor(() =>
      expect(voiceMocks.synthesizeNeuralSpeech).toHaveBeenCalledWith("The auth test is failing."),
    );
    expect(result.current.status).toBe("speaking");
    expect(play).toHaveBeenCalledTimes(1);

    await act(async () => audioInstance.onended?.());
    expect(voiceMocks.startRecording).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("listening");
  });

  it("stops recording and playback when the call ends", () => {
    const { result } = renderHook(() =>
      useVoiceConversation({ messages: [], isStreaming: false, onTurn: vi.fn() }),
    );

    act(() => result.current.startCall());
    act(() => result.current.endCall());

    expect(voiceMocks.cancelRecording).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(voiceMocks.stopSpeaking).toHaveBeenCalledTimes(1);
    expect(result.current.isActive).toBe(false);
  });
});

describe("assistantTextForSpeech", () => {
  it("reads prose while omitting tool cards and fenced code", () => {
    const content = [
      "## Done",
      "I fixed the **login flow**.",
      '<octopus-studio-write path="src/auth.ts">hidden tool content</octopus-studio-write>',
      "```ts\nconst secret = true;\n```",
      "[Open the app](https://example.com).",
    ].join("\n\n");

    expect(assistantTextForSpeech(content)).toBe(
      "Done I fixed the login flow. Code omitted. Open the app.",
    );
  });
});
