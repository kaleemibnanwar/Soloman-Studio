import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getFileMimeType } from "../lib/filePreview";

type AppFileProtocolDependencies = {
  /** Resolve an app/chat-project id to its on-disk root, or null when unknown. */
  resolveAppRoot: (appId: number) => Promise<string | null>;
  /** Stream a file:// URL (Electron's `net.fetch`, injected for testability). */
  fetchFile: (url: string) => Promise<Response>;
};

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** Mirrors the guard in chat_project_media_protocol.ts. */
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
 * Serves the raw bytes of any project file to the renderer, so the file preview
 * can stream images, video, audio, PDFs, fonts, and archive payloads without
 * round-tripping them through IPC as (lossy) UTF-8 text.
 *
 * Format: octopus-studio-file://file/{appId}/{relative-path}
 *
 * Supports HTTP Range requests so `<video>`/`<audio>` can seek without buffering
 * the whole file; a full response streams the file via `net.fetch` the same way
 * the existing media protocols do.
 */
export function createAppFileProtocolHandler({
  resolveAppRoot,
  fetchFile,
}: AppFileProtocolDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.protocol !== "octopus-studio-file:" || url.hostname !== "file") {
        return response(403, "Forbidden");
      }

      const segments = url.pathname.slice(1).split("/");
      if (segments.length < 2) {
        return response(400, "Bad Request");
      }
      const appId = Number(segments[0]);
      if (!Number.isSafeInteger(appId) || appId <= 0) {
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

      const root = await resolveAppRoot(appId);
      if (!root) return response(404, "Not Found");

      let target: string;
      try {
        target = resolveInsideRoot(root, relativePath);
      } catch {
        return response(403, "Forbidden");
      }

      const stat = await fs.stat(target).catch(() => null);
      if (!stat || !stat.isFile()) {
        return response(404, "Not Found");
      }

      const mime = getFileMimeType(relativePath) ?? "application/octet-stream";
      const commonHeaders: Record<string, string> = {
        "Content-Type": mime,
        "Accept-Ranges": "bytes",
      };

      const rangeHeader = request.headers.get("Range");
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (!match) return response(416, "Range Not Satisfiable");
        const start = match[1] ? Number(match[1]) : null;
        const end = match[2] ? Number(match[2]) : null;
        if (start != null && end != null && start > end) {
          return response(416, "Range Not Satisfiable");
        }
        const resolvedStart = start ?? Math.max(0, stat.size - (end ?? 0));
        const resolvedEnd = end != null ? Math.min(end, stat.size - 1) : stat.size - 1;
        if (resolvedStart >= stat.size || resolvedEnd < resolvedStart) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }

        const length = resolvedEnd - resolvedStart + 1;
        const buffer = Buffer.allocUnsafe(length);
        const handle = await fs.open(target, "r");
        try {
          const { bytesRead } = await handle.read(buffer, 0, length, resolvedStart);
          const slice = buffer.subarray(0, bytesRead);
          return new Response(new Uint8Array(slice), {
            status: 206,
            headers: {
              ...commonHeaders,
              "Content-Length": String(slice.length),
              "Content-Range": `bytes ${resolvedStart}-${resolvedStart + slice.length - 1}/${stat.size}`,
            },
          });
        } finally {
          await handle.close();
        }
      }

      // Full response: stream the file rather than buffering large media.
      const fileResponse = await fetchFile(pathToFileURL(target).href);
      return new Response(fileResponse.body, {
        status: 200,
        headers: { ...commonHeaders, "Content-Length": String(stat.size) },
      });
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
