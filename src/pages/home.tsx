import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  attachmentsAtom,
  hasManuallySelectedChatModeAtom,
  homeActionTypeAtom,
  homeChatInputValueAtom,
  homeSelectedAppAtom,
} from "../atoms/chatAtoms";
import { useSettings } from "@/hooks/useSettings";
import { useState, useEffect, useCallback, useMemo } from "react";
import { HomeChatInput } from "@/components/chat/HomeChatInput";
import { useTelemetry } from "@/lib/telemetry";
import { PrivacyBanner } from "@/components/TelemetryBanner";
import { INSPIRATION_PROMPTS } from "@/prompts/inspiration_prompts";

import { ImportAppButton } from "@/components/ImportAppButton";
import { FeaturedAppShowcase } from "@/components/FeaturedAppShowcase";

import type { FileAttachment } from "@/ipc/types";
import type { ListedApp } from "@/ipc/types/app";
import { hasOctopusStudioProKey, type ChatMode } from "@/lib/schemas";
import {
  FREE_PRO_MODEL_FALLBACK_CHAT_MODE,
  isFreeProBuildModeCombination,
} from "@/lib/freeProModel";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Loader2, RefreshCw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useFirstPromptSaga, useFirstPromptSend } from "@/first_prompt/FirstPromptProvider";
import { getHomeDefaultChatMode } from "@/lib/homeChatMode";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useSelectChat } from "@/hooks/useSelectChat";
import { useStreamChat } from "@/hooks/useStreamChat";
import { ipc } from "@/ipc/types";
import { showError } from "@/lib/toast";

// Adding an export for attachments
export interface HomeSubmitOptions {
  attachments?: FileAttachment[];
  selectedApp?: ListedApp;
  includePlannerTasks?: boolean;
}

/** A short project/task title derived from the prompt's first clause. */
function deriveTaskTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  const first = clean.split(/[.!?\n]/)[0]?.trim() ?? clean;
  const title = first || clean || "Untitled";
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}

