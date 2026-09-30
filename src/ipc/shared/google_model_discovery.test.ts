import { describe, expect, it, vi } from "vitest";
import { fetchGoogleChatModels, mergeDiscoveredGoogleModels } from "./google_model_discovery";

describe("Google model discovery", () => {
  it("keeps current generateContent chat models and filters specialized models", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            models: [
              {
                name: "models/gemini-3.7-flash-001",
                baseModelId: "gemini-3.7-flash",
                displayName: "Gemini 3.7 Flash",
                inputTokenLimit: 1_000_000,
                outputTokenLimit: 65_536,
                supportedGenerationMethods: ["generateContent"],
                thinking: true,
              },
              {
                name: "models/gemini-3.7-flash-image",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/text-embedding-005",
                supportedGenerationMethods: ["embedContent"],
              },
            ],
          }),
        ),
    );

    const models = await fetchGoogleChatModels("secret", fetchImpl as typeof fetch);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      apiName: "gemini-3.7-flash",
      displayName: "Gemini 3.7 Flash",
      contextWindow: 1_000_000,
      maxOutputTokens: 65_536,
    });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("key=secret");
  });

  it("preserves curated metadata and appends newly discovered models", () => {
    expect(
      mergeDiscoveredGoogleModels(
        [{ apiName: "gemini-stable", displayName: "Curated", dollarSigns: 2 }],
        [
          { apiName: "gemini-stable", displayName: "API", contextWindow: 123 },
          { apiName: "gemini-new", displayName: "New" },
        ],
      ),
    ).toEqual([
      {
        apiName: "gemini-stable",
        displayName: "Curated",
        contextWindow: 123,
        dollarSigns: 2,
      },
      { apiName: "gemini-new", displayName: "New" },
    ]);
  });
});
