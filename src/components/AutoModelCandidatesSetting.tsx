import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Checkbox } from "@/components/ui/checkbox";
import type { LargeLanguageModel } from "@/lib/schemas";
import type { LanguageModel } from "@/ipc/types";

function toCandidate(providerId: string, model: LanguageModel): LargeLanguageModel {
  return {
    provider: providerId,
    name: model.apiName,
    ...(model.type === "custom" && model.id != null ? { customModelId: model.id } : {}),
  };
}

function candidateKey(candidate: LargeLanguageModel): string {
  return JSON.stringify([candidate.provider, candidate.name, candidate.customModelId ?? null]);
}

/**
 * Multi-select of the models the router may choose between when auto model mode
 * is on. Persists to `settings.autoModelCandidates`.
 */
export function AutoModelCandidatesSetting() {
  const { settings, updateSettings } = useSettings();
  const { data: modelsByProviders } = useLanguageModelsByProviders();
  const { data: providers } = useLanguageModelProviders();

  const selected = new Set((settings?.autoModelCandidates ?? []).map(candidateKey));

  const providerName = (providerId: string) =>
    providers?.find((p) => p.id === providerId)?.name ?? providerId;

  const toggle = (candidate: LargeLanguageModel) => {
    if (!settings) return;
    const candidates = settings.autoModelCandidates ?? [];
    const key = candidateKey(candidate);
    const next = selected.has(key)
      ? candidates.filter((c) => candidateKey(c) !== key)
      : [...candidates, candidate];
    updateSettings({ autoModelCandidates: next });
  };

  const entries = Object.entries(modelsByProviders ?? {});

  if (entries.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Connect a provider to choose candidate models.
      </p>
    );
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto scrollbar-on-hover">
      {entries.map(([providerId, models]) => {
        if (models.length === 0) return null;
        return (
          <div key={providerId} className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {providerName(providerId)}
            </p>
            <div className="space-y-0.5">
              {models.map((model) => {
                const candidate = toCandidate(providerId, model);
                return (
                  <label
                    key={`${providerId}:${model.apiName}:${model.id ?? "cloud"}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected.has(candidateKey(candidate))}
                      onCheckedChange={() => toggle(candidate)}
                    />
                    <span className="truncate">{model.displayName || model.apiName}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
