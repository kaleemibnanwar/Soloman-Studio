import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Star } from "lucide-react";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { ListedApp } from "@/ipc/types/app";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ipc } from "@/ipc/types";
import { useTranslation } from "react-i18next";
import { showError } from "@/lib/toast";

type AppItemProps = {
  app: ListedApp;
  handleAppClick: (id: number) => void;
  selectedAppId: number | null;
  enableMultiWindow: boolean;
};

export function AppItem({ app, handleAppClick, selectedAppId, enableMultiWindow }: AppItemProps) {
  const { t } = useTranslation("home");
  const appButton = (
    <div className="flex w-full items-center" title={app.name}>
      <Button
        variant="ghost"
        onClick={() => handleAppClick(app.id)}
        className={`flex h-auto w-full items-center justify-start gap-2 rounded-lg py-1.5 pr-3 pl-6 text-left hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground ${
          selectedAppId === app.id
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/75"
        }`}
        data-testid={`app-list-item-${app.name}`}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{app.name}</span>
        {app.isFavorite && <Star size={12} className="fill-primary text-primary shrink-0" />}
        <span className="shrink-0 text-[11px] whitespace-nowrap text-sidebar-foreground/40">
          {formatDistanceToNow(new Date(app.createdAt), {
            addSuffix: true,
          })}
        </span>
      </Button>
    </div>
  );

  return (
    <SidebarMenuItem className="relative">
      {enableMultiWindow ? (
        <ContextMenu>
          <ContextMenuTrigger>{appButton}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() =>
                void ipc.windowInfrastructure
                  .openEntityInNewWindow({
                    kind: "app",
                    id: app.id,
                  })
                  .catch(showError)
              }
            >
              <ExternalLink size={14} />
              {t("openInNewWindow")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        appButton
      )}
    </SidebarMenuItem>
  );
}
