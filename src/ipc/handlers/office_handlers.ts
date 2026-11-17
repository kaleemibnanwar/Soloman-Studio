import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { apps } from "../../db/schema";
import { createTypedHandler } from "./base";
import { officeContracts } from "../types/office";
import { generateDocx, generateXlsx, parseDocx, parsePptx, parseXlsx } from "../office/office_open";
import { getOctopusStudioAppPath, getChatProjectRootPath } from "../../paths/paths";
import { safeJoin } from "../utils/path_utils";
import { gitService } from "../services/git_service";
import { queueCloudSandboxSnapshotSync } from "../utils/cloud_sandbox_provider";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";

async function parseByExtension(ext: string, buffer: Buffer): Promise<unknown> {
  if (ext === ".docx") return parseDocx(buffer);
  if (ext === ".pptx") return parsePptx(buffer);
  if (ext === ".xlsx") return parseXlsx(buffer);
  return null;
}

async function resolveProjectPath(appId: number): Promise<string> {
  const project = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true, type: true, path: true, directory: true },
  });
  if (!project) {
    throw new OctopusStudioError("App not found", OctopusStudioErrorKind.NotFound);
  }
  return project.type === "chat"
    ? getChatProjectRootPath(project.directory, project.id)
    : getOctopusStudioAppPath(project.path ?? "");
}

async function writeGeneratedFile(
  appId: number,
  relPath: string,
  buffer: Uint8Array,
): Promise<void> {
  const projectPath = await resolveProjectPath(appId);
  const full = safeJoin(projectPath, relPath);

  await fsPromises.mkdir(path.dirname(full), { recursive: true });
  await fsPromises.writeFile(full, buffer);

  if (fs.existsSync(path.join(projectPath, ".git"))) {
    await gitService.stageFile({ path: projectPath, filepath: relPath });
  }

  queueCloudSandboxSnapshotSync({ appId, changedPaths: [relPath] });
}

export function registerOfficeHandlers() {
  createTypedHandler(officeContracts.parseFile, async (_event, { appId, relPath }) => {
    const project = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
      columns: { id: true, type: true, path: true, directory: true },
    });
    if (!project) return null;

    const projectPath =
      project.type === "chat"
        ? getChatProjectRootPath(project.directory, project.id)
        : getOctopusStudioAppPath(project.path ?? "");

    const full = safeJoin(projectPath, relPath);
    if (!fs.existsSync(full)) return null;

    const ext = path.extname(relPath).toLowerCase();
    const kind: "docx" | "pptx" | "xlsx" | null =
      ext === ".docx" ? "docx" : ext === ".pptx" ? "pptx" : ext === ".xlsx" ? "xlsx" : null;
    if (!kind) return null;

    const buffer = fs.readFileSync(full);
    const data = await parseByExtension(ext, buffer);
    return { kind, data };
  });

  createTypedHandler(
    officeContracts.writeXlsxFile,
    async (_event, { appId, relPath, workbook }) => {
      const buffer = await generateXlsx(workbook);
      await writeGeneratedFile(appId, relPath, buffer);
      return {};
    },
  );

  createTypedHandler(
    officeContracts.writeDocxFile,
    async (_event, { appId, relPath, document }) => {
      const buffer = await generateDocx(document);
      await writeGeneratedFile(appId, relPath, buffer);
      return {};
    },
  );
}
