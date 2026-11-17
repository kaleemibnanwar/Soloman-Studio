import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
import { readSettings } from "../main/settings";

// Cached result of getOctopusStudioAppsBaseDirectory
let cachedBaseDirectory: string | null = null;
let cachedCustomFolderSetting: string | null | undefined;
// Whether apps base directory has been created
let defaultDirCreated = false;
// Whether the projects base directory has been created
let projectsDirCreated = false;

const STUDIO_HOME_DIR_NAME = "Soloman Studio";
const PROJECTS_DIR_NAME = "Projects";
const APPS_DIR_NAME = "Apps";
const WORKSPACES_DIR_NAME = "Workspaces";

/**
 * Gets the default path of the base apps directory (without a specific app subdirectory).
 * New projects live directly under the user's home directory:
 * - macOS: ~/Soloman Studio/Projects/Apps
 * - Windows: %USERPROFILE%\Soloman Studio\Projects\Apps
 * - Linux: ~/Soloman Studio/Projects/Apps
 */
export function getDefaultOctopusStudioAppsDirectory(): string {
  if (IS_TEST_BUILD) {
    const electron = getElectron();
    return path.join(
      electron!.app.getPath("userData"),
      STUDIO_HOME_DIR_NAME,
      PROJECTS_DIR_NAME,
      APPS_DIR_NAME,
    );
  }

  return path.join(os.homedir(), STUDIO_HOME_DIR_NAME, PROJECTS_DIR_NAME, APPS_DIR_NAME);
}

/**
 * Gets the base directory where auto-created chat (codeless) project folders
 * live, creating it on first use.
 * Standardized under the user's home directory (e.g. ~/Soloman Studio/Projects/Workspaces).
 */
export function getOctopusStudioProjectsBaseDirectory(): string {
  let base: string;

  if (IS_TEST_BUILD) {
    base = path.join(
      getElectron()!.app.getPath("userData"),
      STUDIO_HOME_DIR_NAME,
      PROJECTS_DIR_NAME,
      WORKSPACES_DIR_NAME,
    );
  } else {
    base = path.join(os.homedir(), STUDIO_HOME_DIR_NAME, PROJECTS_DIR_NAME, WORKSPACES_DIR_NAME);
  }

  if (!projectsDirCreated) {
    try {
      fs.mkdirSync(base, { recursive: true });
      projectsDirCreated = true;
    } catch {
      // Fall through; callers surface a toast if the folder can't be created.
    }
  }
  return base;
}

/**
 * Gets the default path of the base apps directory (without a specific app subdirectory),
 * but creates the directory the first time that this function is called
 */
function resolveDefaultOctopusStudioAppsDirectory(): string {
  const defaultDir = getDefaultOctopusStudioAppsDirectory();
  if (!defaultDirCreated) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
      defaultDirCreated = true;
    } catch {
      // Fall through; if it fails then the user will see error toasts
      // when they try to do anything meaningful, but we don't want OctopusStudio to crash
    }
  }
  return defaultDir;
}

/**
 * Clears base directory cache, so the next call to getOctopusStudioAppsBaseDirectory will re-read the settings
 */
export function invalidateOctopusStudioAppsBaseDirectoryCache(): void {
  cachedBaseDirectory = null;
  cachedCustomFolderSetting = undefined;
}

/**
 * Returns the cached value of the custom folder path
 */
export function getCustomFolderCache(): string | null | undefined {
  return cachedCustomFolderSetting;
}

/**
 * Gets the user's preferred apps directory path (without a specific app subdirectory)
 */
export function getOctopusStudioAppsBaseDirectory(): string {
  const customFolder = readSettings().customAppsFolder;
  const validCustomFolder =
    customFolder && !isLegacyOctopusStudioAppsFolder(customFolder) ? customFolder : undefined;

  const appsPath =
    cachedBaseDirectory ??
    (cachedCustomFolderSetting = validCustomFolder) ??
    resolveDefaultOctopusStudioAppsDirectory();

  cachedBaseDirectory = appsPath;
  return cachedBaseDirectory;
}

/**
 * Older builds defaulted to `~/octopusstudio-projects/apps` and then
 * `~/Documents/Soloman Studio/Projects/Apps`. Treat those saved settings as
 * stale so new projects land under `~/Soloman Studio/Projects/Apps`.
 */
export function isLegacyOctopusStudioAppsFolder(folder: string): boolean {
  const normalized = path.resolve(folder).toLowerCase();
  const home = os.homedir().toLowerCase();
  const legacyDocumentsDefault = path
    .resolve(home, "documents", STUDIO_HOME_DIR_NAME, PROJECTS_DIR_NAME, APPS_DIR_NAME)
    .toLowerCase();

  return (
    normalized === legacyDocumentsDefault ||
    normalized.includes("octopusstudio-projects") ||
    normalized.includes("octopus-studio-projects") ||
    normalized.includes("octopusstudio") ||
    normalized.includes("octopus-studio")
  );
}

/**
 * Given a path, determines whether that path exists, is a directory, and is writable.
 * Can determine, for example, whether the output of `getOctopusStudioAppsBaseDirectory` is usable
 */
