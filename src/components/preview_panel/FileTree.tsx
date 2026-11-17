import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Link2,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  Search,
  Unlink,
  X,
  FilePlus,
  FolderPlus,
  Pencil,
  Copy,
  FileText,
  Scissors,
  ClipboardPaste,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { selectedFileAtom } from "@/atoms/viewAtoms";
import { getFileIconByPath } from "./preview/fileIcons";
import { useSetAtom } from "jotai";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { AppFileSearchResult } from "@/ipc/types";
import { ipc } from "@/ipc/types";
import { useSearchAppFiles } from "@/hooks/useSearchAppFiles";
import { useUncommittedFiles } from "@/hooks/useUncommittedFiles";
import { useUnsavedFiles } from "@/hooks/useUnsavedFiles";
import { useTranslation } from "react-i18next";
import { chatInputValueAtom } from "@/atoms/chatAtoms";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { LinkToProjectDialog } from "./LinkToProjectDialog";
import { useFileManager, type FileManagerApi } from "./useFileManager";
import {
  NamePromptDialog,
  ConfirmDeleteDialog,
  MoveToDialog,
  ConflictDialog,
} from "./FileTreeDialogs";

interface FileTreeProps {
  appId: number | null;
  files: string[];
  /** Re-reads the file list after a mutation (delegates to the app query). */
  refresh: () => void;
  /** Absolute OS path of the app root, for "copy path" / "reveal in folder". */
  appRootPath?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

/**
 * Per-path change state the tree decorates rows with. Bundled into one prop so
 * the recursive components don't grow three more parameters each.
 */
interface FileTreeStatus {
  /** Files with changes that are not committed yet (staged or unstaged). */
  uncommittedPaths: ReadonlySet<string>;
  /** Directories with at least one uncommitted descendant. */
  uncommittedDirs: ReadonlySet<string>;
  /** Files whose open editor buffer differs from disk. */
  unsavedPaths: ReadonlySet<string>;
  /** Directories with at least one unsaved descendant. */
  unsavedDirs: ReadonlySet<string>;
}

type FileMarker = "unsaved" | "uncommitted" | null;

const MARKER_CLASSES: Record<NonNullable<FileMarker>, string> = {
  // Matches the unsaved dot in the editor header (FileEditor's Breadcrumb).
  unsaved: "text-amber-600 dark:text-amber-400",
  uncommitted: "text-blue-600 dark:text-blue-400",
};

// Unsaved wins: a buffer that hasn't hit disk is the more urgent of the two.
const getFileMarker = (path: string, status: FileTreeStatus): FileMarker => {
  if (status.unsavedPaths.has(path)) return "unsaved";
  if (status.uncommittedPaths.has(path)) return "uncommitted";
  return null;
};

// Same precedence as getFileMarker, so a folder reports the most urgent state
// buried inside it rather than only its uncommitted descendants.
const getDirMarker = (path: string, status: FileTreeStatus): FileMarker => {
  if (status.unsavedDirs.has(path)) return "unsaved";
  if (status.uncommittedDirs.has(path)) return "uncommitted";
  return null;
};

/**
 * Ancestor directories of every path in `paths`, so collapsed folders can still
 * advertise changes buried inside them. Derived from the changed-file list
 * rather than by walking the tree, keeping this O(changed files x depth)
 * instead of O(all files) on every poll.
 */
export const collectAncestorDirs = (paths: ReadonlySet<string>): ReadonlySet<string> => {
  const dirs = new Set<string>();
  for (const filePath of paths) {
    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
};

/**
 * The rows `uncommittedFiles` should mark, reconciled against the tree's file
 * list so every marked path has a row to sit on.
 *
 * Two git-status shapes have no row of their own. Deleted files are gone from
 * disk, so they are dropped. A wholly-untracked directory arrives as a single
 * entry ending in "/" (git only reports untracked files individually under
 * `-uall`), so it is expanded into the files beneath it — dropping it instead
 * would leave brand-new files looking unchanged. Either one left as-is would
 * put a rollup dot on a folder whose children all show nothing.
 */
export const collectUncommittedPaths = (
  uncommittedFiles: readonly { path: string; status: string }[],
  files: readonly string[],
): ReadonlySet<string> => {
  const paths = new Set<string>();
  const untrackedDirs: string[] = [];
  for (const file of uncommittedFiles) {
    if (file.status === "deleted") continue;
    if (file.path.endsWith("/")) {
      untrackedDirs.push(file.path);
    } else {
      paths.add(file.path);
    }
  }
  // Only walk the (much longer) file list when there is a directory to expand.
  if (untrackedDirs.length > 0) {
    for (const filePath of files) {
      if (untrackedDirs.some((dir) => filePath.startsWith(dir))) {
        paths.add(filePath);
      }
    }
  }
  return paths;
};

/**
 * Change marker that trails the name, so the dot reads as belonging to the name
 * rather than sitting in a gutter column away from it. A folder's rollup dot is
 * drawn exactly like a file's: a dot that differed in size or color would read
 * as a third state rather than as the same change seen from one level up. Only
 * the label distinguishes them.
 *
 * Uses the native `title` rather than a Tooltip: tooltips open immediately on
 * hover, which flickers while moving the pointer down a dense tree.
 */
const ChangeMarkerDot = ({ marker, isDirectory }: { marker: FileMarker; isDirectory: boolean }) => {
  const { t } = useTranslation("home");

  if (!marker) return null;

  const label = isDirectory
    ? marker === "unsaved"
      ? t("preview.folderHasUnsavedChanges")
      : t("preview.folderHasUncommittedChanges")
    : marker === "unsaved"
      ? t("preview.unsavedChanges")
      : t("preview.uncommittedChanges");

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("ml-1.5 flex flex-shrink-0 items-center", MARKER_CLASSES[marker])}
    >
      <Circle size={8} fill="currentColor" />
    </span>
  );
};

