import { AudioLines, Mic, PhoneOff, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { VoiceConversationStatus } from "@/hooks/useVoiceConversation";
import { cn } from "@/lib/utils";

interface VoiceConversationBarProps {
  status: VoiceConversationStatus;
  lastTranscript: string;
  onEnd: () => void;
  onInterrupt: () => void;
}

const statusIcon = {
  idle: AudioLines,
  listening: Mic,
  transcribing: AudioLines,
  thinking: AudioLines,
  speaking: Volume2,
};

export function VoiceConversationBar({
  status,
  lastTranscript,
  onEnd,
  onInterrupt,
}: VoiceConversationBarProps) {
  const { t } = useTranslation("chat");
  const StatusIcon = statusIcon[status];

  return (
    <div className="mx-2 mt-2 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/6 px-3 py-2 shadow-sm">
      <div className="relative grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
        <span
          className={cn(
            "absolute inset-0 rounded-full border border-primary/30",
            status !== "thinking" && "animate-ping motion-reduce:animate-none",
          )}
        />
        <StatusIcon size={17} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="text-xs font-semibold text-foreground">{t("voiceCall.title")}</p>
        <p className="truncate text-xs text-muted-foreground">
          {lastTranscript && status === "thinking"
            ? t("voiceCall.youSaid", { transcript: lastTranscript })
            : t(`voiceCall.status.${status}`)}
        </p>
      </div>
      {status === "speaking" && (
        <button
          type="button"
          onClick={onInterrupt}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("voiceCall.interrupt")}
        </button>
      )}
      <button
        type="button"
        onClick={onEnd}
        aria-label={t("voiceCall.end")}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PhoneOff size={15} />
      </button>
    </div>
  );
}
