import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import log from "electron-log";
import { readSettings } from "../../main/settings";
import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";
import { getTestFetchOption } from "../utils/test_fetch_override";
import { resolveBuiltinModelAlias } from "../shared/remote_language_model_catalog";

const logger = log.scope("chat-mode-classifier");

const MAX_PROMPT_CHARS = 1000;
const CLASSIFY_TIMEOUT_MS = 2500;

const SYSTEM_PROMPT =
  "Classify this developer request as ASK, BUILD, or AGENT.\n" +
  "ASK = question/explanation, no code change.\n" +
  "BUILD = single known edit, file/scope is clear.\n" +
  "AGENT = open-ended, multi-file, or root cause unknown.\n" +
  "Reply with exactly one word: ASK, BUILD, or AGENT.";

type ClassifiedMode = "ask" | "build" | "local-agent";

function parseClassification(text: string): ClassifiedMode | null {
  const normalized = text.trim().toUpperCase();
  if (normalized.includes("ASK")) return "ask";
  if (normalized.includes("BUILD")) return "build";
  if (normalized.includes("AGENT")) return "local-agent";
  return null;
}

export function registerChatModeClassifierHandlers() {
  createTypedHandler(chatContracts.classifyMode, async (_event, { prompt }) => {
    try {
      const settings = await readSettings();
      const apiKey = settings.providerSettings?.["auto"]?.apiKey?.value;
      const provider = createOpenAI({
        baseURL: "https://helpchat.octopusStudio.sh/v1",
        apiKey,
        ...getTestFetchOption(),
      });

      const classifierModel = await resolveBuiltinModelAlias("octopusStudio/help-bot/default");
      if (!classifierModel || classifierModel.providerId !== "openai") {
        logger.warn("mode classifier alias did not resolve to an OpenAI model", {
          resolvedProviderId: classifierModel?.providerId,
        });
        return { mode: null };
      }

      const { text } = await generateText({
        model: provider.responses(classifierModel.apiName),
        system: SYSTEM_PROMPT,
        prompt: prompt.slice(0, MAX_PROMPT_CHARS),
        temperature: 0,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
      });

      const mode = parseClassification(text);
      if (!mode) {
        logger.warn("mode classifier returned unparseable output", { text });
      }
      return { mode };
    } catch (error) {
      logger.error("mode classification failed", error);
      return { mode: null };
    }
  });
}