const useDebouncedValue = <T,>(value: T, delay = 200) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const MentionFileButton = ({ filePath }: { filePath: string }) => {
  const handleMentionFile = useMentionFile(filePath);
  const { t } = useTranslation("home");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="ml-1 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
            onClick={handleMentionFile}
            aria-label={t("mentionFileInChat")}
          >
            <MessageCircle size={14} />
          </button>
        }
      />
      <TooltipContent>{t("mentionFileInChat")}</TooltipContent>
    </Tooltip>
  );
};

const useMentionFile = (filePath: string) => {
  const setChatInputValue = useSetAtom(chatInputValueAtom);
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    const mention = `@file:${filePath}`;
    setChatInputValue((prev) => {
      const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(prev)) return prev;
      const separator = prev.trim() ? " " : "";
      return prev.trimEnd() + separator + mention + " ";
    });
  };
};

const highlightMatch = (text: string, query: string) => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text;
  }

  const end = index + trimmedQuery.length;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {text.slice(index, end)}
      </mark>
      {text.slice(end)}
    </>
  );
};

// Convert flat file list to tree structure
const buildFileTree = (files: string[]): TreeNode[] => {
  const root: TreeNode[] = [];

  files.forEach((path) => {
    const parts = path.split("/");
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isLastPart = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join("/");

      // Check if this node already exists at the current level
      const existingNode = currentLevel.find((node) => node.name === part);

      if (existingNode) {
        // If we found the node, just drill down to its children for the next level
        currentLevel = existingNode.children;
      } else {
        // Create a new node
        const newNode: TreeNode = {
          name: part,
          path: currentPath,
          isDirectory: !isLastPart,
          children: [],
        };

        currentLevel.push(newNode);
        currentLevel = newNode.children;
      }
    });
  });

  return root;
};

