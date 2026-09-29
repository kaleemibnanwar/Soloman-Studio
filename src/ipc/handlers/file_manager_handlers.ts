import fs from "node:fs";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { fileManagerContracts } from "../types/file_manager";
import { db } from "@/db";
import { apps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getChatProjectRootPath, getOctopusStudioAppPath } from "@/paths/paths";
import { assertMutationPathAllowed, safeJoin, prepareDeletePath } from "../utils/path_utils";
import { gitAdd } from "../git/git_utils";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";

const logger = log.scope("file_manager_handlers");

/**
 * Chat projects are `apps` rows too (type: "chat"), but their root lives under
 * the chat-project directory convention rather than the coding-app one.
 */
function resolveAppRoot(app: {
  id: number;
  type: string;
  path: string;
  directory: string | null;
}): string {
  return app.type === "chat"
    ? getChatProjectRootPath(app.directory, app.id)
    : getOctopusStudioAppPath(app.path);
}

async function findApp(appId: number) {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });
  if (!app) {
    throw new OctopusStudioError("App not found", OctopusStudioErrorKind.NotFound);
  }
  return app;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Stages a changed path for the Commit menu, matching how `editAppFile` stages
 * saves. Best-effort: chat projects (and apps mid-import) have no git repo, and
 * a failed stage must never undo a mutation that already succeeded on disk.
 */
async function stageIfGit(appPath: string, relPath: string): Promise<void> {
  if (!fs.existsSync(path.join(appPath, ".git"))) {
    return;
  }
  try {
    await gitAdd({ path: appPath, filepath: relPath });
  } catch (error) {
    logger.warn(`Failed to git stage ${relPath}:`, error);
  }
}

export function registerFileManagerHandlers() {
  createTypedHandler(fileManagerContracts.importExternalFiles, async (_, { appId, entries }) => {
    const app = await findApp(appId);
    const appPath = resolveAppRoot(app);

    const results = [];
    for (const { sourcePath, destPath, overwrite } of entries) {
      try {
        if (!fs.existsSync(sourcePath)) {
          throw new OctopusStudioError(
            `Source does not exist: ${sourcePath}`,
            OctopusStudioErrorKind.NotFound,
          );
        }
        const toRel = await assertMutationPathAllowed({
          appPath,
          relativePath: destPath,
        });
        const toFull = safeJoin(appPath, toRel);
        await fsPromises.mkdir(path.dirname(toFull), { recursive: true });
        // fs.cp copies files and directories, and (with dereference left at
        // its default) keeps symlinks inert. The source is an OS path the
        // user explicitly dropped, so no .gitignore/node_modules filtering.
        await fsPromises.cp(sourcePath, toFull, {
          recursive: true,
          force: overwrite === true,
        });
        await stageIfGit(appPath, toRel);
        results.push({ sourcePath, destPath, ok: true });
      } catch (error) {
        results.push({
          sourcePath,
          destPath,
          ok: false,
          error: errorMessage(error),
        });
      }
    }
    return { results };
  });

  createTypedHandler(fileManagerContracts.createFile, async (_, { appId, path: relPath }) => {
    const app = await findApp(appId);
    const appPath = resolveAppRoot(app);

    const rel = await assertMutationPathAllowed({
      appPath,
      relativePath: relPath,
    });
    const full = safeJoin(appPath, rel);
    await fsPromises.mkdir(path.dirname(full), { recursive: true });
    // Exclusive create: an existing file must surface as an error rather than
    // being silently clobbered (the UI resolves name conflicts before this).
    await fsPromises.writeFile(full, "", { flag: "wx" });
    await stageIfGit(appPath, rel);
  });

  createTypedHandler(fileManagerContracts.createFolder, async (_, { appId, path: relPath }) => {
    const app = await findApp(appId);
    const appPath = resolveAppRoot(app);

    const rel = await assertMutationPathAllowed({
      appPath,
      relativePath: relPath,
    });
    const full = safeJoin(appPath, rel);
    await fsPromises.mkdir(full, { recursive: true });
    // Empty folders aren't tracked by git, so nothing to stage.
  });

  createTypedHandler(fileManagerContracts.deletePaths, async (_, { appId, paths }) => {
    const app = await findApp(appId);
    const appPath = resolveAppRoot(app);

    const results = [];
    for (const relPath of paths) {
      try {
        const { relativePath, fullPath } = await prepareDeletePath(appPath, relPath);
        await fsPromises.rm(fullPath, { recursive: true, force: true });
        await stageIfGit(appPath, relativePath);
        results.push({ path: relPath, ok: true });
      } catch (error) {
        results.push({
          path: relPath,
          ok: false,
          error: errorMessage(error),
        });
      }
    }
    return { results };
  });

  createTypedHandler(fileManagerContracts.copyPaths, async (_, { appId, entries }) => {
    const app = await findApp(appId);
    const appPath = resolveAppRoot(app);

    const results = [];
    for (const { from, to, overwrite } of entries) {
      try {
        const fromRel = await assertMutationPathAllowed({
          appPath,
          relativePath: from,
        });
        const toRel = await assertMutationPathAllowed({
          appPath,
          relativePath: to,
        });
        const fromFull = safeJoin(appPath, fromRel);
        const toFull = safeJoin(appPath, toRel);
        await fsPromises.mkdir(path.dirname(toFull), { recursive: true });
        await fsPromises.cp(fromFull, toFull, {
          recursive: true,
          force: overwrite === true,
        });
        await stageIfGit(appPath, toRel);
        results.push({ path: to, ok: true });
      } catch (error) {
        results.push({ path: to, ok: false, error: errorMessage(error) });
      }
    }
    return { results };
  });

  createTypedHandler(fileManagerContracts.movePaths, async (_, { appId, entries }) => {
    const app = await findApp(appId);
    const appPath = resolveAppRoot(app);

    const results = [];
    for (const { from, to, overwrite } of entries) {
      try {
        // Move mutates the final directory entry itself, so preserve it (and
        // any final symlink) rather than resolving through it.
        const { relativePath: fromRel, fullPath: fromFull } = await prepareDeletePath(
          appPath,
          from,
        );
        const toRel = await assertMutationPathAllowed({
          appPath,
          relativePath: to,
          followFinalSymlink: false,
        });
        const toFull = safeJoin(appPath, toRel);
        // `fs.rename` silently replaces an existing destination on POSIX, so
        // reject a non-overwrite move that would clobber a file the UI did not
        // explicitly approve.
        if (overwrite !== true) {
          let destExists = false;
          try {
            await fsPromises.lstat(toFull);
            destExists = true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          if (destExists) {
            throw new OctopusStudioError(
              `Destination already exists: ${to}`,
              OctopusStudioErrorKind.Conflict,
            );
          }
        }
        await fsPromises.mkdir(path.dirname(toFull), { recursive: true });
        if (overwrite === true) {
          await fsPromises.rm(toFull, { recursive: true, force: true });
        }
        await fsPromises.rename(fromFull, toFull);
        // Stage both sides so git records the rename as delete + add.
        await stageIfGit(appPath, fromRel);
        await stageIfGit(appPath, toRel);
        results.push({ path: to, ok: true });
      } catch (error) {
        results.push({ path: to, ok: false, error: errorMessage(error) });
      }
    }
    return { results };
  });
}
