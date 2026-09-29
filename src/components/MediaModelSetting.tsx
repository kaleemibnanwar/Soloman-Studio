import { useEffect, useState } from "react";
import { SettingField } from "@/components/settings/SettingField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import type { LargeLanguageModel } from "@/lib/schemas";

/**
 * Providers with image generation wired up in get_image_model_client.ts.
 * Custom providers (e.g. Gemini/ChatGPT models proxied through a local
 * OpenAI-compatible server) are also offered for image generation.
 */
const IMAGE_PROVIDER_IDS = new Set(["openai", "google", "openrouter", "lmstudio", "minimax"]);

/**
 * Google Veo models that support video generation through the dedicated
 * `predictLongRunning` endpoint. Only these are offered for video — chat models
 * (gemini-*-flash and friends) do not support video generation and fail on that
 * route, so they are deliberately excluded.
 */
const VIDEO_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "veo-3.1-generate-preview", label: "Veo 3.1 (veo-3.1-generate-preview)" },
  { value: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast (veo-3.1-fast-generate-preview)" },
  { value: "veo-3.1-generate", label: "Veo 3.1 (veo-3.1-generate)" },
  { value: "veo-2.0-generate-001", label: "Veo 2.0 (veo-2.0-generate-001)" },
];

export function ImageModelSetting() {
  const { settings, updateSettings } = useSettings();
  const { data: providers } = useLanguageModelProviders();

  const selected = settings?.selectedImageModel;
  const [provider, setProvider] = useState(selected?.provider ?? "");
  const [modelName, setModelName] = useState(selected?.name ?? "");

  // Sync local state when the persisted selection changes.
  useEffect(() => {
    setProvider(selected?.provider ?? "");
    setModelName(selected?.name ?? "");
  }, [selected?.provider, selected?.name]);

  const eligibleProviders = (providers ?? []).filter(
    (p) => p.type === "custom" || IMAGE_PROVIDER_IDS.has(p.id),
  );

  const hasChanges =
    provider !== (selected?.provider ?? "") || modelName.trim() !== (selected?.name ?? "");

  const save = () => {
    if (!provider || !modelName.trim()) return;
    const model: LargeLanguageModel = { provider, name: modelName.trim() };
    updateSettings({ selectedImageModel: model });
  };

  return (
    <SettingField
      label="Image Model"
      description="Model used by the agent's generate_image tool and the Generate Image dialog."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {eligibleProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Model id (e.g. gpt-image-1, gemini-2.5-flash-image)"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!provider || !modelName.trim() || !hasChanges}
          onClick={save}
        >
          Save
        </Button>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Any configured provider works, including a custom OpenAI-compatible provider pointed at a
        local image server.
      </p>
      {selected && !hasChanges && (
        <p className="text-[13px] text-muted-foreground">
          Using {selected.provider} / {selected.name}
        </p>
      )}
    </SettingField>
  );
}

export function VideoModelSetting() {
  const { settings, updateSettings } = useSettings();
  const selected = settings?.selectedVideoModel;
  const currentName = selected?.provider === "google" ? selected.name : "";
  const isKnown = VIDEO_MODEL_OPTIONS.some((o) => o.value === currentName);

  return (
    <SettingField label="Video Model" description="Model used by the agent's generate_video tool.">
      <Select
        value={isKnown ? currentName : ""}
        onValueChange={(value) =>
          value && updateSettings({ selectedVideoModel: { provider: "google", name: value } })
        }
      >
        <SelectTrigger className="w-full sm:w-[280px]">
          <SelectValue placeholder="Select a Veo model" />
        </SelectTrigger>
        <SelectContent>
          {VIDEO_MODEL_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && !isKnown && (
        <p className="text-[13px] text-amber-700 dark:text-amber-500">
          "{selected.name}" isn't a video model — choose a Veo model above.
        </p>
      )}
      <p className="text-[13px] text-muted-foreground">
        Video generation uses Google's dedicated Veo endpoint; chat models like gemini-*-flash
        aren't supported.
      </p>
    </SettingField>
  );
}
