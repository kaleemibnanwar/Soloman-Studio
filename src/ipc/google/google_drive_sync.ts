import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { db } from "../../db";
import { apps } from "../../db/schema";
import { getChatProjectRootPath, getOctopusStudioAppPath } from "../../paths/paths";
import { getFilesRecursively } from "../utils/file_utils";
import { safeJoin } from "../utils/path_utils";
import {
  createFolder,
  deleteFile,
  downloadFileContent,
  ensureRootSyncFolder,
  listFolderChildren,
  updateFileContent,
  uploadNewFile,
  type DriveFile,
} from "./google_drive_client";
import { OctopusStudioError, OctopusStudioErrorKind } from "../../errors/octopus_studio_error";

const logger = log.scope("google_drive_sync");

const SYNC_DIR_NAME = ".octopusStudio";
const INDEX_FILE_NAME = "drive-sync-index.json";

interface DriveSyncIndexEntry {
  driveFileId: string;
  driveModifiedTime: string;
  localMtimeMs: number;
}

interface DriveSyncIndex {
  folderId: string;
  files: Record<string, DriveSyncIndexEntry>;
}

export interface DriveSyncSummary {
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: number;
}

type ProjectRow = {
  id: number;
  name: string;
  type: string;
  path: string | null;
  directory: string | null;
  googleDriveSyncEnabled: boolean;
  googleDriveFolderId: string | null;
};

function resolveProjectRoot(project: ProjectRow): string {
  return project.type === "chat"
    ? getChatProjectRootPath(project.directory, project.id)
    : getOctopusStudioAppPath(project.path ?? "");
}

async function loadProject(appId: number): Promise<ProjectRow> {
  const project = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: {
      id: true,
      name: true,
      type: true,
      path: true,
      directory: true,
      googleDriveSyncEnabled: true,
      googleDriveFolderId: true,
    },
  });
  if (!project) {
    throw new OctopusStudioError(`Project not found: ${appId}`, OctopusStudioErrorKind.NotFound);
  }
  return project;
}

function indexPath(root: string): string {
  return path.join(root, SYNC_DIR_NAME, INDEX_FILE_NAME);
}

function loadIndex(root: string, folderId: string): DriveSyncIndex {
  try {
    const raw = fs.readFileSync(indexPath(root), "utf8");
    const parsed = JSON.parse(raw) as DriveSyncIndex;
    if (parsed.folderId === folderId) {
      return parsed;
    }
    // Folder was recreated (e.g. previous one was deleted on Drive); the old
    // index no longer refers to anything real, so start clean.
    return { folderId, files: {} };
  } catch {
    return { folderId, files: {} };
  }
}

function saveIndex(root: string, index: DriveSyncIndex): void {
  const dir = path.dirname(indexPath(root));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath(root), JSON.stringify(index, null, 2));
}

function isSyncableLocalPath(relativePath: string): boolean {
  return relativePath !== SYNC_DIR_NAME && !relativePath.startsWith(`${SYNC_DIR_NAME}/`);
}

/** Ensures a project has a linked Drive folder, creating one on first use. */
export async function ensureProjectDriveFolder(appId: number): Promise<string> {
  const project = await loadProject(appId);
  if (project.googleDriveFolderId) {
    return project.googleDriveFolderId;
  }
  const rootFolderId = await ensureRootSyncFolder();
  const folderId = await createFolder(project.name, rootFolderId);
  await db
    .update(apps)
    .set({ googleDriveFolderId: folderId, googleDriveFolderName: project.name })
    .where(eq(apps.id, appId));
  return folderId;
}

/**
 * Reconciles a project's local files with its Drive folder in one pass:
 * uploads new/changed local files, downloads new/changed remote files, and
 * propagates deletions in whichever direction happened since the last sync.
 * When both sides changed the same file, the local copy wins on Drive and
 * the remote copy is preserved alongside as a `.drive-conflict` file so nothing
 * is silently lost.
 */