// File tree component
export const FileTree = ({ appId, files, refresh, appRootPath }: FileTreeProps) => {
  const { t } = useTranslation("home");
  const [searchValue, setSearchValue] = useState("");
  const prevAppIdRef = useRef<number | null>(appId);
  const setSelectedFile = useSetAtom(selectedFileAtom);

  // Reset search when appId changes to prevent unnecessary IPC calls with old search term
  useEffect(() => {
    if (prevAppIdRef.current !== appId) {
      prevAppIdRef.current = appId;
      setSearchValue("");
    }
  }, [appId]);

  const debouncedSearch = useDebouncedValue(searchValue, 250);
  const isSearchMode = debouncedSearch.trim().length > 0;

  const {
    results: searchResults,
    loading: searchLoading,
    error: searchError,
  } = useSearchAppFiles(appId, debouncedSearch);

  const matchesByPath = useMemo(() => {
    const map = new Map<string, AppFileSearchResult>();
    for (const result of searchResults) {
      map.set(result.path, result);
    }
    return map;
  }, [searchResults]);

  const visibleFiles = useMemo(() => {
    if (!isSearchMode) {
      return files;
    }
    return files.filter((filePath) => matchesByPath.has(filePath));
  }, [files, isSearchMode, matchesByPath]);

  const treeData = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);

  const [linkDialogPath, setLinkDialogPath] = useState<string | null>(null);

  // CodeView (this component's parent) already subscribes to this query, so
  // this is a cache read rather than another IPC round trip.
  const { uncommittedFiles } = useUncommittedFiles(appId);
  const unsavedPaths = useUnsavedFiles(appId);

  const uncommittedPaths = useMemo(
    () => collectUncommittedPaths(uncommittedFiles, files),
    [uncommittedFiles, files],
  );

  const uncommittedDirs = useMemo(() => collectAncestorDirs(uncommittedPaths), [uncommittedPaths]);
  const unsavedDirs = useMemo(() => collectAncestorDirs(unsavedPaths), [unsavedPaths]);

  const status = useMemo<FileTreeStatus>(
    () => ({ uncommittedPaths, uncommittedDirs, unsavedPaths, unsavedDirs }),
    [uncommittedPaths, uncommittedDirs, unsavedPaths, unsavedDirs],
  );

  // In search mode, create a flat list of matching files with match counts
  const searchResultsList = useMemo(() => {
    if (!isSearchMode) {
      return [];
    }
    return Array.from(matchesByPath.entries())
      .map(([path, result]) => ({
        path,
        matchCount: result.snippets?.length ?? 0,
        result,
      }))
      .sort((a, b) => {
        // Sort by match count (descending), then by path (ascending)
        if (b.matchCount !== a.matchCount) {
          return b.matchCount - a.matchCount;
        }
        return a.path.localeCompare(b.path);
      });
  }, [isSearchMode, matchesByPath]);

  const existingPaths = useMemo(() => new Set(files), [files]);

  // Clear the selected file when a move/delete invalidated its path.
  const onMoved = (paths: readonly string[]) => {
    setSelectedFile((current) => (current && paths.includes(current.path) ? null : current));
  };

  const fileManager = useFileManager({
    appId,
    existingPaths,
    refresh,
    onMoved,
  });

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      fileManager.handleDrop(droppedFiles, "");
    }
  };

  return (
    <div className="file-tree mt-2 flex h-full flex-col" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="px-2 pb-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("preview.searchFileContents")}
            className="h-8 pl-7 pr-16 text-sm"
            data-testid="file-tree-search"
            disabled={!appId}
          />
          {searchValue && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchValue("")}
              aria-label={t("preview.clearSearch")}
            >
              <X size={14} />
            </button>
          )}
          {searchLoading && (
            <Loader2
              size={14}
              className="absolute right-7 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>
        {isSearchMode && (
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {searchLoading
                ? t("preview.searchingFiles")
                : t("preview.match", { count: matchesByPath.size })}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isSearchMode && searchError && (
          <div className="px-3 py-2 text-xs text-red-500">{searchError.message}</div>
        )}
        {isSearchMode && !searchLoading && !searchError && matchesByPath.size === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {t("preview.noFilesMatchedSearch")}
          </div>
        ) : isSearchMode ? (
          <div className="px-2 py-1">
            {searchResultsList.map(({ path, matchCount, result }) => (
              <SearchResultItem
                key={path}
                path={path}
                matchCount={matchCount}
                result={result}
                status={status}
              />
            ))}
          </div>
        ) : (
          <TreeNodes
            nodes={treeData}
            level={0}
            matchesByPath={matchesByPath}
            isSearchMode={isSearchMode}
            searchQuery={debouncedSearch}
            status={status}
            appId={appId}
            onRequestLink={setLinkDialogPath}
            fileManager={fileManager}
            appRootPath={appRootPath}
          />
        )}
      </div>

      {appId != null && linkDialogPath != null && (
        <LinkToProjectDialog
          open={linkDialogPath != null}
          onOpenChange={(open) => {
            if (!open) setLinkDialogPath(null);
          }}
          sourceAppId={appId}
          sourcePath={linkDialogPath}
        />
      )}

      {appId != null && (
        <>
          <NamePromptDialog
            open={fileManager.nameDialog != null}
            title={
              fileManager.nameDialog?.kind === "rename"
                ? "Rename"
                : fileManager.nameDialog?.kind === "new-folder"
                  ? "New folder"
                  : "New file"
            }
            description={
              fileManager.nameDialog?.kind === "rename"
                ? "Enter a new name for this item."
                : `Create in "${fileManager.nameDialog?.targetDir || "root"}"`
            }
            initialValue={
              fileManager.nameDialog?.kind === "rename"
                ? (fileManager.nameDialog.path?.split("/").pop() ?? "")
                : ""
            }
            submitLabel={fileManager.nameDialog?.kind === "rename" ? "Rename" : "Create"}
            onOpenChange={(open) => {
              if (!open) fileManager.closeNameDialog();
            }}
            onSubmit={fileManager.submitNameDialog}
          />
          <ConfirmDeleteDialog
            open={fileManager.deleteTarget != null}
            paths={fileManager.deleteTarget?.paths ?? []}
            busy={fileManager.deleteBusy}
            onOpenChange={(open) => {
              if (!open) fileManager.closeDeleteDialog();
            }}
            onConfirm={fileManager.confirmDelete}
          />
          <MoveToDialog
            open={fileManager.moveTarget != null}
            paths={fileManager.moveTarget?.paths ?? []}
            initialDir={fileManager.moveTarget?.paths[0]?.split("/").slice(0, -1).join("/") ?? ""}
            onOpenChange={(open) => {
              if (!open) fileManager.closeMoveDialog();
            }}
            onSubmit={fileManager.submitMoveTo}
          />
          <ConflictDialog
            open={fileManager.conflictItems != null}
            items={fileManager.conflictItems ?? []}
            existing={existingPaths}
            onOpenChange={(open) => {
              if (!open) fileManager.onResolveConflicts(null);
            }}
            onResolve={fileManager.onResolveConflicts}
          />
        </>
      )}
    </div>
  );
};

