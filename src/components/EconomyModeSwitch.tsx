import { Leaf } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { Switch } from "@/components/ui/switch";
import { showInfo } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Economy-mode toggle for the sidebar footer. When enabled, OctopusStudio minimizes
 * token usage (concise system-prompt instructions, reduced chat context)
 * while keeping result quality high.
 */
export function EconomyModeSwitch() {
  const { settings, updateSettings } = useSettings();
  const enabled = !!settings?.economyMode;

  const handleToggle = () => {
    const next = !enabled;
    updateSettings({ economyMode: next });
    showInfo(
      next
        ? "Economy mode enabled — Octopus Studio will use fewer tokens."
        : "Economy mode disabled.",
    );
  };

  return (
    <div className="mb-1 flex h-10 w-full items-center gap-2 rounded-xl px-2" title="Economy mode">
      <button
        type="button"
        aria-label="Economy mode"
        aria-pressed={enabled}
        className={cn(
          "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          enabled
            ? "text-primary"
            : "hover:bg-sidebar-accent active:bg-sidebar-accent",
        )}
        onClick={handleToggle}
      >
        <Leaf className="size-5" />
        <span className="flex-1 text-left text-xs font-medium">Economy</span>
      </button>
      <Switch checked={enabled} onCheckedChange={handleToggle} aria-label="Economy mode" />
    </div>
  );
}
