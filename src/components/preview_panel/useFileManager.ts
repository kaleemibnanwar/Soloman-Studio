import { useCallback, useMemo, useRef, useState } from "react";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { basenameOf, joinPath, parentDirOf } from "./fileTreePaths";
import type { ConflictItem } from "./FileTreeDialogs";

export interface FileManagerActions {
  newFile: (dir: string) => void;
  newFolder: (dir: string) => void;
  rename: (path: string) => void;
  copy: (paths: string[]) => void;
  cut: (paths: string[]) => void;
  paste: (dir: string) => void;
  delete: (paths: string[]) => void;
  moveTo: (paths: string[]) => void;
}

interface NameDialogState {
  kind: "new-file" | "new-folder" | "rename";
  targetDir: string;
  path?: string;
}

interface PendingEntry {
  id: string;
  kind: "import" | "copy" | "move";
  name: string;
  sourcePath?: string;
  from?: string;
  destPath: string;
  overwrite?: boolean;
}

export interface FileManagerApi {
  actions: FileManagerActions;
  canPaste: boolean;
  clipboard: { paths: string[]; mode: "copy" | "cut" } | null;
  dropTargetPath: string | null;
  setDropTargetPath: (path: string | null) => void;
  nameDialog: NameDialogState | null;
  closeNameDialog: () => void;
  submitNameDialog: (value: string) => void;
  deleteTarget: { paths: string[] } | null;
  closeDeleteDialog: () => void;
  confirmDelete: () => void;
  deleteBusy: boolean;
  moveTarget: { paths: string[] } | null;
  closeMoveDialog: () => void;
  submitMoveTo: (destDir: string) => void;
  conflictItems: ConflictItem[] | null;
  onResolveConflicts: (
    resolved: { id: string; destPath: string; overwrite: boolean }[] | null,
  ) => void;
  handleDrop: (files: readonly File[], targetDir: string) => void;
  handlePaste: (dir: string) => void;
}

/**
 * The shared file-manager state machine for a file tree: clipboard (copy/cut/
 * paste), create/rename/delete/move, drag-drop import, and conflict resolution.
 *
 * `appId` is the numeric `apps.id` for both coding apps and chat projects — the
 * `fileManager` IPC domain resolves each to its on-disk root. `refresh` re-reads
 * the tree after a mutation; `onMoved` clears/adjusts any selected file that a
 * move or delete invalidated.
 */
