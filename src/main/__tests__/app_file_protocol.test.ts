// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppFileProtocolHandler } from "../app_file_protocol";

describe("app file protocol", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "app-file-protocol-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function makeHandler() {
    const fetchFile = vi.fn(async () => new Response("streamed-file-bytes"));
    const handler = createAppFileProtocolHandler({
      resolveAppRoot: async (appId) => (appId === 7 ? root : null),
      fetchFile,
    });
    return { handler, fetchFile };
  }

  function url(appId: number, filePath: string) {
    return `octopus-studio-file://file/${appId}/${filePath}`;
  }

  it("streams a file and sets its mime type by extension", async () => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    const filePath = path.join(root, "src", "logo.png");
    await fs.writeFile(filePath, "png-bytes");
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(url(7, "src/logo.png")));

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/png");
    expect(result.headers.get("accept-ranges")).toBe("bytes");
    expect(await result.text()).toBe("streamed-file-bytes");
    expect(fetchFile).toHaveBeenCalledWith(pathToFileURL(filePath).href);
  });

  it("serves a byte range for media seeking", async () => {
    const filePath = path.join(root, "clip.mp4");
    await fs.writeFile(filePath, Buffer.from("0123456789abcdef"));
    const { handler } = makeHandler();

    const result = await handler(
      new Request(url(7, "clip.mp4"), { headers: { Range: "bytes=2-5" } }),
    );

    expect(result.status).toBe(206);
    expect(result.headers.get("content-type")).toBe("video/mp4");
    expect(result.headers.get("content-range")).toBe("bytes 2-5/16");
    expect(await result.arrayBuffer()).toEqual(Buffer.from("2345").buffer);
  });

  it("never serves a file outside the app root", async () => {
    const { handler, fetchFile } = makeHandler();

    // `..` (raw or percent-encoded) must never escape the app root. The URL
    // parser normalizes dot-segments first, and resolveInsideRoot is the
    // defense-in-depth backstop — either way the request is refused, not 200.
    for (const traversal of ["../outside.txt", "src/%2e%2e/outside.txt"]) {
      const result = await handler(new Request(url(7, traversal)));
      expect(result.status).not.toBe(200);
    }
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("returns 404 when the app id is unknown", async () => {
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(url(99, "logo.png")));

    expect(result.status).toBe(404);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing file", async () => {
    const { handler, fetchFile } = makeHandler();

    const result = await handler(new Request(url(7, "missing.png")));

    expect(result.status).toBe(404);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("rejects an invalid app id", async () => {
    const { handler } = makeHandler();

    const result = await handler(new Request(url(0, "logo.png")));

    expect(result.status).toBe(403);
  });
});