export function isDirectoryAccessible(directoryPath: string): boolean {
  try {
    const st = fs.statSync(directoryPath);
    if (!st.isDirectory()) return false;
    fs.accessSync(directoryPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getOctopusStudioAppPath(appPath: string): string {
  // If appPath is already absolute, use it as-is
  if (path.isAbsolute(appPath)) {
    return appPath;
  }

  // New projects always resolve under the current (home-directory) base path.
  const currentPath = path.join(getOctopusStudioAppsBaseDirectory(), appPath);
  if (fs.existsSync(currentPath)) {
    return currentPath;
  }

  // Keep previously imported projects reachable without moving their folders.
  for (const legacyBase of getLegacyAppsBaseDirectories()) {
    const legacyPath = path.join(legacyBase, appPath);
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
  }

  // For new imports/copies the target does not exist yet; use the home base.
  return currentPath;
}

/**
 * Returns true when `candidatePath` is already inside a Studio-managed apps
 * root. Importing such a folder must register it in place instead of copying
 * it into a sibling folder (which produced rasd-labs-2, -3, ... duplicates).
 */
export function isPathInsideOctopusStudioAppsDirectory(candidatePath: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const managedRoots = [getOctopusStudioAppsBaseDirectory(), ...getLegacyAppsBaseDirectories()];

  return managedRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

/** Read-only fallbacks for projects created by older Studio builds. */
function getLegacyAppsBaseDirectories(): string[] {
  const home = os.homedir();
  return [
    path.join(home, "Documents", STUDIO_HOME_DIR_NAME, PROJECTS_DIR_NAME, APPS_DIR_NAME),
    path.join(home, "octopusstudio-projects", "apps"),
    path.join(home, "octopus-studio-projects", "apps"),
  ];
}

/**
 * Resolve the on-disk root for a chat (codeless) project. If the user selected
 * a custom `directory` on the project, that is the workspace root (used for
 * context and for reading/writing Markdown docs).
 * Otherwise it falls back to a dedicated folder under the user's workspaces
 * base directory (`~/Soloman Studio/Projects/Workspaces/workspace-<projectId>`).
 * Legacy folders under `{userData}/chat-projects/<projectId>` are detected and preserved.
 */
export function getChatProjectRootPath(
  directory: string | null | undefined,
  projectId: number,
): string {
  if (directory && fs.existsSync(directory) && fs.statSync(directory).isDirectory()) {
    return path.resolve(directory);
  }

  // Check if legacy folder exists under userData
  const legacyUserDataChatProject = path.join(
    getUserDataPath(),
    "chat-projects",
    String(projectId),
  );
  if (fs.existsSync(legacyUserDataChatProject)) {
    return legacyUserDataChatProject;
  }

  const workspaceName = `workspace-${projectId}`;
  const currentPath = path.join(getOctopusStudioProjectsBaseDirectory(), workspaceName);
  if (fs.existsSync(currentPath)) {
    return currentPath;
  }

  // Keep chat-project documents from older installs visible without moving them.
  const home = os.homedir();
  const legacyWorkspacePaths = [
    path.join(
      home,
      "Documents",
      STUDIO_HOME_DIR_NAME,
      PROJECTS_DIR_NAME,
      WORKSPACES_DIR_NAME,
      workspaceName,
    ),
    path.join(home, "octopusstudio-projects", "general", workspaceName),
    path.join(home, "octopusstudio-projects", "general", String(projectId)),
  ];
  for (const legacyPath of legacyWorkspacePaths) {
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
  }

  return currentPath;
}

/**
 * Given an app path, determines whether that path is accessible within the filesystem.
 * The input to this function is assumed to be the result of `getOctopusStudioAppPath`.
 */
export function isAppLocationAccessible(resolvedPath: string): boolean {
  const containingFolder = path.dirname(resolvedPath);
  return isDirectoryAccessible(containingFolder);
}

export function getTypeScriptCachePath(): string {
  const electron = getElectron();
  return path.join(electron!.app.getPath("sessionData"), "typescript-cache");
}

/**
 * Gets the user data path, handling both Electron and non-Electron environments
 * In Electron: returns the app's userData directory
 * In non-Electron: returns "./userData" in the current directory
 */

export function getUserDataPath(): string {
  const electron = getElectron();
  const devUserDataDir = (
    process.env.SOLOMAN_DEV_USER_DATA_DIR || process.env.OCTOPUS_STUDIO_DEV_USER_DATA_DIR
  )?.trim();

  if (process.env.NODE_ENV === "development" && devUserDataDir) {
    return path.resolve(devUserDataDir);
  }

  // When running in Electron and app is ready
  if (process.env.NODE_ENV !== "development" && electron) {
    return electron!.app.getPath("userData");
  }

  // For development or when the Electron app object isn't available
  return path.resolve("./userData");
}

/**
 * Get a reference to electron in a way that won't break in non-electron environments
 */
export function getElectron(): typeof import("electron") | undefined {
  let electron: typeof import("electron") | undefined;
  try {
    // Check if we're in an Electron environment
    if (process.versions.electron) {
      electron = require("electron");
    }
  } catch {
    // Not in Electron environment
  }
  return electron;
}