interface TreeNodesProps {
  nodes: TreeNode[];
  level: number;
  matchesByPath: Map<string, AppFileSearchResult>;
  isSearchMode: boolean;
  searchQuery: string;
  status: FileTreeStatus;
  appId: number | null;
  onRequestLink: (path: string) => void;
  fileManager: FileManagerApi;
  appRootPath?: string;
}

// Sort nodes to show directories first
const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name);
    }
    return a.isDirectory ? -1 : 1;
  });
};

// Tree nodes component
const TreeNodes = ({
  nodes,
  level,
  matchesByPath,
  isSearchMode,
  searchQuery,
  status,
  appId,
  onRequestLink,
  fileManager,
  appRootPath,
}: TreeNodesProps) => (
  <ul className="ml-4">
    {sortNodes(nodes).map((node) => (
      <TreeNode
        key={node.path}
        node={node}
        level={level}
        matchesByPath={matchesByPath}
        isSearchMode={isSearchMode}
        searchQuery={searchQuery}
        status={status}
        appId={appId}
        onRequestLink={onRequestLink}
        fileManager={fileManager}
        appRootPath={appRootPath}
      />
    ))}
  </ul>
);

interface TreeNodeProps {
  node: TreeNode;
  level: number;
  matchesByPath: Map<string, AppFileSearchResult>;
  isSearchMode: boolean;
  searchQuery: string;
  status: FileTreeStatus;
  appId: number | null;
  onRequestLink: (path: string) => void;
  fileManager: FileManagerApi;
  appRootPath?: string;
}

// Search result item component (flat list in search mode)
interface SearchResultItemProps {
  path: string;
  matchCount: number;
  result: AppFileSearchResult;
  status: FileTreeStatus;
}

