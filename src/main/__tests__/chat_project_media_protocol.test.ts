// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildChatProjectMediaUrl } from "../../lib/octopusStudioMediaUrl";
import { createChatProjectMediaProtocolHandler } from "../chat_project_media_protocol";

describe("chat project media protocol", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "chat-project-media-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function makeHandler() {
    const fetchFile = vi.fn(async () => new Response("file-bytes"));
    const handler = createChatProjectMediaProtocolHandler({
      resolveProjectRoot: async (projectId) => (projectId === 7 ? root : null),
      fetchFile,
    });
    return { handler, fetchFile };
  }

  it("streams a media file and sets its mime type by extension", async () => {
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    const filePath = path.join(root, "docs", "clip.mp4");
    await fs.writeFile(filePath, "video-bytes");
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(buildChatProjectMediaUrl(7, "docs/clip.mp4")));

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("video/mp4");
    expect(await result.text()).toBe("file-bytes");
    expect(fetchFile).toHaveBeenCalledWith(pathToFileURL(filePath).href);
  });

  it("rejects a path that escapes the project root", async () => {
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(buildChatProjectMediaUrl(7, "../outside.txt")));

    expect(result.status).toBe(403);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("returns 404 when the project is not a chat project", async () => {
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(buildChatProjectMediaUrl(99, "clip.mp4")));

    expect(result.status).toBe(404);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing file", async () => {
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(buildChatProjectMediaUrl(7, "missing.mp4")));

    expect(result.status).toBe(404);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("rejects an invalid project id", async () => {
    const { handler } = makeHandler();

    const result = await handler(
      new Request(`octopus-studio-chat-project-media://file/0/clip.mp4`),
    );

    expect(result.status).toBe(403);
  });
});
