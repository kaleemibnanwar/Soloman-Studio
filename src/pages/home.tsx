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
import { Compass, Hammer, Loader2, Play, RefreshCw, ShieldCheck, Zap } from "lucide-react";
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
    <div className="flex min-h-full w-full flex-col pb-28">
      <div className="flex flex-col items-center justify-center max-w-3xl w-full m-auto p-8 relative">
        <div className="w-full">
          <div className="mb-6 text-center">
            <svg
              width="56"
              height="56"
              viewBox="0 0 56 56"
              aria-hidden
              className="mx-auto mb-5 text-primary"
            >
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.9">
                {Array.from({ length: 8 }).map((_, i) => {
                  const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
                  const x1 = 28 + 13 * Math.cos(angle);
                  const y1 = 28 + 13 * Math.sin(angle);
                  const x2 = 28 + 23 * Math.cos(angle);
                  const y2 = 28 + 23 * Math.sin(angle);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
                })}
              </g>
              <circle cx="28" cy="28" r="5" fill="currentColor" />
            </svg>
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-primary">
              Agentic AI
            </p>
            <h1 className="mt-3 font-display text-4xl font-normal tracking-tight text-foreground md:text-5xl">
              What do you want to automate?
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Describe the outcome. Your agents plan it, build it, and run it — on your machine,
              with your approval at every step.
            </p>

            {/* Signature: the literal Plan → Build → Run lifecycle from the
                subhead above, rendered as a schematic — the approval gate
                (not autopilot) is the thing worth showing, not saying. */}
            <div
              role="img"
              aria-label="Your agent plans, then builds, then waits for your approval before it runs anything."
              className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-y-2 rounded-md border border-border bg-background-lighter px-2 py-2"
            >
              <span className="flex items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <Compass className="size-3.5 text-primary/70" aria-hidden />
                Plan
              </span>
              <span aria-hidden className="h-px w-4 bg-border" />
              <span className="flex items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <Hammer className="size-3.5 text-primary/70" aria-hidden />
                Build
              </span>
              <span aria-hidden className="h-px w-4 bg-border" />
              <span className="flex items-center gap-1.5 rounded-sm bg-primary/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
                <ShieldCheck className="size-3.5" aria-hidden />
                You approve
              </span>
              <span aria-hidden className="h-px w-4 bg-border" />
              <span className="flex items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <Play className="size-3.5 text-primary/70" aria-hidden />
                Run
              </span>
            </div>

            <div className="mt-4 flex justify-center">
              <ImportAppButton className="px-0 pb-0" variant="outline" size="sm" />
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
                    ? "flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    : "flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-primary transition-colors hover:bg-primary/10"
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
                className="flex cursor-pointer items-center gap-2 rounded-sm border border-border/70 bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:cursor-default disabled:opacity-50"
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
              className="group flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border/70 bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:cursor-default disabled:opacity-50"
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