const SearchResultItem = ({ path, matchCount, result, status }: SearchResultItemProps) => {
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFileClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSnippetClick = (line: number) => {
    setSelectedFile({
      path,
      line,
    });
  };

  const marker = getFileMarker(path, status);

  return (
    <div className="py-1">
      <div
        className="group flex items-center rounded px-1.5 py-1 text-sm hover:bg-(--sidebar) cursor-pointer"
        onClick={handleFileClick}
        data-testid="file-tree-file"
        data-path={path}
        data-marker={marker ?? undefined}
      >
        {/* Chevron */}
        <span className="text-muted-foreground mr-1.5 flex-shrink-0">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Path, with its change marker trailing it */}
        <span className="flex min-w-0 flex-1 items-center">
          <span
            className={cn("truncate", marker && "font-medium", marker && MARKER_CLASSES[marker])}
          >
            {path}
          </span>
          <ChangeMarkerDot marker={marker} isDirectory={false} />
        </span>

        {/* Mention button */}
        <MentionFileButton filePath={path} />

        {/* Count badge (right-aligned, circular) */}
        <span
          className="
      ml-auto
      flex h-5 min-w-[1.25rem] items-center justify-center
      rounded-full
      bg-muted
      text-xs font-medium
      text-muted-foreground
    "
        >
          {matchCount}
        </span>
      </div>

      {isExpanded &&
        result.snippets &&
        result.snippets.length > 0 &&
        result.snippets.map((snippet, index) => (
          <div
            key={`${snippet.line}-${index}`}
            className="ml-12 mr-2 py-0.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleSnippetClick(snippet.line);
            }}
          >
            <div className="font-mono text-[11px] leading-tight text-foreground truncate">
              <span className="text-muted-foreground">{snippet.before}</span>
              <mark className="bg-primary/20 text-foreground font-medium px-0.5 rounded">
                {snippet.match}
              </mark>
              <span className="text-muted-foreground">{snippet.after}</span>
            </div>
          </div>
        ))}
    </div>
  );
};

