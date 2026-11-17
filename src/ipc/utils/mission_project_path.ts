import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apps } from "@/db/schema";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import {
  getChatProjectRootPath,
  getOctopusStudioAppPath,
  getOctopusStudioProjectsBaseDirectory,
} from "@/paths/paths";

export async function resolveMissionProjectPath(projectId?: number | null): Promise<string> {
  if (projectId != null) {
    const project = await db.query.apps.findFirst({ where: eq(apps.id, projectId) });
    if (!project) {
      throw new OctopusStudioError("Project not found", OctopusStudioErrorKind.NotFound);
    }
    return project.type === "chat"
      ? getChatProjectRootPath(project.directory, project.id)
      : getOctopusStudioAppPath(project.path ?? "");
  }

  const defaultWorkspace = path.join(getOctopusStudioProjectsBaseDirectory(), "default-workspace");
  fs.mkdirSync(defaultWorkspace, { recursive: true });
  return defaultWorkspace;
}
