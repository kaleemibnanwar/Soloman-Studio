// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findApp, gitAdd } = vi.hoisted(() => ({
  findApp: vi.fn(),
  gitAdd: vi.fn(),
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@/db", () => ({
  db: { query: { apps: { findFirst: findApp } } },
}));

vi.mock("@/paths/paths", () => ({
  getOctopusStudioAppPath: (folderName: string) => folderName,
  getChatProjectRootPath: () => "chat-root",
}));

vi.mock("../git/git_utils", () => ({ gitAdd }));

import { getRegisteredHandlerForTesting } from "../base";
import { fileManagerContracts } from "../../types/file_manager";
import { registerFileManagerHandlers } from "../file_manager_handlers";

registerFileManagerHandlers();

const invoke = (channel: string, input: unknown) =>
  getRegisteredHandlerForTesting(channel)({} as never, input);

describe("file_manager_handlers", () => {
  let appPath: string;

  beforeEach(async () => {
    appPath = await fs.mkdtemp(path.join(os.tmpdir(), "octopus-studio-fm-app-"));
    await fs.writeFile(path.join(appPath, "existing.txt"), "existing");
    await fs.mkdir(path.join(appPath, "src"), { recursive: true });
    await fs.writeFile(path.join(appPath, "src", "a.ts"), "// a");
    findApp.mockResolvedValue({
      id: 42,
      type: "app",
      path: appPath,
      directory: null,
    });
    gitAdd.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await fs.rm(appPath, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("creates a file", async () => {
    await invoke(fileManagerContracts.createFile.channel, {
      appId: 42,
      path: "notes/hello.ts",
    });
    await expect(fs.readFile(path.join(appPath, "notes", "hello.ts"), "utf8")).resolves.toBe("");
  });

  it("creates a folder", async () => {
    await invoke(fileManagerContracts.createFolder.channel, {
      appId: 42,
      path: "src/components",
    });
    const stat = await fs.stat(path.join(appPath, "src", "components"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("deletes a file", async () => {
    const result = await invoke(fileManagerContracts.deletePaths.channel, {
      appId: 42,
      paths: ["existing.txt"],
    });
    expect(result).toEqual({ results: [{ path: "existing.txt", ok: true }] });
    await expect(fs.access(path.join(appPath, "existing.txt"))).rejects.toThrow();
  });

  it("moves a file", async () => {
    const result = await invoke(fileManagerContracts.movePaths.channel, {
      appId: 42,
      entries: [{ from: "src/a.ts", to: "src/b.ts" }],
    });
    expect(result).toEqual({ results: [{ path: "src/b.ts", ok: true }] });
    await expect(fs.access(path.join(appPath, "src", "b.ts"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(appPath, "src", "a.ts"))).rejects.toThrow();
  });

  it("refuses to move onto an existing file without overwrite", async () => {
    const result = await invoke(fileManagerContracts.movePaths.channel, {
      appId: 42,
      entries: [{ from: "src/a.ts", to: "existing.txt" }],
    });
    expect(result).toEqual({
      results: [{ path: "existing.txt", ok: false, error: expect.any(String) }],
    });
    await expect(fs.readFile(path.join(appPath, "existing.txt"), "utf8")).resolves.toBe("existing");
    await expect(fs.readFile(path.join(appPath, "src", "a.ts"), "utf8")).resolves.toBe("// a");
  });

  it("copies a file", async () => {
    const result = await invoke(fileManagerContracts.copyPaths.channel, {
      appId: 42,
      entries: [{ from: "existing.txt", to: "copy.txt" }],
    });
    expect(result).toEqual({ results: [{ path: "copy.txt", ok: true }] });
    await expect(fs.readFile(path.join(appPath, "copy.txt"), "utf8")).resolves.toBe("existing");
  });

  it("imports an external file into the app", async () => {
    const external = path.join(os.tmpdir(), `octopus-fm-ext-${Date.now()}.txt`);
    await fs.writeFile(external, "external");
    try {
      const result = await invoke(fileManagerContracts.importExternalFiles.channel, {
        appId: 42,
        entries: [{ sourcePath: external, destPath: "vendor/ext.txt" }],
      });
      expect(result).toEqual({
        results: [{ sourcePath: external, destPath: "vendor/ext.txt", ok: true }],
      });
      await expect(fs.readFile(path.join(appPath, "vendor", "ext.txt"), "utf8")).resolves.toBe(
        "external",
      );
    } finally {
      await fs.rm(external, { force: true });
    }
  });

  it("rejects a createFile path that escapes the app", async () => {
    await expect(
      invoke(fileManagerContracts.createFile.channel, {
        appId: 42,
        path: "../outside.txt",
      }),
    ).rejects.toThrow();
  });

  it("returns ok:false rather than throwing when a delete path escapes", async () => {
    const result = await invoke(fileManagerContracts.deletePaths.channel, {
      appId: 42,
      paths: ["../outside.txt"],
    });
    expect(result).toEqual({
      results: [{ path: "../outside.txt", ok: false, error: expect.any(String) }],
    });
  });
});
