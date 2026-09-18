import crypto from "node:crypto";
import log from "electron-log";
import { getValidAccessToken } from "./google_drive_auth";
import {
  OctopusStudioError,
  OctopusStudioErrorKind,
} from "../../errors/octopus_studio_error";

const logger = log.scope("google_drive_client");
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum: string | null;
}

async function driveFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await getValidAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error(`Drive API error ${response.status} for ${url}: ${body}`);
    throw new OctopusStudioError(
      `Google Drive request failed (${response.status}). ${body.slice(0, 300)}`,
      OctopusStudioErrorKind.External,
    );
  }
  return response;
}

/** Find or create a top-level "OctopusStudio Projects" folder that holds one subfolder per synced project. */
export async function ensureRootSyncFolder(): Promise<string> {
  const query = encodeURIComponent(
    `mimeType='${FOLDER_MIME_TYPE}' and name='OctopusStudio Projects' and 'root' in parents and trashed=false`,
  );
  const listRes = await driveFetch(
    `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)`,
  );
  const { files } = (await listRes.json()) as { files: { id: string }[] };
  if (files.length > 0) {
    return files[0].id;
  }
  return createFolder("OctopusStudio Projects", null);
}

export async function createFolder(
  name: string,
  parentId: string | null,
): Promise<string> {
  const res = await driveFetch(`${DRIVE_API_BASE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const { id } = (await res.json()) as { id: string };
  return id;
}

/** Lists all non-trashed children of a folder, following pagination. */
export async function listFolderChildren(
  folderId: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  do {
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.search = `q=${query}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)&pageSize=1000`;
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await driveFetch(url.toString());
    const data = (await res.json()) as {
      files: DriveFile[];
      nextPageToken?: string;
    };
    files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

function guessMimeType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".json": "application/json",
    ".js": "text/javascript",
    ".ts": "text/plain",
    ".tsx": "text/plain",
    ".jsx": "text/plain",
    ".css": "text/css",
    ".html": "text/html",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  return map[ext] ?? "application/octet-stream";
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: Buffer,
  mimeType: string,
): { body: Buffer; boundary: string } {
  const boundary = `octopusstudio-drive-${crypto.randomBytes(8).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata,
    )}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  return { body: Buffer.concat([head, content, tail]), boundary };
}

/** Creates a new file with content in one call, returning its Drive file id. */
export async function uploadNewFile(params: {
  name: string;
  parentId: string;
  content: Buffer;
}): Promise<string> {
  const mimeType = guessMimeType(params.name);
  const { body, boundary } = buildMultipartBody(
    { name: params.name, parents: [params.parentId] },
    params.content,
    mimeType,
  );
  const res = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,modifiedTime,md5Checksum`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    },
  );
  const { id } = (await res.json()) as { id: string };
  return id;
}

/** Overwrites an existing file's content, keeping its Drive file id and metadata. */
export async function updateFileContent(
  fileId: string,
  content: Buffer,
  fileName: string,
): Promise<void> {
  await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": guessMimeType(fileName) },
      body: new Uint8Array(content),
    },
  );
}

export async function downloadFileContent(fileId: string): Promise<Buffer> {
  const res = await driveFetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API_BASE}/files/${fileId}`, { method: "DELETE" });
}
