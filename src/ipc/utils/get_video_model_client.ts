import { createGoogleGenerativeAI as createGoogle } from "@ai-sdk/google";
import { experimental_generateVideo } from "ai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type { LargeLanguageModel, UserSettings } from "../../lib/schemas";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { getEnvVar } from "./read_env";
import { getTestFetchOption } from "./test_fetch_override";
import { getProviderApiKeyForRequest } from "./get_model_client";
import {
  OctopusStudioError,
  OctopusStudioErrorKind,
  isOctopusStudioError,
} from "@/errors/octopus_studio_error";
import log from "electron-log";

const logger = log.scope("get_video_model_client");

export interface VideoModelClientResult {
  /** The provider's dedicated video-generation model (e.g. Google Veo). */
  videoModel: Parameters<typeof experimental_generateVideo>[0]["model"];
  providerDisplayName: string;
}

/**
 * Resolve an AI SDK video model for the user's configured video-generation
 * model (`settings.selectedVideoModel`). Video generation has no
 * "chat-completions fallback" the way image generation does — chat models don't
 * return video as inline multimodal content — so this only supports providers
 * with a dedicated video endpoint. Currently that's Google (Veo).
 */
export async function getVideoModelClient(
  model: LargeLanguageModel,
  settings: UserSettings,
): Promise<VideoModelClientResult> {
  const allProviders = await getLanguageModelProviders();
  const providerConfig = allProviders.find((p) => p.id === model.provider);

  if (!providerConfig) {
    throw new OctopusStudioError(
      `Configuration not found for provider: ${model.provider}`,
      OctopusStudioErrorKind.NotFound,
    );
  }

  const providerDisplayName = providerConfig.name ?? providerConfig.id;
  const apiKey = getProviderApiKeyForRequest(
    settings.providerSettings?.[model.provider]?.apiKey?.value ||
      (providerConfig.envVarName ? getEnvVar(providerConfig.envVarName) : undefined),
    providerDisplayName,
  );
  const fetchOption: { fetch?: FetchFunction } = getTestFetchOption();

  switch (providerConfig.id) {
    case "google": {
      // Video generation runs through Google's dedicated `predictLongRunning`
      // route, which only Veo models implement. Chat models (gemini-*-flash and
      // friends) fail there with a confusing "not supported for
      // predictLongRunning" error, so reject them up front with an actionable
      // message instead.
      if (!model.name.toLowerCase().startsWith("veo")) {
        throw new OctopusStudioError(
          `"${model.name}" is not a video generation model. ` +
            `Google video generation uses Veo models, e.g. "veo-3.1-generate-preview".`,
          OctopusStudioErrorKind.Validation,
        );
      }
      const provider = createGoogle({ apiKey, ...fetchOption });
      return {
        videoModel: provider.video(model.name),
        providerDisplayName,
      };
    }
    default: {
      throw new OctopusStudioError(
        `Provider "${providerDisplayName}" does not support video generation. ` +
          `Video generation is currently available through Google (Veo) models, ` +
          `e.g. "veo-3.1-generate-preview".`,
        OctopusStudioErrorKind.Validation,
      );
    }
  }
}

/**
 * Generate one video using the user's configured video model. The result is a
 * base64-encoded video file plus its media type, which callers write to disk
 * under the correct extension before previewing it.
 */
export async function generateVideo(
  model: LargeLanguageModel,
  settings: UserSettings,
  prompt: string,
  options: { abortSignal?: AbortSignal } = {},
): Promise<{ base64: string; mediaType: string }> {
  const { videoModel } = await getVideoModelClient(model, settings);

  try {
    const result = await experimental_generateVideo({
      model: videoModel,
      prompt,
      // Video generation is expensive and slow; a hard quota/5xx error will
      // not recover within the SDK's backoff window, and blindly retrying can
      // double-bill a failed request. Fail fast and surface the real cause.
      maxRetries: 0,
      abortSignal: options.abortSignal,
    });
    const video = result.video;
    if (video) {
      return { base64: video.base64, mediaType: video.mediaType };
    }
  } catch (error) {
    if (isOctopusStudioError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Video generation error via ${model.provider}/${model.name}: ${message}`);
    const isQuota = /quota|rate.?limit|429|billing/i.test(message);
    const isWrongModel = /predictLongRunning|not found|not supported|unavailable/i.test(message);
    const hint = isWrongModel
      ? ` It should be a Google Veo model, e.g. "veo-3.1-generate-preview".`
      : isQuota
        ? ` This is a Google Cloud billing/quota limit — enable billing and check your Veo quota in the Google Cloud console.`
        : "";
    throw new OctopusStudioError(
      `Video generation failed for ${model.provider}/${model.name}: ${message}${hint}`,
      isQuota ? OctopusStudioErrorKind.RateLimited : OctopusStudioErrorKind.External,
      { cause: error },
    );
  }

  throw new OctopusStudioError(
    `${model.provider}/${model.name} did not return a video. ` +
      `Make sure the selected model actually supports video generation.`,
    OctopusStudioErrorKind.External,
  );
}