export async function syncProject(appId: number): Promise<DriveSyncSummary> {
  const project = await loadProject(appId);
  if (!project.googleDriveSyncEnabled) {
    throw new OctopusStudioError(
      "Drive sync is not enabled for this project.",
      OctopusStudioErrorKind.Precondition,
    );
  }
  const folderId = await ensureProjectDriveFolder(appId);
  const root = resolveProjectRoot(project);
  const index = loadIndex(root, folderId);

  const [remoteFiles, localRelPaths] = await Promise.all([
    listFolderChildren(folderId),
    Promise.resolve(getFilesRecursively(root, root).filter(isSyncableLocalPath)),
  ]);
  const remoteByName = new Map<string, DriveFile>(remoteFiles.map((f) => [f.name, f]));

  const localStatByPath = new Map<string, fs.Stats>();
  for (const relPath of localRelPaths) {
    try {
      localStatByPath.set(relPath, fs.statSync(safeJoin(root, relPath)));
    } catch {
      // Deleted between listing and stat; treat as absent.
    }
  }

  const allPaths = new Set<string>([
    ...localStatByPath.keys(),
    ...remoteByName.keys(),
    ...Object.keys(index.files),
  ]);

  const summary: DriveSyncSummary = {
    uploaded: 0,
    downloaded: 0,
    deletedLocal: 0,
    deletedRemote: 0,
    conflicts: 0,
  };
  const nextFiles: Record<string, DriveSyncIndexEntry> = {};

  for (const relPath of allPaths) {
    const localStat = localStatByPath.get(relPath);
    const remote = remoteByName.get(relPath);
    const known = index.files[relPath];
    const localExists = localStat != null;
    const remoteExists = remote != null;
    const localAbsolute = safeJoin(root, relPath);

    const uploadLocal = async (): Promise<DriveSyncIndexEntry> => {
      const content = fs.readFileSync(localAbsolute);
      if (remote) {
        await updateFileContent(remote.id, content, relPath);
        const [refreshed] = (await listFolderChildren(folderId)).filter((f) => f.id === remote.id);
        return {
          driveFileId: remote.id,
          driveModifiedTime: refreshed?.modifiedTime ?? new Date().toISOString(),
          localMtimeMs: localStat!.mtimeMs,
        };
      }
      const driveFileId = await uploadNewFile({
        name: relPath,
        parentId: folderId,
        content,
      });
      return {
        driveFileId,
        driveModifiedTime: new Date().toISOString(),
        localMtimeMs: localStat!.mtimeMs,
      };
    };

    const downloadRemote = async (): Promise<DriveSyncIndexEntry> => {
      const content = await downloadFileContent(remote!.id);
      fs.mkdirSync(path.dirname(localAbsolute), { recursive: true });
      fs.writeFileSync(localAbsolute, content);
      const stat = fs.statSync(localAbsolute);
      return {
        driveFileId: remote!.id,
        driveModifiedTime: remote!.modifiedTime,
        localMtimeMs: stat.mtimeMs,
      };
    };

    try {
      if (!known) {
        if (localExists && !remoteExists) {
          nextFiles[relPath] = await uploadLocal();
          summary.uploaded++;
        } else if (!localExists && remoteExists) {
          nextFiles[relPath] = await downloadRemote();
          summary.downloaded++;
        } else if (localExists && remoteExists) {
          // Present on both sides with no shared sync history: local wins,
          // remote is preserved as a conflict copy.
          await preserveConflictCopy(root, relPath, remote!.id);
          nextFiles[relPath] = await uploadLocal();
          summary.conflicts++;
        }
        continue;
      }

      const localChanged = localExists && localStat!.mtimeMs !== known.localMtimeMs;
      const remoteChanged = remoteExists && remote!.modifiedTime !== known.driveModifiedTime;

      if (!localExists && !remoteExists) {
        // Both gone; drop from the index.
        continue;
      }
      if (!localExists && remoteExists) {
        if (remoteChanged) {
          // Local delete raced a remote edit — keep the newer remote content.
          nextFiles[relPath] = await downloadRemote();
          summary.downloaded++;
          summary.conflicts++;
        } else {
          await deleteFile(remote!.id);
          summary.deletedRemote++;
        }
        continue;
      }
      if (localExists && !remoteExists) {
        if (localChanged) {
          nextFiles[relPath] = await uploadLocal();
          summary.uploaded++;
        } else {
          fs.rmSync(localAbsolute, { force: true });
          summary.deletedLocal++;
        }
        continue;
      }
      // Both exist.
      if (localChanged && remoteChanged) {
        await preserveConflictCopy(root, relPath, remote!.id);
        nextFiles[relPath] = await uploadLocal();
        summary.uploaded++;
        summary.conflicts++;
      } else if (localChanged) {
        nextFiles[relPath] = await uploadLocal();
        summary.uploaded++;
      } else if (remoteChanged) {
        nextFiles[relPath] = await downloadRemote();
        summary.downloaded++;
      } else {
        nextFiles[relPath] = known;
      }
    } catch (error) {
      logger.error(`Failed to sync "${relPath}" for project ${appId}`, error);
    }
  }

  saveIndex(root, { folderId, files: nextFiles });
  await db.update(apps).set({ googleDriveLastSyncedAt: new Date() }).where(eq(apps.id, appId));

  logger.info(
    `Synced project ${appId}: +${summary.uploaded} -${summary.downloaded} (up/down), ${summary.deletedLocal} local deletes, ${summary.deletedRemote} remote deletes, ${summary.conflicts} conflicts`,
  );
  return summary;
}

/** Saves the current remote content next to the local file before it gets overwritten, so a conflicting edit is never silently lost. */
async function preserveConflictCopy(
  root: string,
  relPath: string,
  remoteFileId: string,
): Promise<void> {
  const content = await downloadFileContent(remoteFileId);
  const ext = path.extname(relPath);
  const base = relPath.slice(0, relPath.length - ext.length);
  const conflictPath = safeJoin(root, `${base}.drive-conflict-${Date.now()}${ext}`);
  fs.mkdirSync(path.dirname(conflictPath), { recursive: true });
  fs.writeFileSync(conflictPath, content);
}

export async function enableProjectDriveSync(appId: number): Promise<DriveSyncSummary> {
  await db.update(apps).set({ googleDriveSyncEnabled: true }).where(eq(apps.id, appId));
  return syncProject(appId);
}

export async function disableProjectDriveSync(appId: number): Promise<void> {
  await db.update(apps).set({ googleDriveSyncEnabled: false }).where(eq(apps.id, appId));
}

/** Deletes the project's Drive folder (and everything in it). Used when the user confirms removing a deleted project's Drive copy too. */
export async function deleteProjectDriveFolder(appId: number): Promise<void> {
  const project = await loadProject(appId);
  if (project.googleDriveFolderId) {
    await deleteFile(project.googleDriveFolderId);
  }
}
