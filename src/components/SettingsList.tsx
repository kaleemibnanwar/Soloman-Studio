import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import { useAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { SECTION_IDS, SETTINGS_SEARCH_INDEX } from "@/lib/settingsSearchIndex";
import Fuse from "fuse.js";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Blocks,
  Cpu,
  Film,
  FlaskConical,
  Link2,
  type LucideIcon,
  SearchIcon,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  Globe2,
  XIcon,
} from "lucide-react";

type SettingsSectionItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: "default" | "danger";
};

export const SETTINGS_SECTIONS: SettingsSectionItem[] = [
  { id: SECTION_IDS.general, label: "General", icon: Settings2 },
  { id: SECTION_IDS.workflow, label: "Workflow", icon: Workflow },
  { id: SECTION_IDS.ai, label: "AI", icon: Sparkles },
  { id: SECTION_IDS.mediaGeneration, label: "Media Generation", icon: Film },
  { id: SECTION_IDS.providers, label: "Model Providers", icon: Cpu },
  { id: SECTION_IDS.plugins, label: "Plugins", icon: Blocks },
  { id: SECTION_IDS.integrations, label: "Integrations", icon: Link2 },
  { id: SECTION_IDS.agentPermissions, label: "Agent Permissions", icon: ShieldCheck },
  { id: SECTION_IDS.telemetry, label: "Telemetry", icon: Activity },
  { id: SECTION_IDS.advanced, label: "Advanced", icon: SlidersHorizontal },
  { id: SECTION_IDS.webAutomation, label: "Web Automation", icon: Globe2 },
  { id: SECTION_IDS.experiments, label: "Experiments", icon: FlaskConical },
  { id: SECTION_IDS.dangerZone, label: "Danger Zone", icon: AlertTriangle, tone: "danger" },
];

const fuse = new Fuse(SETTINGS_SEARCH_INDEX, {
  keys: [
    { name: "label", weight: 2 },
    { name: "description", weight: 1 },
    { name: "keywords", weight: 1.5 },
    { name: "sectionLabel", weight: 0.5 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
});

export function SettingsList({ show }: { show: boolean }) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useAtom(activeSettingsSectionAtom);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollAndNavigateToWithHighlight = useScrollAndNavigateTo("/settings", {
    behavior: "smooth",
    block: "start",
    highlight: true,
  });

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return fuse.search(searchQuery.trim());
  }, [searchQuery]);

  if (!show) {
    return null;
  }

  const currentSection = activeSection ?? SECTION_IDS.general;

  const handleSelectSection = async (sectionId: string) => {
    setActiveSection(sectionId);
    await navigate({ to: "/settings" });
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          aria-label="Back to projects"
          title="Back to projects"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[13px] font-semibold tracking-tight">Settings</h2>
      </div>
      <div className="flex-shrink-0 px-3 pb-2 pt-1">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search settings..."
            aria-label="Search settings"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent pl-8 pr-8 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-grow">
        <div className="space-y-0.5 px-2 pb-4 pt-0">
          {searchResults !== null ? (
            searchResults.length > 0 ? (
              searchResults.map((result) => (
                <button
                  key={`${result.item.id}-${result.refIndex}`}
                  onClick={() => {
                    scrollAndNavigateToWithHighlight(result.item.id, result.item.sectionId);
                    setSearchQuery("");
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent"
                >
                  <div className="font-medium">{result.item.label}</div>
                  <div className="text-xs text-muted-foreground">{result.item.sectionLabel}</div>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No settings found
              </div>
            )
          ) : (
            SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = currentSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSelectSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors",
                    isActive
                      ? section.tone === "danger"
                        ? "bg-destructive/10 text-destructive font-semibold"
                        : "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                      : section.tone === "danger"
                        ? "text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? section.tone === "danger"
                          ? "text-destructive"
                          : "text-primary"
                        : "opacity-75",
                    )}
                  />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
