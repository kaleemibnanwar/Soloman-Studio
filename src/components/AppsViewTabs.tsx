import { cn } from "@/lib/utils";

export type AppsView = "apps" | "collections";

interface AppsViewTabsProps {
  value: AppsView;
  onChange: (value: AppsView) => void;
}

const TABS: { key: AppsView; label: string }[] = [
  { key: "apps", label: "Projects" },
  { key: "collections", label: "Collections" },
];

export function AppsViewTabs({ value, onChange }: AppsViewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Apps view"
      className="flex items-center gap-5 border-b border-border"
      data-testid="apps-view-tabs"
    >
      {TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`apps-view-tab-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={cn(
              "-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
