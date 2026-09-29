import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  Pencil,
  Copy,
  Trash2,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  X,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  type LucideIcon,
} from "lucide-react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ipc } from "@/ipc/types";
import type { ChatProjectFileNode } from "@/ipc/types";
import { showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useAtom } from "jotai";
import { isChatPanelHiddenAtom, isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { GoogleDriveSyncPanel } from "@/components/GoogleDriveSyncPanel";
import { FilePreview } from "@/components/preview_panel/FilePreview";
import { useFileManager, type FileManagerApi } from "@/components/preview_panel/useFileManager";
import { NamePromptDialog, ConfirmDeleteDialog } from "@/components/preview_panel/FileTreeDialogs";

interface ChatProjectPreviewProps {
  projectId: number | null;
  projectName?: string;
}

interface TreeNode {
  node: ChatProjectFileNode;
  children: TreeNode[];
}

function buildTree(nodes: ChatProjectFileNode[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const node of nodes) {
    const treeNode: TreeNode = { node, children: [] };
    byPath.set(node.path, treeNode);
  }
  for (const node of nodes) {
    const treeNode = byPath.get(node.path)!;
    const parentPath = node.path.includes("/")
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : null;
    const parent = parentPath ? byPath.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }
  return roots;
}

function TreeItem({
  treeNode,
  depth,
  expanded,
  onToggle,
  selectedPath,
  onSelect,
  fileManager,
  projectRootPath,
}: {
  treeNode: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selectedPath: string | null;
  onSelect: (node: ChatProjectFileNode) => void;
  fileManager: FileManagerApi;
  projectRootPath?: string;
}) {
  const { node, children } = treeNode;
  const isDir = node.type === "dir";
  const isExpanded = isDir && expanded.has(node.path);
  const Icon: LucideIcon = isDir ? (isExpanded ? FolderOpen : Folder) : FileText;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger className="block w-full">
          <div
            role="button"
            tabIndex={0}
            onClick={() => (isDir ? onToggle(node.path) : onSelect(node))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (isDir) onToggle(node.path);
                else onSelect(node);
              }
            }}
            className={`group flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-1 text-left text-[13px] leading-5 transition-colors cursor-pointer ${
              !isDir && selectedPath === node.path
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-foreground/90 hover:bg-sidebar-accent/60"
            }`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {isDir ? (
                isExpanded ? (
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="w-[14px] shrink-0" />
              )}
              <Icon
                size={14}
                className={`shrink-0 ${
                  isDir
                    ? "text-muted-foreground"
                    : node.isMarkdown
                      ? "text-sky-600 dark:text-sky-400"
                      : "text-muted-foreground"
                }`}
              />
              <span className="min-w-0 truncate">{node.name}</span>
              {!isDir && node.isMarkdown && (
                <span className="ml-1 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  md
                </span>
              )}
            </div>

            {/* Hover quick action buttons */}
            <div
              className="hidden shrink-0 items-center gap-1 group-hover:flex"
              onClick={(e) => e.stopPropagation()}
            >
              {isDir && (
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  title="New file in folder"
                  onClick={() => fileManager.actions.newFile(node.path)}
                >
                  <FilePlus size={13} />
                </button>
              )}
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                title="Rename"
                onClick={() => fileManager.actions.rename(node.path)}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                title="Delete"
                onClick={() => fileManager.actions.delete([node.path])}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          {isDir ? (
            <>
              <ContextMenuItem onClick={() => fileManager.actions.newFile(node.path)}>
                <FilePlus className="mr-2 h-3.5 w-3.5" />
                New File
              </ContextMenuItem>
              <ContextMenuItem onClick={() => fileManager.actions.newFolder(node.path)}>
                <FolderPlus className="mr-2 h-3.5 w-3.5" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem onClick={() => fileManager.actions.rename(node.path)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const absPath = projectRootPath
                ? `${projectRootPath.replace(/[\\/]+$/, "")}/${node.path.replace(/^[\\/]+/, "")}`
                : node.path;
              navigator.clipboard.writeText(absPath);
              showSuccess("Copied absolute path");
            }}
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy Absolute Path
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              navigator.clipboard.writeText(node.path);
              showSuccess("Copied relative path");
            }}
          >
            <FileText className="mr-2 h-3.5 w-3.5" />
            Copy Relative Path
          </ContextMenuItem>
          {projectRootPath && (
            <ContextMenuItem
              onClick={() => {
                const absPath = `${projectRootPath.replace(/[\\/]+$/, "")}/${node.path.replace(/^[\\/]+/, "")}`;
                ipc.system.showItemInFolder(absPath);
              }}
            >
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              Reveal in Folder
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => fileManager.actions.delete([node.path])}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isExpanded &&
        children.map((child) => (
          <TreeItem
            key={child.node.path}
            treeNode={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selectedPath={selectedPath}
            onSelect={onSelect}
            fileManager={fileManager}
            projectRootPath={projectRootPath}
          />
        ))}
    </div>
  );
}

