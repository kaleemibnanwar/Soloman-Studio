import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getMimeTypeForFileName } from "../lib/mediaKind";

type ChatProjectMediaProtocolDependencies = {
  /** Resolve a chat project id to its on-disk root, or null when it isn't a chat project. */
  resolveProjectRoot: (projectId: number) => Promise<string | null>;
  fetchFile: (url: string) => Promise<Response>;
};

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Resolve a user-supplied relative path inside the project root, refusing any
 * path that escapes it. Mirrors the guard in `chat_project_handlers.ts`.
 */
function resolveInsideRoot(root: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.includes("\0") || normalized.split("/").includes("..")) {
    throw new Error("Invalid file path");
  }
  const target = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid file path");
  }
  return target;
}

/**
 * Serves binary media (image/video/audio) from a chat project's directory tree,
 * streamed via `net.fetch` so video/audio play without buffering the whole file.
 * Format: octopus-studio-chat-project-media://file/{projectId}/{relative-path}
 */
export function createChatProjectMediaProtocolHandler({
  resolveProjectRoot,
  fetchFile,
}: ChatProjectMediaProtocolDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.protocol !== "octopus-studio-chat-project-media:" || url.hostname !== "file") {
        return response(403, "Forbidden");
      }

      const segments = url.pathname.slice(1).split("/");
      if (segments.length < 2) {
        return response(400, "Bad Request");
      }
      const projectId = Number(segments[0]);
      if (!Number.isSafeInteger(projectId) || projectId <= 0) {
        return response(403, "Forbidden");
      }

      let relativePath: string;
      try {
        relativePath = decodeURIComponent(segments.slice(1).join("/"));
      } catch {
        return response(400, "Bad Request");
      }
      if (!relativePath) {
        return response(400, "Bad Request");
      }

      const root = await resolveProjectRoot(projectId);
      if (!root) return response(404, "Not Found");

      let target: string;
      try {
        target = resolveInsideRoot(root, relativePath);
      } catch {
        return response(403, "Forbidden");
      }

      try {
        const stat = await fs.stat(target);
        if (!stat.isFile()) {
          return response(404, "Not Found");
        }
      } catch {
        return response(404, "Not Found");
      }

      const mime = getMimeTypeForFileName(relativePath);
      const fileResponse = await fetchFile(pathToFileURL(target).href);
      if (mime) {
        return new Response(fileResponse.body, {
          status: fileResponse.status,
          headers: { "Content-Type": mime },
        });
      }
      return fileResponse;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return response(404, "Not Found");
      }
      if (error instanceof URIError || error instanceof TypeError) {
        return response(400, "Bad Request");
      }
      return response(500, "Could not load file");
    }
  };
}