export function useFileManager({
  appId,
  existingPaths,
  refresh,
  onMoved,
}: {
  appId: number | null;
  existingPaths: ReadonlySet<string>;
  refresh: () => void;
  onMoved?: (paths: readonly string[]) => void;
}): FileManagerApi {
  const [clipboard, setClipboard] = useState<{
    paths: string[];
    mode: "copy" | "cut";
  } | null>(null);

  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    paths: string[];
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [moveTarget, setMoveTarget] = useState<{ paths: string[] } | null>(null);

  const [conflictItems, setConflictItems] = useState<ConflictItem[] | null>(null);
  const pendingRef = useRef<PendingEntry[]>([]);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  const executeEntries = useCallback(
    async (entries: PendingEntry[]) => {
      if (appId == null || entries.length === 0) return;

      const imports = entries
        .filter((e) => e.kind === "import")
        .map((e) => ({
          sourcePath: e.sourcePath!,
          destPath: e.destPath,
          overwrite: e.overwrite ?? false,
        }));
      const copies = entries
        .filter((e) => e.kind === "copy")
        .map((e) => ({
          from: e.from!,
          to: e.destPath,
          overwrite: e.overwrite ?? false,
        }));
      const moves = entries
        .filter((e) => e.kind === "move")
        .map((e) => ({
          from: e.from!,
          to: e.destPath,
          overwrite: e.overwrite ?? false,
        }));

      const failures: string[] = [];
      try {
        if (imports.length > 0) {
          const { results } = await ipc.fileManager.importExternalFiles({
            appId,
            entries: imports,
          });
          for (const r of results) {
            if (!r.ok) failures.push(r.error ?? r.destPath);
          }
        }
        if (copies.length > 0) {
          const { results } = await ipc.fileManager.copyPaths({
            appId,
            entries: copies,
          });
          for (const r of results) {
            if (!r.ok) failures.push(r.error ?? r.path);
          }
        }
        if (moves.length > 0) {
          const { results } = await ipc.fileManager.movePaths({
            appId,
            entries: moves,
          });
          for (const r of results) {
            if (!r.ok) failures.push(r.error ?? r.path);
          }
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }

      if (imports.length > 0 && failures.length === 0) {
        showSuccess(`Imported ${imports.length} ${imports.length === 1 ? "item" : "items"}`);
      }
      if (failures.length > 0) {
        showError(failures[0]);
      }

      // Only a move (or delete) invalidates the selected file's path; copying or
      // importing leaves the source intact.
      onMoved?.(entries.filter((e) => e.kind === "move").map((e) => e.from!));
      if (moves.length > 0 && failures.length === 0) {
        setClipboard((prev) => (prev?.mode === "cut" ? null : prev));
      }
      refresh();
    },
    [appId, onMoved, refresh],
  );

  const startBatch = useCallback(
    (pending: PendingEntry[]) => {
      // Drop no-op entries (cut+paste into the same folder, copy onto itself)
      // so they never reach the conflict dialog or a self-overwriting rename.
      const meaningful = pending.filter((p) => p.kind === "import" || p.destPath !== p.from);
      if (meaningful.length === 0) return;
      const conflicts = meaningful.filter((p) => existingPaths.has(p.destPath));
      if (conflicts.length > 0) {
        pendingRef.current = meaningful;
        setConflictItems(
          conflicts.map((p) => ({
            id: p.id,
            name: p.name,
            destPath: p.destPath,
          })),
        );
        return;
      }
      void executeEntries(meaningful);
    },
    [existingPaths, executeEntries],
  );

  const onResolveConflicts = useCallback(
    (resolved: { id: string; destPath: string; overwrite: boolean }[] | null) => {
      const pending = pendingRef.current;
      pendingRef.current = [];
      setConflictItems(null);
      if (resolved == null || pending.length === 0) return;

      const byId = new Map(resolved.map((r) => [r.id, r]));
      const finalEntries: PendingEntry[] = pending.map((p) => {
        const r = byId.get(p.id);
        if (!r) return { ...p, overwrite: false };
        return { ...p, destPath: r.destPath, overwrite: r.overwrite };
      });
      void executeEntries(finalEntries);
    },
    [executeEntries],
  );

  const handlePaste = useCallback(
    (dir: string) => {
      if (appId == null || !clipboard) return;
      const { paths, mode } = clipboard;
      const pending: PendingEntry[] = paths.map((p, i) => ({
        id: String(i),
        kind: mode === "cut" ? "move" : "copy",
        name: basenameOf(p),
        from: p,
        destPath: joinPath(dir, basenameOf(p)),
      }));
      // The "cut" clipboard is cleared after a successful move (in
      // executeEntries), not here, so a canceled conflict dialog keeps the cut.
      startBatch(pending);
    },
    [appId, clipboard, startBatch],
  );

  const handleDrop = useCallback(
    (files: readonly File[], targetDir: string) => {
      const webUtils = (window as any).electron?.webUtils;
      const pending: PendingEntry[] = [];
      files.forEach((file, i) => {
        const sourcePath = webUtils?.getPathForFile ? webUtils.getPathForFile(file) : "";
        if (!sourcePath) {
          showError(`Could not resolve the path of "${file.name}"`);
          return;
        }
        pending.push({
          id: String(i),
          kind: "import",
          name: file.name,
          sourcePath,
          destPath: joinPath(targetDir, file.name),
        });
      });
      startBatch(pending);
    },
    [startBatch],
  );

  const actions = useMemo<FileManagerActions>(
    () => ({
      newFile: (dir) => setNameDialog({ kind: "new-file", targetDir: dir }),
      newFolder: (dir) => setNameDialog({ kind: "new-folder", targetDir: dir }),
      rename: (path) => setNameDialog({ kind: "rename", targetDir: parentDirOf(path), path }),
      copy: (paths) => setClipboard({ paths, mode: "copy" }),
      cut: (paths) => setClipboard({ paths, mode: "cut" }),
      paste: handlePaste,
      delete: (paths) => {
        if (paths.length) setDeleteTarget({ paths });
      },
      moveTo: (paths) => {
        if (paths.length) setMoveTarget({ paths });
      },
    }),
    [handlePaste],
  );

  const submitNameDialog = useCallback(
    async (value: string) => {
      if (!nameDialog || appId == null) return;
      const { kind, targetDir, path } = nameDialog;
      const fullPath = joinPath(targetDir, value);
      const alreadyExists = existingPaths.has(fullPath);

      try {
        if (kind === "new-file") {
          if (alreadyExists) {
            showError(`"${value}" already exists`);
            return;
          }
          await ipc.fileManager.createFile({ appId, path: fullPath });
        } else if (kind === "new-folder") {
          if (alreadyExists) {
            showError(`"${value}" already exists`);
            return;
          }
          await ipc.fileManager.createFolder({ appId, path: fullPath });
        } else if (kind === "rename" && path) {
          if (fullPath === path) {
            setNameDialog(null);
            return;
          }
          if (alreadyExists) {
            showError(`"${value}" already exists`);
            return;
          }
          const { results } = await ipc.fileManager.movePaths({
            appId,
            entries: [{ from: path, to: fullPath, overwrite: false }],
          });
          const failed = results.find((r) => !r.ok);
          if (failed) {
            showError(failed.error ?? "Rename failed");
            return;
          }
          onMoved?.([path]);
        }
        setNameDialog(null);
        refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    },
    [nameDialog, appId, existingPaths, onMoved, refresh],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || appId == null) return;
    setDeleteBusy(true);
    try {
      const { results } = await ipc.fileManager.deletePaths({
        appId,
        paths: deleteTarget.paths,
      });
      const failed = results.find((r) => !r.ok);
      if (failed) {
        showError(failed.error ?? "Delete failed");
        return;
      }
      onMoved?.(deleteTarget.paths);
      setDeleteTarget(null);
      refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, appId, onMoved, refresh]);

  const submitMoveTo = useCallback(
    async (destDir: string) => {
      if (!moveTarget || appId == null) return;
      const pending: PendingEntry[] = [];
      let i = 0;
      for (const p of moveTarget.paths) {
        const destPath = joinPath(destDir, basenameOf(p));
        if (destPath !== p) {
          pending.push({
            id: String(i++),
            kind: "move",
            name: basenameOf(p),
            from: p,
            destPath,
          });
        }
      }
      setMoveTarget(null);
      if (pending.length > 0) {
        startBatch(pending);
      }
    },
    [moveTarget, appId, startBatch],
  );

  return {
    actions,
    canPaste: clipboard != null,
    clipboard,
    dropTargetPath,
    setDropTargetPath,
    nameDialog,
    closeNameDialog: () => setNameDialog(null),
    submitNameDialog,
    deleteTarget,
    closeDeleteDialog: () => setDeleteTarget(null),
    confirmDelete,
    deleteBusy,
    moveTarget,
    closeMoveDialog: () => setMoveTarget(null),
    submitMoveTo,
    conflictItems,
    onResolveConflicts,
    handleDrop,
    handlePaste,
  };
}