export function ChatProjectPreview({ projectId, projectName }: ChatProjectPreviewProps) {
  const [isChatPanelHidden, setIsChatPanelHidden] = useAtom(isChatPanelHiddenAtom);
  const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);

  const fileTreeRef = useRef<ImperativePanelHandle>(null);
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const appQuery = useQuery({
    queryKey: ["app", projectId],
    queryFn: () => (projectId != null ? ipc.app.getApp(projectId) : null),
    enabled: projectId != null,
  });
  const projectRootPath = appQuery.data?.resolvedPath || "";

  const filesQuery = useQuery({
    queryKey: ["chatProjectFiles", projectId],
    queryFn: async () => {
      if (projectId == null) return [];
      const res = await ipc.chatProject.listFiles(projectId);
      return res;
    },
    enabled: projectId != null,
  });

  const existingPaths = useMemo(() => {
    return new Set((filesQuery.data ?? []).map((f) => f.path));
  }, [filesQuery.data]);

  const fileManager = useFileManager({
    appId: projectId,
    existingPaths,
    refresh: () => {
      void filesQuery.refetch();
    },
    onMoved: (paths) => {
      if (selectedPath && paths.includes(selectedPath)) {
        setSelectedPath(null);
      }
    },
  });

  const tree = useMemo(() => buildTree(filesQuery.data ?? []), [filesQuery.data]);

  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    const filterNode = (tn: TreeNode): TreeNode | null => {
      const matchSelf = tn.node.name.toLowerCase().includes(q);
      const filteredChildren = tn.children.map(filterNode).filter((c): c is TreeNode => c !== null);
      if (matchSelf || filteredChildren.length > 0) {
        return { node: tn.node, children: filteredChildren };
      }
      return null;
    };
    return tree.map(filterNode).filter((n): n is TreeNode => n !== null);
  }, [tree, search]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleSelect = (node: ChatProjectFileNode) => {
    if (node.type === "file") {
      setSelectedPath(node.path);
    }
  };

  const toggleFileTree = () => {
    const panel = fileTreeRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      setIsFileTreeCollapsed(false);
    } else {
      panel.collapse();
      setIsFileTreeCollapsed(true);
    }
  };

  const emptyVisible = (filesQuery.data ?? []).length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Top Preview Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0 bg-background/80 backdrop-blur">
        <div className="min-w-0 flex items-center gap-2 flex-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={toggleFileTree}
                >
                  {isFileTreeCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                </Button>
              }
            />
            <TooltipContent>
              {isFileTreeCollapsed ? "Expand file list" : "Collapse file list"}
            </TooltipContent>
          </Tooltip>

          <div className="truncate text-sm font-semibold text-foreground">
            {projectName ?? "Chat project"}
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
            Docs & files
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Full Mode Toggle (Expand right preview to full width / Restore split view) */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsChatPanelHidden(!isChatPanelHidden)}
                >
                  {isChatPanelHidden ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </Button>
              }
            />
            <TooltipContent>
              {isChatPanelHidden ? "Restore split view" : "Full mode (hide chat)"}
            </TooltipContent>
          </Tooltip>

          {/* Collapse Preview Section */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsPreviewOpen(false)}
                >
                  <PanelRightClose size={15} />
                </Button>
              }
            />
            <TooltipContent>Close preview section</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {projectId != null && (
        <div className="border-b border-border px-3 py-1.5 shrink-0 bg-muted/5">
          <GoogleDriveSyncPanel appId={projectId} />
        </div>
      )}

      {/* Resizable / Expandable Main Content Area */}
      <PanelGroup
        direction="horizontal"
        autoSaveId="chat-project-file-tree"
        className="min-h-0 flex-1 overflow-hidden"
      >
        {/* Expandable / Collapsible File List Sidebar */}
        <Panel
          ref={fileTreeRef}
          id="chat-project-files-panel"
          collapsible
          defaultSize={26}
          minSize={15}
          maxSize={55}
          onCollapse={() => setIsFileTreeCollapsed(true)}
          onExpand={() => setIsFileTreeCollapsed(false)}
          className="flex flex-col border-r border-border bg-muted/20 min-w-0"
        >
          {/* File list management actions & search header */}
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5 shrink-0 bg-background/50">
            <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter files…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => fileManager.actions.newFile("")}
                    >
                      <FilePlus size={13} />
                    </Button>
                  }
                />
                <TooltipContent>New file</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => fileManager.actions.newFolder("")}
                    >
                      <FolderPlus size={13} />
                    </Button>
                  }
                />
                <TooltipContent>New folder</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        void filesQuery.refetch();
                      }}
                    >
                      <RefreshCw
                        size={13}
                        className={filesQuery.isFetching ? "animate-spin" : ""}
                      />
                    </Button>
                  }
                />
                <TooltipContent>Refresh files</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {filesQuery.isLoading ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">Loading…</div>
            ) : emptyVisible ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground space-y-2">
                <p>No files yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => fileManager.actions.newFile("")}
                >
                  <FilePlus size={12} />
                  Create First Document
                </Button>
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No files match "{search}"
              </div>
            ) : (
              filteredTree.map((n) => (
                <TreeItem
                  key={n.node.path}
                  treeNode={n}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  selectedPath={selectedPath}
                  onSelect={handleSelect}
                  fileManager={fileManager}
                  projectRootPath={projectRootPath}
                />
              ))
            )}
          </div>
        </Panel>

        <PanelResizeHandle
          aria-label="Resize file list"
          className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize shrink-0"
        />

        {/* Content Viewer / Universal File Preview Panel */}
        <Panel
          id="chat-project-content-panel"
          defaultSize={74}
          minSize={30}
          className="flex min-w-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedPath == null ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <FileText size={28} className="text-muted-foreground/50" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  Select a file to preview it. Documents, slides, spreadsheets, SVG, HTML, and media
                  render in full interactive fidelity.
                </p>
              </div>
            ) : (
              <FilePreview
                key={selectedPath}
                appId={projectId}
                filePath={selectedPath}
                appRootPath={projectRootPath}
              />
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* File Manager Dialogs */}
      {fileManager.nameDialog && (
        <NamePromptDialog
          open={fileManager.nameDialog != null}
          title={
            fileManager.nameDialog.kind === "new-file"
              ? "New File"
              : fileManager.nameDialog.kind === "new-folder"
                ? "New Folder"
                : "Rename"
          }
          initialValue={
            fileManager.nameDialog.kind === "rename" && fileManager.nameDialog.path
              ? (fileManager.nameDialog.path.split("/").pop() ?? "")
              : ""
          }
          submitLabel={fileManager.nameDialog.kind === "rename" ? "Rename" : "Create"}
          onOpenChange={(open) => {
            if (!open) fileManager.closeNameDialog();
          }}
          onSubmit={fileManager.submitNameDialog}
        />
      )}

      {fileManager.deleteTarget && (
        <ConfirmDeleteDialog
          open={fileManager.deleteTarget != null}
          paths={fileManager.deleteTarget.paths}
          busy={fileManager.deleteBusy}
          onOpenChange={(open) => {
            if (!open) fileManager.closeDeleteDialog();
          }}
          onConfirm={fileManager.confirmDelete}
        />
      )}
    </div>
  );
}
