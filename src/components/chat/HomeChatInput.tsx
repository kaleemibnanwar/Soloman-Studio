import {
  SendHorizontalIcon,
  StopCircleIcon,
  FolderOpenIcon,
  XIcon,
  Mic,
  MicOff,
  Loader2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import { useSettings } from "@/hooks/useSettings";
import { homeChatInputValueAtom, homeSelectedAppAtom } from "@/atoms/chatAtoms";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useAttachments } from "@/hooks/useAttachments";
import { AttachmentsList } from "./AttachmentsList";
import { DragDropOverlay } from "./DragDropOverlay";
import { FileAttachmentTypeDialog } from "./FileAttachmentTypeDialog";
import { HomeSubmitOptions } from "@/pages/home";
import { ChatInputControls } from "../ChatInputControls";
import { HomeActionTypeSelector } from "./HomeActionTypeSelector";
import { LexicalChatInput } from "./LexicalChatInput";
import { useChatModeToggle } from "@/hooks/useChatModeToggle";
import { useTypingPlaceholder } from "@/hooks/useTypingPlaceholder";
import { AuxiliaryActionsMenu } from "./AuxiliaryActionsMenu";
import { cn } from "@/lib/utils";
import { useLoadApps } from "@/hooks/useLoadApps";
import { AppSearchDialog } from "../AppSearchDialog";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { showError } from "@/lib/toast";

