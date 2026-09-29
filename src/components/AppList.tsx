import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { Folder, Plus, Search, Star, Upload, Loader2, X, MoreVertical, Trash2 } from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { removeChatIdFromAllTrackingAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";
import { SidebarGroup, SidebarGroupContent, SidebarMenu } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useOpenApp } from "@/hooks/useOpenApp";
import { useChats } from "@/hooks/useChats";
import { useSelectChat } from "@/hooks/useSelectChat";
import { useAppCollections } from "@/hooks/useAppCollections";
import { useSettings } from "@/hooks/useSettings";
import { useSidebarSectionCollapse } from "@/hooks/useSidebarSectionCollapse";
import { useMemo, useState } from "react";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { ClearAllChatsDialog } from "@/components/chat/ClearAllChatsDialog";
import { SectionHeader, HeaderIconButton } from "@/components/SidebarSectionHeader";
import { TasksSection } from "@/components/TasksSection";
import { AppSearchDialog } from "./AppSearchDialog";
import { AppItem } from "./appItem";
import { NewProjectDialog } from "./NewProjectDialog";
import { ImportProjectDialog } from "./ImportProjectDialog";

export function AppList({
  show,
  onImportClick,
}: {
  show?: boolean;
  // The Import dialog is rendered by the parent sidebar, outside the
  // conditional block that mounts AppList, so it isn't torn down (along with
  // any in-progress import) by the panel switch — see app-sidebar.tsx for
  // where onImportClick opens it.
  onImportClick: () => void;
}) {
  const { t } = useTranslation("chat");
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);

  const openApp = useOpenApp();
  const { apps, loading, error } = useLoadApps();
  const { collections } = useAppCollections();
  const { settings } = useSettings();
  const enableMultiWindow = !!settings?.enableMultiWindow;
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const { selectChat } = useSelectChat();
  const removeChatIdFromAllTracking = useSetAtom(removeChatIdFromAllTrackingAtom);
  const { collapsed: codingProjectsCollapsed, toggle: toggleCodingProjects } =
    useSidebarSectionCollapse("coding-projects");
  const { collapsed: chatProjectsCollapsed, toggle: toggleChatProjects } =
    useSidebarSectionCollapse("chat-projects");
  const { collapsed: chatsCollapsed, toggle: toggleChats } = useSidebarSectionCollapse("chats");

  const allApps = useMemo(
    () =>
      apps
        .filter((a) => a.type !== "chat" && !a.isDefaultChatProject)
        .map((a) => ({
          id: a.id,
          name: a.name,
          createdAt: a.createdAt,
          matchedChatTitle: null,
          matchedChatMessage: null,
        })),
    [apps],
  );

  const favoriteApps = useMemo(
    () => apps.filter((app) => app.isFavorite && app.type !== "chat" && !app.isDefaultChatProject),
    [apps],
  );

  const visibleCollectionIds = useMemo(() => new Set(collections.map((c) => c.id)), [collections]);

  const nonFavoriteApps = useMemo(
    () =>
      apps.filter(
        (app) =>
          app.type !== "chat" &&
          !app.isDefaultChatProject &&
          !app.isFavorite &&
          (app.collectionId == null || !visibleCollectionIds.has(app.collectionId)),
      ),
    [apps, visibleCollectionIds],
  );

  const collectionMembers = useMemo(() => {
    const byId = new Map<number, typeof apps>();
    for (const app of apps) {
      if (app.collectionId == null) continue;
      if (!visibleCollectionIds.has(app.collectionId)) continue;
      const list = byId.get(app.collectionId) ?? [];
      list.push(app);
      byId.set(app.collectionId, list);
    }
    return byId;
  }, [apps, visibleCollectionIds]);

  const chatProjects = useMemo(
    () => apps.filter((app) => app.type === "chat" && !app.isDefaultChatProject),
    [apps],
  );
  const defaultChatProjectId = useMemo(
    () => apps.find((app) => app.isDefaultChatProject)?.id ?? null,
    [apps],
  );
  const defaultChatProjectName = useMemo(
    () => apps.find((app) => app.isDefaultChatProject)?.name ?? "Chats",
    [apps],
  );
  const {
    chats: defaultChats,
    loading: defaultChatsLoading,
    invalidateChats,
  } = useChats(defaultChatProjectId);

  const handleAppClick = (id: number) => {
    setIsSearchDialogOpen(false);
    openApp(id);
  };

  const handleChatProjectClick = (projectId: number) => {
    setSelectedAppId(projectId);
    setSelectedChatId(null);
    navigate({ to: "/chat", search: { appId: projectId } });
  };

  const handleNewChat = async () => {
    try {
      const { chatId, appId } = await ipc.chat.createChatInDefaultProject();
      selectChat({ chatId, appId });
    } catch (error) {
      showError(
        error instanceof Error
          ? `Failed to create a new chat: ${error.message}`
          : "Failed to create a new chat",
      );
    }
  };

  const handleClearHistory = async () => {
    if (defaultChatProjectId == null) return;
    setIsClearingAll(true);
    try {
      const clearedChatIds = defaultChats.map((chat) => chat.id);
      await ipc.chat.clearAppChats(defaultChatProjectId);
      showSuccess("Chat history cleared");
      for (const chatId of clearedChatIds) {
        removeChatIdFromAllTracking(chatId);
      }
      setSelectedChatId(null);
      navigate({ to: "/chat", search: { appId: defaultChatProjectId } });
      await invalidateChats();
      setIsClearAllDialogOpen(false);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to clear chat history");
    } finally {
      setIsClearingAll(false);
    }
  };

  if (!show) {
    return null;
  }

  const hasApps =
    favoriteApps.length > 0 || nonFavoriteApps.length > 0 || collectionMembers.size > 0;
  const hasChatProjects = chatProjects.length > 0;
  const isLoadingDefaultChats = defaultChatProjectId != null && defaultChatsLoading;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery !== "";

  // A universal, live filter over the merged list: coding projects, chat
  // projects, default conversations, and the Tasks destination.
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    type Result =
      | { kind: "app"; id: number; name: string; createdAt: Date }
      | { kind: "chat-project"; id: number; name: string; isFavorite: boolean }
      | { kind: "chat"; id: number; title: string; createdAt: Date };
    const results: Result[] = [];
    for (const app of apps) {
      if (app.type === "chat" || app.isDefaultChatProject) continue;
      if (app.name.toLowerCase().includes(trimmedQuery)) {
        results.push({ kind: "app", id: app.id, name: app.name, createdAt: app.createdAt });
      }
    }
    for (const proj of chatProjects) {
      if (proj.name.toLowerCase().includes(trimmedQuery)) {
        results.push({
          kind: "chat-project",
          id: proj.id,
          name: proj.name,
          isFavorite: proj.isFavorite,
        });
      }
    }
    if (defaultChatProjectId != null) {
      for (const chat of defaultChats) {
        if ((chat.title ?? "").toLowerCase().includes(trimmedQuery)) {
          results.push({
            kind: "chat",
            id: chat.id,
            title: chat.title ?? "",
            createdAt: chat.createdAt,
          });
        }
      }
    }
    return results;
  }, [isSearching, trimmedQuery, apps, chatProjects, defaultChats, defaultChatProjectId]);

  return (
    <>
      <SidebarGroup className="h-full overflow-y-auto" data-testid="app-list-container">
        <SidebarGroupContent>
          <div className="flex flex-col gap-2">
            {/* Universal search — live-filters the merged list below. Deep
                search (chat message content) stays in the Cmd/Ctrl+K palette,
                reachable from the kbd chip on the right. */}
            <div className="mx-2 pt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search projects and chats"
                  className="w-full rounded-md border border-input bg-transparent py-1.5 pl-8 pr-[4.5rem] text-[13px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setIsSearchDialogOpen(true)}
                  data-testid="search-apps-button"
                  aria-label="Open search"
                  title="Open search (⌘K / Ctrl K)"
                  className="absolute right-1 top-1/2 flex h-5 -translate-y-1/2 items-center rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                >
                  ⌘K
                </button>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="py-2 px-4 text-sm text-muted-foreground">Loading apps...</div>
            ) : error ? (
              <div className="py-2 px-4 text-sm text-destructive">Error loading apps</div>
            ) : isSearching ? (
              searchResults && searchResults.length === 0 ? (
                <div className="py-3 px-4 text-sm text-muted-foreground">No results</div>
              ) : (
                <div className="space-y-0.5">
                  {searchResults?.map((r) =>
                    r.kind === "app" ? (
                      <button
                        key={`app-${r.id}`}
                        onClick={() => handleAppClick(r.id)}
                        className="mx-1 flex w-full items-center gap-2.5 rounded-lg pl-6 pr-3 py-2 text-left text-[13px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      >
                        <span className="truncate">{r.name}</span>
                      </button>
                    ) : r.kind === "chat-project" ? (
                      <button
                        key={`proj-${r.id}`}
                        onClick={() => handleChatProjectClick(r.id)}
                        className="mx-1 flex w-full items-center gap-2.5 rounded-lg pl-6 pr-3 py-2 text-left text-[13px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      >
                        <Folder className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="truncate">{r.name}</span>
                      </button>
                    ) : (
                      <button
                        key={`chat-${r.id}`}
                        onClick={() => selectChat({ chatId: r.id, appId: defaultChatProjectId! })}
                        className="mx-1 flex w-full items-center gap-2 rounded-lg pl-6 pr-3 py-1.5 text-left hover:bg-sidebar-accent/60"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-foreground/75">
                          {r.title || t("newChat")}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-sidebar-foreground/40">
                          {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              )
            ) : (
              <SidebarMenu className="space-y-1" data-testid="app-list">
                {/* Tasks — full list surfaced here, with its own + / edit /
                    delete, same as the project groups below. */}
                <TasksSection />

                {/* Coding projects — New/Import localized to this section. */}
                <SectionHeader
                  label="Coding Projects"
                  collapsed={codingProjectsCollapsed}
                  onToggleCollapsed={toggleCodingProjects}
                  actions={
                    <>
                      <HeaderIconButton
                        title="New Coding Project"
                        onClick={() => navigate({ to: "/" })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </HeaderIconButton>
                      <HeaderIconButton title="Import Coding Project" onClick={onImportClick}>
                        <Upload className="h-3.5 w-3.5" />
                      </HeaderIconButton>
                    </>
                  }
                />
                {codingProjectsCollapsed ? null : hasApps ? (
                  <>
                    {favoriteApps.length > 0 && (
                      <div className="pl-6 pr-3 pb-1 text-[10px] font-semibold tracking-[0.08em] text-sidebar-foreground/45 uppercase">
                        Favorites
                      </div>
                    )}
                    {favoriteApps.map((app) => (
                      <AppItem
                        key={app.id}
                        app={app}
                        handleAppClick={handleAppClick}
                        selectedAppId={selectedAppId}
                        enableMultiWindow={enableMultiWindow}
                      />
                    ))}
                    {collections.length > 0 && (
                      <div data-testid="sidebar-collections-section" className="mt-2">
                        <div className="pl-6 pr-3 pb-1 text-[10px] font-semibold tracking-[0.08em] text-sidebar-foreground/45 uppercase">
                          Collections
                        </div>
                        <Accordion multiple className="pl-4 pr-1 ml-2">
                          {collections.map((collection) => {
                            const members = collectionMembers.get(collection.id) ?? [];
                            return (
                              <AccordionItem
                                key={collection.id}
                                value={`collection-${collection.id}`}
                                className="border-b-0"
                                data-testid={`sidebar-collection-${collection.id}`}
                              >
                                <AccordionTrigger className="py-2 px-2 hover:no-underline hover:bg-sidebar-accent/60 rounded-md">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <Folder size={14} className="shrink-0 text-muted-foreground" />
                                    <span className="truncate text-sm">{collection.name}</span>
                                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                                      {members.length}
                                    </span>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="pb-1 pl-3">
                                  {members.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                      Empty
                                    </div>
                                  ) : (
                                    members.map((app) => (
                                      <AppItem
                                        key={app.id}
                                        app={app}
                                        handleAppClick={handleAppClick}
                                        selectedAppId={selectedAppId}
                                        enableMultiWindow={enableMultiWindow}
                                      />
                                    ))
                                  )}
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </div>
                    )}
                    {nonFavoriteApps.length > 0 &&
                      (favoriteApps.length > 0 || collections.length > 0) && (
                        <div className="pl-6 pr-3 pb-1 pt-2 text-[10px] font-semibold tracking-[0.08em] text-sidebar-foreground/45 uppercase">
                          Other
                        </div>
                      )}
                    {nonFavoriteApps.map((app) => (
                      <AppItem
                        key={app.id}
                        app={app}
                        handleAppClick={handleAppClick}
                        selectedAppId={selectedAppId}
                        enableMultiWindow={enableMultiWindow}
                      />
                    ))}
                  </>
                ) : (
                  <div className="pl-6 pr-3 py-2 text-xs text-muted-foreground/60">
                    No coding projects yet
                  </div>
                )}

                {/* Chat projects — its own New/Import, same header pattern. */}
                <div className="mt-3">
                  <SectionHeader
                    label="Chat Projects"
                    collapsed={chatProjectsCollapsed}
                    onToggleCollapsed={toggleChatProjects}
                    actions={
                      <>
                        <HeaderIconButton
                          title="New Chat Project"
                          onClick={() => setIsNewDialogOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </HeaderIconButton>
                        <HeaderIconButton
                          title="Import Chat Project"
                          onClick={() => setIsImportDialogOpen(true)}
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </HeaderIconButton>
                      </>
                    }
                  />
                  {chatProjectsCollapsed ? null : hasChatProjects ? (
                    chatProjects.map((proj) => {
                      const isActive = selectedAppId === proj.id;
                      return (
                        <button
                          key={proj.id}
                          onClick={() => handleChatProjectClick(proj.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex h-9 w-full shrink-0 items-center gap-2.5 rounded-lg pl-6 pr-3 text-left text-[13px] font-medium transition-colors",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Folder className="h-4 w-4 shrink-0 opacity-70" />
                          <span className="truncate flex-1">{proj.name}</span>
                          {proj.isFavorite && (
                            <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="pl-6 pr-3 py-2 text-xs text-muted-foreground/60">
                      No chat projects yet
                    </div>
                  )}
                </div>

                {/* Default-bucket conversations, flat. Header is always shown
                    so "+" (new chat) and "…" (clear history) stay reachable
                    even when there are no conversations yet. */}
                <div className="mt-3">
                  <SectionHeader
                    label="Chats"
                    collapsed={chatsCollapsed}
                    onToggleCollapsed={toggleChats}
                    actions={
                      <>
                        <HeaderIconButton title="New chat" onClick={handleNewChat}>
                          <Plus className="h-3.5 w-3.5" />
                        </HeaderIconButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
                            aria-label="Chat actions"
                            title="Chat actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="space-y-1 p-2">
                            <DropdownMenuItem
                              onClick={() => setIsClearAllDialogOpen(true)}
                              disabled={defaultChats.length === 0}
                              className="px-3 py-2 text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Clear history</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    }
                  />
                  {chatsCollapsed ? null : isLoadingDefaultChats ? (
                    <div className="flex items-center gap-2 pl-6 pr-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading chats...
                    </div>
                  ) : defaultChats.length === 0 ? (
                    <div className="pl-6 pr-3 py-2 text-xs text-muted-foreground/60">
                      No conversations yet
                    </div>
                  ) : (
                    defaultChats.map((chat) => {
                      const isActive =
                        selectedChatId === chat.id && selectedAppId === defaultChatProjectId;
                      return (
                        <button
                          key={chat.id}
                          onClick={() =>
                            selectChat({ chatId: chat.id, appId: defaultChatProjectId! })
                          }
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg pl-6 pr-3 py-1.5 text-left transition-colors",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {chat.title || t("newChat")}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-[11px] text-sidebar-foreground/40">
                            {formatDistanceToNow(new Date(chat.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </SidebarMenu>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
      <AppSearchDialog
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
        onSelectApp={handleAppClick}
        allApps={allApps}
      />
      <NewProjectDialog
        open={isNewDialogOpen}
        onOpenChange={setIsNewDialogOpen}
        defaultType="chat"
      />
      <ImportProjectDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        defaultType="chat"
      />
      <ClearAllChatsDialog
        isOpen={isClearAllDialogOpen}
        onOpenChange={(open) => {
          if (!isClearingAll) setIsClearAllDialogOpen(open);
        }}
        onConfirmClear={handleClearHistory}
        appName={defaultChatProjectName}
        chatCount={defaultChats.length}
      />
    </>
  );
}
