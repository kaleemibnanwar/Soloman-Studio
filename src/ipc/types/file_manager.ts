import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// File Manager Schemas
// =============================================================================

/**
 * One external file/folder being copied into the app. `sourcePath` is an
 * absolute OS path the user dropped; `destPath` is the app-relative destination
 * (already conflict-resolved by the caller).
 */
export const ImportExternalEntrySchema = z.object({
  sourcePath: z.string().min(1),
  destPath: z.string().min(1),
  overwrite: z.boolean().optional(),
});

export const ImportExternalFilesParamsSchema = z.object({
  appId: z.number(),
  entries: z.array(ImportExternalEntrySchema).min(1),
});

export const ImportExternalFilesResultSchema = z.object({
  results: z.array(
    z.object({
      sourcePath: z.string(),
      destPath: z.string(),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  ),
});

export const CreateFileParamsSchema = z.object({
  appId: z.number(),
  path: z.string().min(1),
});

export const CreateFolderParamsSchema = z.object({
  appId: z.number(),
  path: z.string().min(1),
});

export const DeletePathsParamsSchema = z.object({
  appId: z.number(),
  paths: z.array(z.string().min(1)).min(1),
});

/**
 * One project-internal copy/move: `from` and `to` are app-relative paths.
 */
export const CopyMoveEntrySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  overwrite: z.boolean().optional(),
});

export const CopyPathsParamsSchema = z.object({
  appId: z.number(),
  entries: z.array(CopyMoveEntrySchema).min(1),
});

export const MovePathsParamsSchema = CopyPathsParamsSchema;

const FileOpResultSchema = z.object({
  path: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});

export const FileOpResultsSchema = z.object({
  results: z.array(FileOpResultSchema),
});

// =============================================================================
// File Manager Contracts
// =============================================================================

/**
 * Every mutation changes the on-disk file listing and (when git is present)
 * the staged/uncommitted set, so both queries are invalidated app-wide.
 */
const fileTreeInvalidations = (input: { appId: number }) =>
  [
    { family: "app", appId: input.appId },
    { family: "uncommitted-files", appId: input.appId },
  ] as const;

export const fileManagerContracts = {
  importExternalFiles: defineContract({
    channel: "file-manager:import-external-files",
    input: ImportExternalFilesParamsSchema,
    output: ImportExternalFilesResultSchema,
    invalidates: fileTreeInvalidations,
  }),

  createFile: defineContract({
    channel: "file-manager:create-file",
    input: CreateFileParamsSchema,
    output: z.void(),
    invalidates: fileTreeInvalidations,
  }),

  createFolder: defineContract({
    channel: "file-manager:create-folder",
    input: CreateFolderParamsSchema,
    output: z.void(),
    invalidates: fileTreeInvalidations,
  }),

  deletePaths: defineContract({
    channel: "file-manager:delete-paths",
    input: DeletePathsParamsSchema,
    output: FileOpResultsSchema,
    invalidates: fileTreeInvalidations,
  }),

  copyPaths: defineContract({
    channel: "file-manager:copy-paths",
    input: CopyPathsParamsSchema,
    output: FileOpResultsSchema,
    invalidates: fileTreeInvalidations,
  }),

  movePaths: defineContract({
    channel: "file-manager:move-paths",
    input: MovePathsParamsSchema,
    output: FileOpResultsSchema,
    invalidates: fileTreeInvalidations,
  }),
} as const;

// =============================================================================
// File Manager Client
// =============================================================================

export const fileManagerClient = createClient(fileManagerContracts);

// =============================================================================
// Type Exports
// =============================================================================

export type ImportExternalFilesParams = z.infer<typeof ImportExternalFilesParamsSchema>;
export type ImportExternalFilesResult = z.infer<typeof ImportExternalFilesResultSchema>;
export type CreateFileParams = z.infer<typeof CreateFileParamsSchema>;
export type CreateFolderParams = z.infer<typeof CreateFolderParamsSchema>;
export type DeletePathsParams = z.infer<typeof DeletePathsParamsSchema>;
export type CopyPathsParams = z.infer<typeof CopyPathsParamsSchema>;
export type MovePathsParams = z.infer<typeof MovePathsParamsSchema>;
export type FileOpResults = z.infer<typeof FileOpResultsSchema>;
