import { z } from "zod";
import type { LanguageModel } from "@/ipc/types/language-model";

const GoogleModelSchema = z.object({
  name: z.string(),
  baseModelId: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  inputTokenLimit: z.number().int().positive().optional(),
  outputTokenLimit: z.number().int().positive().optional(),
  supportedGenerationMethods: z.array(z.string()).default([]),
  temperature: z.number().optional(),
  thinking: z.boolean().optional(),
});

const GoogleModelListSchema = z.object({
  models: z.array(GoogleModelSchema).default([]),
  nextPageToken: z.string().optional(),
});

const NON_CHAT_MODEL = /(?:embedding|aqa|imagen|veo|tts|live|image)/i;

export async function fetchGoogleChatModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LanguageModel[]> {
  const discovered: LanguageModel[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Google model discovery failed (${response.status})`);
    const page = GoogleModelListSchema.parse(await response.json());

    for (const model of page.models) {
      const apiName = model.baseModelId ?? model.name.replace(/^models\//, "");
      if (
        !apiName.startsWith("gemini-") ||
        NON_CHAT_MODEL.test(apiName) ||
        !model.supportedGenerationMethods.includes("generateContent")
      ) {
        continue;
      }
      discovered.push({
        apiName,
        displayName: model.displayName ?? apiName,
        description: model.description,
        contextWindow: model.inputTokenLimit,
        maxOutputTokens: model.outputTokenLimit,
        temperature: model.temperature,
        effortSettings: model.thinking
          ? {
              defaultEffortLevel: "high",
              possibleEffortLevels: ["minimal", "low", "medium", "high"],
            }
          : undefined,
        type: "cloud",
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return [...new Map(discovered.map((model) => [model.apiName, model])).values()];
}

export function mergeDiscoveredGoogleModels(
  catalogModels: LanguageModel[],
  discoveredModels: LanguageModel[],
): LanguageModel[] {
  const discoveredByName = new Map(discoveredModels.map((model) => [model.apiName, model]));
  const mergedCatalog = catalogModels.map((model) => ({
    ...discoveredByName.get(model.apiName),
    ...model,
  }));
  const catalogNames = new Set(catalogModels.map((model) => model.apiName));
  return [
    ...mergedCatalog,
    ...discoveredModels.filter((model) => !catalogNames.has(model.apiName)),
  ];
}
