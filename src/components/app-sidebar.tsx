import { type LucideIcon, Settings, HelpCircle, BookOpen, ClipboardList, Bot } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";

import { useReducedMotionPref } from "@/hooks/useReducedMotion";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ChatList } from "./ChatList";
import { EconomyModeSwitch } from "./EconomyModeSwitch";
import { AppList } from "./AppList";
import { ImportAppDialog } from "./ImportAppDialog";
import { HelpDialog } from "./HelpDialog";
import { helpDialogAtom } from "@/atoms/helpDialogAtom";
import { SettingsList } from "./SettingsList";
import { LibraryList } from "./LibraryList";
import { useLoadApps } from "@/hooks/useLoadApps";
import {
  getSelectedSidebarPanel,
  isSidebarItemActive,
  shouldShowSelectedAppChatList,
} from "./app-sidebar-state";

/**
 * A single full-width nav row: icon in a fixed-width slot on the left, label
 * beside it.
 */
function NavRow({
  icon: Icon,
  label,
  isActive = false,
  to,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  to?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "group/nav-row relative flex h-9 w-full shrink-0 select-none items-center overflow-hidden rounded-md outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring/40",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground active:bg-sidebar-accent",
  );

  const content = (
    <>
      <span className="flex h-9 w-12 shrink-0 items-center justify-center">
        <Icon className="size-[16px] text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1 truncate pr-3 text-left text-[13px] font-medium leading-none whitespace-nowrap">
        {label}
      </span>
    </>
  );

  return to ? (
    <Link
      to={to}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={className}
      onClick={onClick}
    >
      {content}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={className}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export function AppSidebar() {
  // Owned here (rather than inside AppList) and rendered outside the
  // panel-switching block below, so switching to another sidebar panel while
  // this dialog is open — which unmounts AppList — can't silently discard an
  // in-progress import.
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const setHelpDialog = useSetAtom(helpDialogAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotionPref();

  const { apps } = useLoadApps();
  // Still needed here even though chat projects no longer get their own nav
  // item: the default (projectless) bucket's conversations are listed flat
  // in AppList, so opening one must not also drill into a nested chat-list
  // view for it — see shouldShowSelectedAppChatList.
  const defaultChatProjectId = useMemo(
    () => apps.find((app) => app.isDefaultChatProject)?.id ?? null,
    [apps],
  );

  const routerState = useRouterState();
  const selectedItem = getSelectedSidebarPanel({
    pathname: routerState.location.pathname,
  });
  const showSelectedAppChats = shouldShowSelectedAppChatList({
    selectedPanel: selectedItem,
    selectedAppId,
    pathname: routerState.location.pathname,
    defaultChatProjectId,
  });

  const slideTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Spacer clearing the title-bar (window drag region) height. The
              former full-width "New chat" primary action lived here; it now
              lives as a "+" button in the Chats section of AppList. */}
          <div className="shrink-0 h-[calc(var(--layout-title-bar-offset)+0.25rem)]" aria-hidden />

          {/* Contextual list — the merged Apps/Tasks/Chat listing is the
              default view; Settings/Library are reachable from the footer.
              Fills the remaining height below the title-bar spacer. */}
          <div className="relative min-h-0 flex-1 overflow-hidden border-t border-sidebar-border/70">
            {/* Plain conditional rendering (no AnimatePresence): each panel's
                visibility is driven directly by the current boolean, so a
                panel switch can never get stuck behind a stale panel whose
                exit animation didn't complete (framer-motion's exit tracking
                can drop/interrupt an exit when the underlying state changes
                more than once in the same render pass, e.g. selecting a chat
                project fires both setSelectedAppId and navigate). The
                motion.div below only animates the *entrance* of whichever
                panel is current. */}
            {selectedItem === "Apps" && !showSelectedAppChats && (
              <motion.div
                key="apps"
                className="absolute inset-0"
                initial={{ x: reducedMotion ? 0 : "-100%" }}
                animate={{ x: 0 }}
                transition={slideTransition}
              >
                <AppList show onImportClick={() => setIsImportDialogOpen(true)} />
              </motion.div>
            )}
            {showSelectedAppChats && (
              <motion.div
                key="chats"
                className="absolute inset-0"
                initial={{ x: reducedMotion ? 0 : "100%" }}
                animate={{ x: 0 }}
                transition={slideTransition}
              >
                <ChatList
                  show
                  showViewAllAppsButton
                  onViewAllApps={() => {
                    // Apps and chat projects share the one Apps listing now,
                    // so "view all" always just means that listing.
                    setSelectedAppId(null);
                    setSelectedChatId(null);
                    navigate({ to: "/", search: { appId: undefined } });
                  }}
                />
              </motion.div>
            )}
            <SettingsList show={selectedItem === "Settings"} />
            <LibraryList show={selectedItem === "Library"} />
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="items-start gap-0 px-1">
        <div className="w-full space-y-0.5 pb-1">
          <NavRow
            icon={Bot}
            label="Coworkers"
            to="/tasks"
            isActive={routerState.location.pathname.startsWith("/tasks")}
          />
          <NavRow
            icon={ClipboardList}
            label="Planner"
            to="/planner"
            isActive={routerState.location.pathname.startsWith("/planner")}
          />
          <NavRow
            icon={Settings}
            label="Settings"
            to="/settings"
            isActive={isSidebarItemActive({
              title: "Settings",
              pathname: routerState.location.pathname,
            })}
          />
          <NavRow
            icon={BookOpen}
            label="Library"
            to="/library"
            isActive={isSidebarItemActive({
              title: "Library",
              pathname: routerState.location.pathname,
            })}
          />
          <NavRow icon={HelpCircle} label="Help" onClick={() => setHelpDialog({ open: true })} />
        </div>
        <div aria-hidden className="mx-2 h-px w-[calc(100%-1rem)] shrink-0 bg-sidebar-border" />
        <EconomyModeSwitch />
      </SidebarFooter>
      <HelpDialog />
      <ImportAppDialog isOpen={isImportDialogOpen} onClose={() => setIsImportDialogOpen(false)} />
    </Sidebar>
  );
}