export default function HomePage() {
  const { t } = useTranslation("home");
  const [inputValue, setInputValue] = useAtom(homeChatInputValueAtom);
  const actionType = useAtomValue(homeActionTypeAtom);
  const selectedApp = useAtomValue(homeSelectedAppAtom);
  const attachments = useAtomValue(attachmentsAtom);
  const setAttachments = useSetAtom(attachmentsAtom);
  const firstPromptSaga = useFirstPromptSaga();
  const sendFirstPrompt = useFirstPromptSend();
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const { apps } = useLoadApps();
  const { selectChat } = useSelectChat();
  const { streamMessage } = useStreamChat({ hasChatId: false });
  const { settings, envVars, loading: isSettingsLoading } = useSettings();
  const { isAnyProviderSetup, isLoading: isLoadingLanguageModelProviders } =
    useLanguageModelProviders();
  const hasOctopusStudioProApiKey = settings ? hasOctopusStudioProKey(settings) : false;
  const hasConfiguredAiProvider = !isLoadingLanguageModelProviders && isAnyProviderSetup();
  const { quotaStatus } = useFreeAgentQuota();
  const homeInitialChatMode = useMemo<ChatMode | undefined>(() => {
    if (!settings) {
      return undefined;
    }

    return getHomeDefaultChatMode(
      settings,
      envVars,
      quotaStatus ? !quotaStatus.isQuotaExceeded : undefined,
    );
  }, [envVars, quotaStatus, settings]);

  const telemetry = useTelemetry();

  // Get the appId from search params
  const appId = search.appId ? Number(search.appId) : null;

  // State for random prompts
  const [randomPrompts, setRandomPrompts] = useState<typeof INSPIRATION_PROMPTS>([]);

  // Function to get random prompts
  const getRandomPrompts = useCallback(() => {
    const shuffled = [...INSPIRATION_PROMPTS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, []);

  // Initialize random prompts
  useEffect(() => {
    setRandomPrompts(getRandomPrompts());
  }, [getRandomPrompts]);

  // Redirect to app details page if appId is present. Use `replace` so the
  // intermediate `/?appId=…` entry doesn't sit in history and trap the back
  // button on app-details in a redirect loop.
  useEffect(() => {
    if (appId) {
      navigate({ to: "/app-details", search: { appId }, replace: true });
    }
  }, [appId, navigate]);

  const hasManuallySelectedChatMode = useAtomValue(hasManuallySelectedChatModeAtom);

  // Honor a manually picked mode (e.g. "plan") on submit; otherwise fall back
  // to the effective default so it still tracks provider/quota state. Apply the
  // Free Pro fallback for an invalid build-mode + free-pro-model combination.
  const homeSubmitChatMode = useMemo<ChatMode | undefined>(() => {
    const selected =
      hasManuallySelectedChatMode && settings?.selectedChatMode
        ? settings.selectedChatMode
        : homeInitialChatMode;
    if (settings && isFreeProBuildModeCombination(settings.selectedModel, selected)) {
      return FREE_PRO_MODEL_FALLBACK_CHAT_MODE;
    }
    return selected;
  }, [settings, homeInitialChatMode, hasManuallySelectedChatMode]);

  const defaultChatProject = useMemo(
    () => apps.find((app) => app.isDefaultChatProject) ?? null,
    [apps],
  );

  const handleSubmit = useCallback(
    async (options?: HomeSubmitOptions) => {
      const submittedAttachments = options?.attachments ?? [];
      if (!inputValue.trim() && submittedAttachments.length === 0) return false;
      const prompt = inputValue.trim();

      // Research: a codeless chat project, plus the prompt dispatched into a
      // fresh chat so the agent starts exploring right away.
      if (actionType === "research") {
        try {
          const { appId } = await ipc.app.createChatProject({
            name: deriveTaskTitle(prompt),
          });
          const chatId = await ipc.chat.createChat({ appId });
          setInputValue("");
          setAttachments([]);
          selectChat({ chatId, appId });
          streamMessage({ prompt, chatId, appId });
          return true;
        } catch (error) {
          showError(error instanceof Error ? error.message : "Failed to create research project");
          return false;
        }
      }

      // Chat project: create a codeless project and open it (blank) — the
      // prompt is used only as the project name, nothing is dispatched yet.
      if (actionType === "chatProject") {
        try {
          const { appId } = await ipc.app.createChatProject({
            name: deriveTaskTitle(prompt),
          });
          const chatId = await ipc.chat.createChat({ appId });
          setInputValue("");
          setAttachments([]);
          selectChat({ chatId, appId });
          return true;
        } catch (error) {
          showError(error instanceof Error ? error.message : "Failed to create chat project");
          return false;
        }
      }

      // "chat" (default): quick chat in the default chats group.
      const effectiveSelectedApp = defaultChatProject
        ? { id: defaultChatProject.id, name: defaultChatProject.name }
        : options?.selectedApp;

      return sendFirstPrompt({
        type: "SUBMIT",
        payload: {
          prompt,
          attachments: submittedAttachments,
          selectedApp: effectiveSelectedApp,
          chatMode: "ask",
          isChatModeExplicit: true,
          includePlannerTasks: options?.includePlannerTasks,
        },
      });
    },
    [
      actionType,
      inputValue,
      sendFirstPrompt,
      defaultChatProject,
      selectChat,
      streamMessage,
      setAttachments,
    ],
  );

  const isLoading = ["creating", "postCreate", "dispatching", "navigating"].includes(
    firstPromptSaga.phase,
  );
  const isCheckingProviders = firstPromptSaga.phase === "checkingProviders";

  // Loading overlay for app creation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center max-w-3xl m-auto p-8">
        <div className="w-full flex flex-col items-center">
          <Loader2 className="mb-8 h-16 w-16 animate-spin text-primary" aria-hidden />
          <h2 className="text-2xl font-bold mb-2 text-foreground">
            {firstPromptSaga.isExistingAppSubmission ? t("startingChat") : t("buildingApp")}
          </h2>
          <p className="text-muted-foreground text-center max-w-md mb-8">
            {firstPromptSaga.isExistingAppSubmission ? (
              t("creatingNewChat")
            ) : (
              <>
                {t("settingUp")} <br />
                {t("mightTakeMoment")}
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  // Main Home Page Content
  return (
    <div className="flex min-h-full w-full flex-col pb-24">
      <div className="relative m-auto flex w-full max-w-[900px] flex-col items-center justify-center px-6 py-12 md:px-8">
        <div className="w-full">
          <div className="mb-8 text-left">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.145em] text-muted-foreground">
              <Sparkles className="size-3" aria-hidden />
              Soloman / Command center
            </div>
            <h1 className="mt-3 max-w-2xl font-display text-[31px] font-semibold leading-[1.2] text-foreground">
              Your workspace, in focus.
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
              Manage projects, coordinate agents, and continue work across devices.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                Approval before action
              </span>
              <span aria-hidden className="hidden size-1 rounded-full bg-border sm:block" />
              <ImportAppButton
                className="h-auto border-0 bg-transparent p-0 shadow-none hover:bg-transparent hover:text-foreground"
                variant="outline"
                size="sm"
              />
            </div>
          </div>
          <HomeChatInput onSubmit={handleSubmit} disabled={isCheckingProviders} />

          {!isSettingsLoading && !isLoadingLanguageModelProviders && !hasOctopusStudioProApiKey && (
            <div className="-mt-2 flex justify-end px-4">
              <button
                type="button"
                onClick={() => {
                  telemetry.capture("home:setup-pill:click");
                  sendFirstPrompt({
                    type: "ARM_FOR_SETUP",
                    payload: {
                      prompt: inputValue,
                      attachments,
                      selectedApp: selectedApp ?? undefined,
                      chatMode: homeSubmitChatMode,
                      isChatModeExplicit: hasManuallySelectedChatMode,
                    },
                  });
                }}
                className={
                  hasConfiguredAiProvider
                    ? "flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    : "flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                }
              >
                <Zap aria-hidden="true" className="size-3.5" />
                {hasConfiguredAiProvider
                  ? "Manage AI setup"
                  : "Connect AI to build — takes a minute"}
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {randomPrompts.map((item) => (
              <button
                type="button"
                key={item.label}
                disabled={isCheckingProviders}
                onClick={() => setInputValue(item.prompt)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/80 bg-card/80 px-3 py-1.5 text-sm text-muted-foreground shadow-[0_1px_1px_color-mix(in_oklab,var(--foreground)_3%,transparent)] transition-[border-color,background-color,color] hover:border-primary/30 hover:bg-card hover:text-foreground disabled:cursor-default disabled:opacity-50"
              >
                <span aria-hidden="true" className="text-primary/70 [&_svg]:size-4">
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              disabled={isCheckingProviders}
              onClick={() => setRandomPrompts(getRandomPrompts())}
              className="group flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card hover:text-foreground disabled:cursor-default disabled:opacity-50"
            >
              <RefreshCw className="size-4 transition-transform duration-200 group-hover:rotate-[-25deg]" />
              {t("moreIdeas")}
            </button>
          </div>
        </div>
        <PrivacyBanner />
      </div>
      <FeaturedAppShowcase />
    </div>
  );
}
