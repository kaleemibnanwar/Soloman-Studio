import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const symlinkContracts = {
  /**
   * Create a symlink inside `targetAppId`'s project that points at a real
   * file/folder living inside `sourceAppId`'s project, so the two projects
   * share that entry on disk (edits in either project affect the same file).
   */
  createSymlink: defineContract({
    channel: "symlink-create",
    input: z.object({
      sourceAppId: z.number(),
      // Path of the file/folder to share, relative to the source project root.
      sourcePath: z.string().min(1),
      targetAppId: z.number(),
      // Where the link should be created, relative to the target project root.
      targetPath: z.string().min(1),
    }),
    output: z.object({ targetPath: z.string() }),
    invalidates: (input) => [{ family: "app", appId: input.targetAppId }],
  }),

  /** Remove a symlink (never follows through to delete the linked source). */
  removeSymlink: defineContract({
    channel: "symlink-remove",
    input: z.object({
      appId: z.number(),
      path: z.string().min(1),
    }),
    output: z.void(),
    invalidates: (input) => [{ family: "app", appId: input.appId }],
  }),

  /** Cheap on-demand check used to decide whether to offer "Remove link". */
  getEntryInfo: defineContract({
    channel: "symlink-get-entry-info",
    input: z.object({
      appId: z.number(),
      path: z.string().min(1),
    }),
    output: z.object({
      isSymlink: z.boolean(),
      // Absolute path the symlink resolves to, when it is one and is valid.
      linkTarget: z.string().nullable(),
    }),
  }),
};

export const symlinkClient = createClient(symlinkContracts);
