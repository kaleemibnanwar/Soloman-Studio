import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useOpenApp } from "@/hooks/useOpenApp";
import { AppShowcaseCard } from "@/components/AppShowcaseCard";
import { useAppThumbnails } from "@/hooks/useAppThumbnails";
import { sortAppsForShowcase } from "@/lib/sortApps";
import { SectionHeading } from "@/components/ui/section-heading";

const MAX_FEATURED_APPS = 10;

export function FeaturedAppShowcase() {
  const { apps } = useLoadApps();
  const openApp = useOpenApp();
  const navigate = useNavigate();

  // Exclude the pre-seeded "Chats" bucket — it isn't a project someone
  // created, and the sidebar already gives it a dedicated home, so surfacing
  // it here too just duplicates the same built-in destination as a card.
  const sortedApps = useMemo(
    () => sortAppsForShowcase(apps.filter((app) => !app.isDefaultChatProject)),
    [apps],
  );

  const featured = useMemo(() => sortedApps.slice(0, MAX_FEATURED_APPS), [sortedApps]);
  const featuredIds = useMemo(() => featured.map((a) => a.id), [featured]);

  const thumbnailByAppId = useAppThumbnails(featuredIds);

  if (sortedApps.length === 0) {
    return null;
  }

  const hasMore = sortedApps.length > MAX_FEATURED_APPS;

  return (
    <section
      data-testid="featured-app-showcase"
      className="w-full max-w-6xl mx-auto border-t border-border px-8 pt-8 pb-12"
    >
      <SectionHeading
        className="mb-4"
        eyebrow="Local workspace"
        title="Your apps"
        action={
          <button
            type="button"
            onClick={() => navigate({ to: "/apps" })}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            See all
            <ChevronRight className="w-4 h-4" />
          </button>
        }
      />
      <div className="relative">
        <div
          tabIndex={0}
          role="region"
          aria-label="App showcase"
          className="flex gap-4 overflow-x-auto scrollbar-on-hover pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
        >
          {featured.map((app) => (
            <div key={app.id} className="w-56 flex-shrink-0">
              <AppShowcaseCard
                app={app}
                thumbnailUrl={thumbnailByAppId.get(app.id) ?? null}
                onClick={openApp}
              />
              <p className="mt-1.5 truncate px-0.5 font-mono text-[11px] text-muted-foreground">
                {app.path} ·{" "}
                {formatDistanceToNow(new Date(app.updatedAt ?? app.createdAt), { addSuffix: true })}
              </p>
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => navigate({ to: "/apps" })}
              className="flex flex-col items-center justify-center w-56 aspect-[4/3] flex-shrink-0 rounded-lg border border-dashed border-border bg-(--background-lighter) hover:border-primary/40 hover:bg-(--background-lightest) transition-all duration-200 active:scale-[0.99]"
            >
              <ChevronRight className="w-6 h-6 text-muted-foreground mb-1" />
              <span className="text-sm font-medium">See more</span>
            </button>
          )}
        </div>
        {/* Trailing fade hints that more cards exist off-screen, since the
            scrollbar is hidden until hover and the cards fill the width. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent rounded-r-lg"
        />
      </div>
    </section>
  );
}