export function HomeChatInput({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (options?: HomeSubmitOptions) => boolean | Promise<boolean>;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useAtom(homeChatInputValueAtom);
  const [selectedApp, setSelectedApp] = useAtom(homeSelectedAppAtom);
  const { settings } = useSettings();
  const { isStreaming } = useStreamChat({
    hasChatId: false,
  }); // eslint-disable-line @typescript-eslint/no-unused-vars
  useChatModeToggle();

  const handleTranscription = useCallback(
    (text: string) => {
      if (disabled) return;
      setInputValue((prev: string) => (prev.trim() ? prev + " " + text : text));
    },
    [disabled, setInputValue],
  );

  const { isEnabled, isRecording, isTranscribing, toggleRecording } = useVoiceToText({
    onTranscription: handleTranscription,
    onError: (message) => showError(message),
  });

  const [appSearchOpen, setAppSearchOpen] = useState(false);
  const { apps } = useLoadApps();

  // Clear selected app when the experiment flag is disabled
  useEffect(() => {
    if (!settings?.enableSelectAppFromHomeChatInput) {
      setSelectedApp(null);
    }
  }, [settings?.enableSelectAppFromHomeChatInput, setSelectedApp]);

  const typingText = useTypingPlaceholder([
    "an ecommerce store...",
    "an information page...",
    "a landing page...",
  ]);
  const placeholder = selectedApp
    ? `Send a message to ${selectedApp.name}...`
    : `Ask Octopus Studio to build ${typingText ?? ""}`;

  // Use the attachments hook
  const {
    attachments,
    isDraggingOver,
    pendingFiles,
    handleFileSelect,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    confirmPendingFiles,
    cancelPendingFiles,
  } = useAttachments();

  const handleSelectApp = (appId: number) => {
    const app = apps.find((a) => a.id === appId);
    if (app) {
      setSelectedApp(app);
    }
    setAppSearchOpen(false);
  };

  // Custom submit function that wraps the provided onSubmit
  const handleCustomSubmit = async () => {
    if (
      (!inputValue.trim() && attachments.length === 0) ||
      isStreaming ||
      disabled ||
      pendingFiles
    ) {
      return;
    }

    if (isRecording) {
      await toggleRecording();
    }

    // Call the parent's onSubmit handler with attachments and selected app
    const didSubmit = await onSubmit({
      attachments,
      selectedApp: selectedApp ?? undefined,
    });

    if (!didSubmit) {
      return;
    }

    // The first-prompt saga owns clearing the snapshotted editing buffer and
    // recording submission analytics at the actual prompt-dispatch commit.
  };

  if (!settings) {
    return null; // Or loading state
  }

  return (
    <>
      <div className="p-4" data-testid="home-chat-input-container">
        <div
          aria-disabled={disabled}
          inert={disabled}
          className={cn(
            "group/console relative flex flex-col border border-border rounded-lg bg-(--background-lighter) transition-colors duration-200",
            "hover:border-primary/30",
            "focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20",
            isDraggingOver && "ring-2 ring-primary border-primary",
            disabled && "pointer-events-none opacity-70",
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Instrument-panel corner ticks — this is a console addressing a
              local machine, not a chat bubble. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-px -left-px size-2.5 border-t-2 border-l-2 border-primary/25 transition-colors group-focus-within/console:border-primary/70"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -top-px -right-px size-2.5 border-t-2 border-r-2 border-primary/25 transition-colors group-focus-within/console:border-primary/70"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-px -left-px size-2.5 border-b-2 border-l-2 border-primary/25 transition-colors group-focus-within/console:border-primary/70"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-px -right-px size-2.5 border-b-2 border-r-2 border-primary/25 transition-colors group-focus-within/console:border-primary/70"
          />

          {/* Attachments list */}
          <AttachmentsList attachments={attachments} onRemove={removeAttachment} />

          {/* Drag and drop overlay */}
          <DragDropOverlay isDraggingOver={isDraggingOver} />

          {/* Dialog for choosing attachment type */}
          <FileAttachmentTypeDialog
            pendingFiles={pendingFiles}
            onConfirm={confirmPendingFiles}
            onCancel={cancelPendingFiles}
          />

          <div className="flex items-end gap-1">
            <LexicalChatInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleCustomSubmit}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={isStreaming || disabled}
              excludeCurrentApp={false}
              disableSendButton={false}
              messageHistory={[]}
            />

            {/* Voice-to-text button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={toggleRecording}
                    disabled={disabled || isTranscribing}
                    aria-label={
                      isRecording
                        ? "Stop recording"
                        : isTranscribing
                          ? "Transcribing..."
                          : isEnabled
                            ? "Voice to text"
                            : "Enable voice to text"
                    }
                    className={cn(
                      "px-2 py-2 mb-0.5 text-muted-foreground rounded-lg transition-colors duration-150 cursor-pointer disabled:cursor-default disabled:opacity-30",
                      isRecording && "text-red-500 hover:text-red-600 animate-pulse",
                      !isRecording && !isTranscribing && isEnabled && "hover:text-primary",
                      !isEnabled && "opacity-40",
                    )}
                  />
                }
              >
                {isTranscribing ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : isRecording ? (
                  <MicOff size={20} />
                ) : (
                  <Mic size={20} />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {isRecording
                  ? "Stop recording"
                  : isTranscribing
                    ? "Transcribing..."
                    : isEnabled
                      ? "Voice to text"
                      : "Enable voice to text"}
              </TooltipContent>
            </Tooltip>

            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      aria-label="Cancel generation (unavailable here)"
                      className="px-2 py-2 mb-0.5 mr-1 text-muted-foreground rounded-lg opacity-50 cursor-not-allowed transition-colors duration-150"
                    />
                  }
                >
                  <StopCircleIcon size={20} />
                </TooltipTrigger>
                <TooltipContent>Cancel generation (unavailable here)</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={handleCustomSubmit}
                      disabled={disabled || (!inputValue.trim() && attachments.length === 0)}
                      aria-label="Send message"
                      className={cn(
                        "px-2.5 py-2 mb-0.5 mr-1 rounded-md transition-colors duration-150",
                        !disabled && (inputValue.trim() || attachments.length > 0)
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer signal-breathe"
                          : "text-muted-foreground opacity-30 cursor-not-allowed",
                      )}
                    />
                  }
                >
                  <SendHorizontalIcon size={20} />
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="px-2 flex items-center justify-between pb-0.5 pt-0.5">
            <div className="flex items-center">
              <ChatInputControls showContextFilesPicker={false} />
              <HomeActionTypeSelector />
              {settings?.enableSelectAppFromHomeChatInput && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        onClick={() => {
                          if (!disabled) setAppSearchOpen(true);
                        }}
                        disabled={disabled}
                        className={cn(
                          "cursor-pointer px-2 py-1 ml-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1",
                          selectedApp
                            ? "bg-primary/10 text-primary hover:bg-primary/15"
                            : "text-foreground/80 hover:text-foreground hover:bg-muted/60",
                        )}
                        data-testid="home-app-selector"
                      />
                    }
                  >
                    <FolderOpenIcon size={14} />
                    <span className="truncate max-w-[150px]">
                      {selectedApp ? selectedApp.name : "No app selected"}
                    </span>
                    {selectedApp && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedApp(null);
                        }}
                        className="hover:bg-primary/20 rounded-sm p-0.5 transition-colors"
                        aria-label="Deselect app"
                        data-testid="home-app-selector-clear"
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    {selectedApp ? "Change selected app" : "Select an existing app"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            <AuxiliaryActionsMenu onFileSelect={handleFileSelect} hideContextFilesPicker />
          </div>
        </div>
      </div>

      {appSearchOpen && (
        <AppSearchDialog
          open={appSearchOpen}
          onOpenChange={setAppSearchOpen}
          onSelectApp={handleSelectApp}
          disableShortcut
          allApps={apps.map((a) => ({
            id: a.id,
            name: a.name,
            createdAt: a.createdAt,
            matchedChatTitle: null,
            matchedChatMessage: null,
          }))}
        />
      )}
    </>
  );
}
