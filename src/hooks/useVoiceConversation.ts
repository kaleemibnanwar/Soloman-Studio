import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ipc, type Message } from "@/ipc/types";
import { prepareNeuralSpeech, synthesizeNeuralSpeech } from "@/lib/neuralSpeech";
import { parseFullMessage } from "@/lib/streamingMessageParser";
import { useVoiceToText } from "./useVoiceToText";

export type VoiceConversationStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

interface UseVoiceConversationOptions {
  messages: Message[];
  isStreaming: boolean;
  onTurn: (transcript: string) => void | Promise<void>;
  onError?: (message: string) => void;
}

function markdownToSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " Code omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[>*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function assistantTextForSpeech(content: string): string {
  const markdown = parseFullMessage(content)
    .blocks.filter((block) => block.kind === "markdown")
    .map((block) => block.content)
    .join(" ");
  return markdownToSpeech(markdown);
}

function latestAssistant(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === "assistant") return messages[index];
  }
  return undefined;
}

export function useVoiceConversation({
  messages,
  isStreaming,
  onTurn,
  onError,
}: UseVoiceConversationOptions) {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<Exclude<VoiceConversationStatus, "idle" | "transcribing">>(
    "listening",
  );
  const [lastTranscript, setLastTranscript] = useState("");
  const activeRef = useRef(false);
  const baselineAssistantIdRef = useRef<number | undefined>(undefined);
  const playbackIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const beginListeningRef = useRef<() => void>(() => {});
  const callbacksRef = useRef({ onTurn, onError });
  callbacksRef.current = { onTurn, onError };

  const reportError = useCallback((message: string) => {
    activeRef.current = false;
    setIsActive(false);
    setPhase("listening");
    callbacksRef.current.onError?.(message);
  }, []);

  const handleTranscription = useCallback(
    (text: string) => {
      if (!activeRef.current) return;
      setLastTranscript(text);
      setPhase("thinking");
      void Promise.resolve(callbacksRef.current.onTurn(text)).catch((error) => {
        reportError(error instanceof Error ? error.message : "Unable to send the voice message.");
      });
    },
    [reportError],
  );

  const { isRecording, isTranscribing, startRecording, cancelRecording } = useVoiceToText({
    onTranscription: handleTranscription,
    onTranscriptionComplete: (text) => {
      if (!text && activeRef.current) beginListeningRef.current();
    },
    onError: reportError,
  });

  const beginListening = useCallback(() => {
    if (!activeRef.current) return;
    setPhase("listening");
    void startRecording({ autoStopOnSilence: true });
  }, [startRecording]);
  beginListeningRef.current = beginListening;

  const stopSpeech = useCallback(() => {
    playbackIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    void ipc.system.stopSpeaking();
  }, []);

  const endCall = useCallback(() => {
    activeRef.current = false;
    setIsActive(false);
    setLastTranscript("");
    cancelRecording();
    stopSpeech();
  }, [cancelRecording, stopSpeech]);

  const startCall = useCallback(() => {
    if (activeRef.current) return;
    baselineAssistantIdRef.current = latestAssistant(messages)?.id;
    activeRef.current = true;
    setIsActive(true);
    setLastTranscript("");
    setPhase("listening");
    prepareNeuralSpeech();
    void startRecording({ autoStopOnSilence: true });
  }, [messages, startRecording]);

  const interrupt = useCallback(() => {
    if (!activeRef.current) return;
    stopSpeech();
    beginListening();
  }, [beginListening, stopSpeech]);

  const assistantMessage = useMemo(() => latestAssistant(messages), [messages]);
  useEffect(() => {
    if (!isActive || phase !== "thinking" || isStreaming) return;
    if (!assistantMessage || assistantMessage.id === baselineAssistantIdRef.current) return;

    baselineAssistantIdRef.current = assistantMessage.id;
    const spokenText = assistantTextForSpeech(assistantMessage.content);
    if (!spokenText) {
      beginListening();
      return;
    }

    const playbackId = ++playbackIdRef.current;
    const finishPlayback = () => {
      if (activeRef.current && playbackId === playbackIdRef.current) beginListening();
    };
    setPhase("speaking");
    void synthesizeNeuralSpeech(spokenText.slice(0, 2_000))
      .then((blob) => {
        if (!activeRef.current || playbackId !== playbackIdRef.current) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audioUrlRef.current = url;
        audio.onended = () => {
          if (audioRef.current === audio) audioRef.current = null;
          if (audioUrlRef.current === url) audioUrlRef.current = null;
          URL.revokeObjectURL(url);
          finishPlayback();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (activeRef.current && playbackId === playbackIdRef.current) {
            reportError("Neural voice playback failed.");
          }
        };
        return audio.play();
      })
      .catch((error) => {
        if (activeRef.current && playbackId === playbackIdRef.current) {
          reportError(
            error instanceof Error ? error.message : "Unable to generate the neural voice.",
          );
        }
      });
  }, [assistantMessage, beginListening, isActive, isStreaming, phase, reportError]);

  useEffect(() => endCall, [endCall]);

  const status: VoiceConversationStatus = !isActive
    ? "idle"
    : phase === "thinking" || phase === "speaking"
      ? phase
      : isTranscribing
        ? "transcribing"
        : isRecording
          ? "listening"
          : phase;

  return { isActive, status, lastTranscript, startCall, endCall, interrupt };
}
