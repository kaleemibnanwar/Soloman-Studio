import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Palette, FileText, Image, Store, Sparkles } from "lucide-react";

type LibrarySection = {
  id: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const LIBRARY_SECTIONS: LibrarySection[] = [
  { id: "all", label: "All", to: "/library", icon: BookOpen },
  { id: "themes", label: "Themes", to: "/library/themes", icon: Palette },
  { id: "prompts", label: "Prompts", to: "/library/prompts", icon: FileText },
  { id: "skills", label: "Skills", to: "/library/skills", icon: Sparkles },
  { id: "media", label: "Media", to: "/library/media", icon: Image },
  { id: "templates", label: "Templates", to: "/templates", icon: Store },
];

export function LibraryList({ show }: { show: boolean }) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  if (!show) {
    return null;
  }

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
        <h2 className="text-[13px] font-semibold tracking-tight">Library</h2>
      </div>
      <ScrollArea className="flex-grow">
        <div className="space-y-1 p-4 pt-0">
          {LIBRARY_SECTIONS.map((section) => {
            const fullLocation = pathname + routerState.location.searchStr;
            const isActive =
              section.to === fullLocation ||
              section.to === pathname ||
              (section.to !== "/" &&
                section.to !== "/library" &&
                !section.to.includes("?") &&
                pathname.startsWith(section.to));

            return (
              <Link
                key={section.id}
                to={section.to}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "hover:bg-sidebar-accent",
                )}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
