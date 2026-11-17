import { getOctopusStudioAppPath } from "../../paths/paths";
import { safeJoin } from "../utils/path_utils";
import { getMimeType } from "../utils/mime_utils";
import { OCTOPUS_STUDIO_MEDIA_DIR_NAME, SOLOMAN_MEDIA_DIR_NAME } from "./media_path_utils";
import fs from "node:fs";
import path from "node:path";

interface ResolvedMediaFile {
  appName: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

export async function resolveMediaMentions(
  mediaRefs: string[],
  appPath: string,
  appName: string,
): Promise<ResolvedMediaFile[]> {
  const resolved: ResolvedMediaFile[] = [];
  const resolvedAppPath = getOctopusStudioAppPath(appPath);

  for (const encodedFileName of mediaRefs) {
    try {
      const fileName = decodeURIComponent(encodedFileName);
      const candidates = [SOLOMAN_MEDIA_DIR_NAME, OCTOPUS_STUDIO_MEDIA_DIR_NAME].map((mediaDir) =>
        safeJoin(resolvedAppPath, mediaDir, fileName),
      );
      const filePath = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
      if (!fs.existsSync(filePath)) continue;

      const ext = path.extname(fileName).toLowerCase();
      resolved.push({
        appName,
        fileName,
        filePath,
        mimeType: getMimeType(ext),
      });
    } catch {
      // safeJoin throws on path traversal attempts - skip silently
      continue;
    }
  }

  return resolved;
}
