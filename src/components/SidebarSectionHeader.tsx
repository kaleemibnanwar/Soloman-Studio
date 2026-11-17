import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Tiny uppercase section label with an optional inline action cluster on
 *  the right — the shared header for each group in the merged sidebar list.
 *  Pass `collapsed`/`onToggleCollapsed` to make the label a chevron toggle
 *  that expands or collapses the group below it. */
export function SectionHeader({
  label,
  actions,
  collapsed,
  onToggleCollapsed,
}: {
  label: string;
  actions?: ReactNode;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 pr-1 pl-2">
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-1.5 rounded py-1.5 text-[11px] font-semibold tracking-[0.06em] text-sidebar-foreground/50 uppercase transition-colors hover:text-sidebar-foreground/80"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 transition-transform duration-150",
              !collapsed && "rotate-90",
            )}
          />
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <span className="py-1.5 text-[11px] font-semibold tracking-[0.06em] text-sidebar-foreground/50 uppercase">
          {label}
        </span>
      )}
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </div>
  );
}

/** Small ghost icon button used in section headers (New/Import/Add/…). */
export function HeaderIconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}
