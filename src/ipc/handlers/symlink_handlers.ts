import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { db } from "../../db";
import { apps } from "../../db/schema";
import { createTypedHandler } from "./base";
import { symlinkContracts } from "../types/symlink";
import { getChatProjectRootPath, getOctopusStudioAppPath } from "../../paths/paths";
import { assertMutationPathAllowed, lstatIfExists, prepareDeletePath } from "../utils/path_utils";
import { OctopusStudioError, OctopusStudioErrorKind } from "../../errors/octopus_studio_error";

const logger = log.scope("symlink_handlers");

type ProjectRow = {
  id: number;
  type: string;
  path: string | null;
  directory: string | null;
};

function resolveProjectRoot(project: ProjectRow): string {
  return project.type === "chat"
    ? getChatProjectRootPath(project.directory, project.id)
    : getOctopusStudioAppPath(project.path ?? "");
}

async function loadProject(appId: number): Promise<ProjectRow> {
  const project = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true, type: true, path: true, directory: true },
  });
  if (!project) {
    throw new OctopusStudioError(`Project not found: ${appId}`, OctopusStudioErrorKind.NotFound);
  }
  return project;
}

export function registerSymlinkHandlers() {
  createTypedHandler(
    symlinkContracts.createSymlink,
    async (_event, { sourceAppId, sourcePath, targetAppId, targetPath }) => {
      if (sourceAppId === targetAppId) {
        throw new OctopusStudioError(
          "Cannot link a project's files into itself",
          OctopusStudioErrorKind.Validation,
        );
      }

      const [sourceProject, targetProject] = await Promise.all([
        loadProject(sourceAppId),
        loadProject(targetAppId),
      ]);
      const sourceRoot = resolveProjectRoot(sourceProject);
      const targetRoot = resolveProjectRoot(targetProject);

      // Canonicalize the source: it must exist and stay inside its own project.
      const sourceRelative = await assertMutationPathAllowed({
        appPath: sourceRoot,
        relativePath: sourcePath,
      });
      const realSourceRoot = await fs.promises.realpath(sourceRoot);
      const sourceAbsolute = path.join(realSourceRoot, ...sourceRelative.split("/"));
      const sourceStat = lstatIfExists(sourceAbsolute);
      if (!sourceStat) {
        throw new OctopusStudioError(
          `Source path does not exist: ${sourcePath}`,
          OctopusStudioErrorKind.NotFound,
        );
      }

      // Canonicalize the target location: must stay inside the target
      // project, and nothing may already occupy that exact spot.
      const targetRelative = await assertMutationPathAllowed({
        appPath: targetRoot,
        relativePath: targetPath,
        followFinalSymlink: false,
      });
      const realTargetRoot = await fs.promises.realpath(targetRoot);
      const targetAbsolute = path.join(realTargetRoot, ...targetRelative.split("/"));
      if (lstatIfExists(targetAbsolute)) {
        throw new OctopusStudioError(
          `A file or folder already exists at "${targetPath}" in the target project`,
          OctopusStudioErrorKind.Validation,
        );
      }

      // Refuse linking a directory into a location that already sits inside
      // it (or is the same real path) — that would create a symlink cycle.
      const relativeFromSourceToTarget = path.relative(sourceAbsolute, targetAbsolute);
      if (
        relativeFromSourceToTarget === "" ||
        (!relativeFromSourceToTarget.startsWith("..") &&
          !path.isAbsolute(relativeFromSourceToTarget))
      ) {
        throw new OctopusStudioError(
          "Cannot link a folder into a location inside itself",
          OctopusStudioErrorKind.Validation,
        );
      }

      await fs.promises.mkdir(path.dirname(targetAbsolute), {
        recursive: true,
      });
      await fs.promises.symlink(
        sourceAbsolute,
        targetAbsolute,
        process.platform === "win32" ? (sourceStat.isDirectory() ? "junction" : "file") : undefined,
      );

      logger.info(
        `Linked ${sourceProject.id}:${sourceRelative} -> ${targetProject.id}:${targetRelative}`,
      );

      return { targetPath: targetRelative };
    },
  );

  createTypedHandler(
    symlinkContracts.removeSymlink,
    async (_event, { appId, path: relativePath }) => {
      const project = await loadProject(appId);
      const root = resolveProjectRoot(project);
      const prepared = await prepareDeletePath(root, relativePath);
      const stat = lstatIfExists(prepared.fullPath);
      if (!stat || !stat.isSymbolicLink()) {
        throw new OctopusStudioError(
          `Not a symlink: ${relativePath}`,
          OctopusStudioErrorKind.Validation,
        );
      }
      // unlink (not rm/rmdir) removes only the link's directory entry, even
      // when it points at a directory — the linked source is never touched.
      await fs.promises.unlink(prepared.fullPath);
      logger.info(`Removed link ${project.id}:${prepared.relativePath}`);
    },
  );

  createTypedHandler(
    symlinkContracts.getEntryInfo,
    async (_event, { appId, path: relativePath }) => {
      const project = await loadProject(appId);
      const root = resolveProjectRoot(project);
      const relative = await assertMutationPathAllowed({
        appPath: root,
        relativePath,
        followFinalSymlink: false,
      });
      const realRoot = await fs.promises.realpath(root);
      const fullPath = path.join(realRoot, ...relative.split("/"));
      const stat = lstatIfExists(fullPath);
      if (!stat?.isSymbolicLink()) {
        return { isSymlink: false, linkTarget: null };
      }
      const linkTarget = await fs.promises.realpath(fullPath).catch(() => null);
      return { isSymlink: true, linkTarget };
    },
  );
}
