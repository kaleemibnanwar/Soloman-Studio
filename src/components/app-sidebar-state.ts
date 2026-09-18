export type AppSidebarPanel = "Apps" | "Settings" | "Library";

export type AppSidebarItemTitle = "Settings" | "Library";

export function getRouteSidebarPanel(
  pathname: string,
): AppSidebarPanel | null {
  // Apps, chat projects, the default-bucket chats, AND Tasks all share one
  // default listing (AppList) — there are no top-level nav items for them.
  // Tasks is an entry inside that listing, so /tasks still shows the merged
  // "Apps" panel (with the Tasks row highlighted), never an empty sidebar.
  if (
    pathname === "/chat" ||
    pathname.startsWith("/chat") ||
    pathname === "/" ||
    pathname.startsWith("/apps") ||
    pathname.startsWith("/app-details") ||
    pathname.startsWith("/tasks")
  ) {
    return "Apps";
  }

  if (pathname.startsWith("/settings")) {
    return "Settings";
  }

  // Templates is a tab inside the Library panel (not its own route prefix),
  // so it counts as "Library" here too — the panel and its active state
  // stay put while browsing Templates, the same as Themes/Prompts/Media.
  if (pathname.startsWith("/library") || pathname.startsWith("/templates")) {
    return "Library";
  }

  return null;
}

// Panels (Apps/Library/Settings) only ever show because the current route
// matches one — clicking a row is what gets you there, not hovering it. The
// sidebar has no collapsed state to hide behind, so this is just an alias
// for the route lookup, kept as its own name for what AppSidebar actually
// asks: "which panel is selected."
export function getSelectedSidebarPanel({
  pathname,
}: {
  pathname: string;
}): AppSidebarPanel | null {
  return getRouteSidebarPanel(pathname);
}

export function isSidebarItemActive({
  title,
  pathname,
}: {
  title: AppSidebarItemTitle;
  pathname: string;
}) {
  if (title === "Settings") {
    return pathname.startsWith("/settings");
  }
  return pathname.startsWith("/library") || pathname.startsWith("/templates");
}

export function shouldShowSelectedAppChatList({
  selectedPanel,
  selectedAppId,
  pathname,
  defaultChatProjectId,
}: {
  selectedPanel: AppSidebarPanel | null;
  selectedAppId: number | null;
  pathname: string;
  // The default (projectless) bucket's own conversations are already listed
  // flat in the merged Apps panel — selecting one there must not *also*
  // drill into a nested chat-list view for it the way a real app or chat
  // project does, since that would just show the same conversations again
  // behind a redundant transition.
  defaultChatProjectId?: number | null;
}) {
  if (selectedPanel !== "Apps" || selectedAppId === null) {
    return false;
  }
  if (pathname.startsWith("/app-details")) {
    return true;
  }
  if (pathname === "/chat") {
    return selectedAppId !== defaultChatProjectId;
  }
  return false;
}