// Individual tree node component
const TreeNode = ({
  node,
  level,
  matchesByPath,
  isSearchMode,
  searchQuery,
  status,
  appId,
  onRequestLink,
  fileManager,
  appRootPath,
}: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(level < 2);
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const FileIcon = getFileIconByPath(node.path);
  const match = isSearchMode ? matchesByPath.get(node.path) : undefined;
  const marker = node.isDirectory
    ? getDirMarker(node.path, status)
    : getFileMarker(node.path, status);
  // Folder names stay unstyled: coloring one would read as the folder itself
  // having changed rather than something below it.
  const nameMarker = node.isDirectory ? null : marker;
  const [isSymlink, setIsSymlink] = useState(false);

  useEffect(() => {
    if (isSearchMode && node.isDirectory) {
      setExpanded(true);
    }
  }, [isSearchMode, node.isDirectory]);

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded(!expanded);
    } else {
      setSelectedFile({
        path: node.path,
        line: match?.snippets?.[0]?.line ?? null,
      });
    }
  };

  const checkSymlinkStatus = () => {
    if (appId == null) return;
    ipc.symlink
      .getEntryInfo({ appId, path: node.path })
      .then((info) => setIsSymlink(info.isSymlink))
      .catch(() => setIsSymlink(false));
  };

  const handleRemoveLink = () => {
    if (appId == null) return;
    ipc.symlink
      .removeSymlink({ appId, path: node.path })
      .then(() => showSuccess(`Removed link "${node.name}"`))
      .catch((error) =>
        showError(
          `Failed to remove link: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
  };

  const absPath = appRootPath ? `${appRootPath}/${node.path}` : "";

  const handleCopyPath = () => {
    if (!absPath) return;
    navigator.clipboard
      .writeText(absPath)
      .then(() => showSuccess("Copied absolute path"))
      .catch(() => showError("Failed to copy path"));
  };

  const handleCopyRelativePath = () => {
    navigator.clipboard
      .writeText(node.path)
      .then(() => showSuccess("Copied relative path"))
      .catch(() => showError("Failed to copy path"));
  };

  const handleReveal = () => {
    if (!absPath) return;
    ipc.system.showItemInFolder(absPath);
  };

  const row = (
    <div
      className="group flex items-center rounded px-1.5 py-0.5 text-sm hover:bg-(--sidebar)"
      onClick={handleClick}
      data-testid={node.isDirectory ? "file-tree-dir" : "file-tree-file"}
      data-path={node.path}
      data-marker={marker ?? undefined}
    >
      {node.isDirectory ? (
        <span className="mr-1 text-gray-500">
          {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
        </span>
      ) : (
        <span className="mr-1 flex-shrink-0 text-gray-500">
          <FileIcon size={16} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center">
        <span
          className={cn(
            "truncate",
            nameMarker && "font-medium",
            nameMarker && MARKER_CLASSES[nameMarker],
          )}
        >
          {isSearchMode ? highlightMatch(node.name, searchQuery) : node.name}
        </span>
        <ChangeMarkerDot marker={marker} isDirectory={node.isDirectory} />
        {isSymlink && (
          <Link2
            size={12}
            className="ml-1.5 flex-shrink-0 text-muted-foreground"
            aria-label="Linked from another project"
          />
        )}
      </span>
      {!node.isDirectory && <MentionFileButton filePath={node.path} />}
    </div>
  );

  return (
    <li className="py-0.5">
      {appId != null ? (
        <ContextMenu onOpenChange={(open) => open && checkSymlinkStatus()}>
          <ContextMenuTrigger>{row}</ContextMenuTrigger>
          <ContextMenuContent>
            {node.isDirectory && (
              <>
                <ContextMenuItem onClick={() => fileManager.actions.newFile(node.path)}>
                  <FilePlus size={14} />
                  New file
                </ContextMenuItem>
                <ContextMenuItem onClick={() => fileManager.actions.newFolder(node.path)}>
                  <FolderPlus size={14} />
                  New folder
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!fileManager.canPaste}
                  onClick={() => fileManager.actions.paste(node.path)}
                >
                  <ClipboardPaste size={14} />
                  Paste
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={() => fileManager.actions.rename(node.path)}>
              <Pencil size={14} />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => fileManager.actions.copy([node.path])}>
              <Copy size={14} />
              Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={() => fileManager.actions.cut([node.path])}>
              <Scissors size={14} />
              Cut
            </ContextMenuItem>
            <ContextMenuItem onClick={() => fileManager.actions.moveTo([node.path])}>
              <FolderOpen size={14} />
              Move to…
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => fileManager.actions.delete([node.path])}
              variant="destructive"
            >
              <Trash2 size={14} />
              Delete
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleCopyPath} disabled={!absPath}>
              <Copy size={14} />
              Copy absolute path
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyRelativePath}>
              <FileText size={14} />
              Copy relative path
            </ContextMenuItem>
            <ContextMenuItem onClick={handleReveal} disabled={!absPath}>
              <ExternalLink size={14} />
              Reveal in folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onRequestLink(node.path)}>
              <Link2 size={14} />
              Link to another project…
            </ContextMenuItem>
            {isSymlink && (
              <ContextMenuItem onClick={handleRemoveLink} variant="destructive">
                <Unlink size={14} />
                Remove link
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}

      {match?.matchesContent &&
        match.snippets &&
        match.snippets.length > 0 &&
        match.snippets.map((snippet, index) => (
          <div
            key={`${snippet.line}-${index}`}
            className="ml-6 mr-2 py-0.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFile({
                path: node.path,
                line: snippet.line,
              });
            }}
          >
            <div className="font-mono text-[11px] leading-tight text-foreground truncate">
              <span className="text-muted-foreground">{snippet.before}</span>
              <mark className="bg-primary/20 text-foreground font-medium px-0.5 rounded">
                {snippet.match}
              </mark>
              <span className="text-muted-foreground">{snippet.after}</span>
            </div>
          </div>
        ))}

      {node.isDirectory && expanded && node.children.length > 0 && (
        <TreeNodes
          nodes={node.children}
          level={level + 1}
          matchesByPath={matchesByPath}
          isSearchMode={isSearchMode}
          searchQuery={searchQuery}
          status={status}
          appId={appId}
          onRequestLink={onRequestLink}
          fileManager={fileManager}
          appRootPath={appRootPath}
        />
      )}
    </li>
  );
};
