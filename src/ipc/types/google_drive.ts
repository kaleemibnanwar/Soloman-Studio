import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

const DriveSyncSummarySchema = z.object({
  uploaded: z.number(),
  downloaded: z.number(),
  deletedLocal: z.number(),
  deletedRemote: z.number(),
  conflicts: z.number(),
});
export type DriveSyncSummary = z.infer<typeof DriveSyncSummarySchema>;

export const googleDriveContracts = {
  getAccountStatus: defineContract({
    channel: "google-drive-get-account-status",
    input: z.void(),
    output: z.object({
      connected: z.boolean(),
      email: z.string().nullable(),
    }),
  }),

  connect: defineContract({
    channel: "google-drive-connect",
    input: z.void(),
    output: z.object({ email: z.string().nullable() }),
  }),

  disconnect: defineContract({
    channel: "google-drive-disconnect",
    input: z.void(),
    output: z.void(),
  }),

  getProjectSyncStatus: defineContract({
    channel: "google-drive-get-project-sync-status",
    input: z.object({ appId: z.number() }),
    output: z.object({
      enabled: z.boolean(),
      folderId: z.string().nullable(),
      folderName: z.string().nullable(),
      lastSyncedAt: z.date().nullable(),
    }),
  }),

  enableProjectSync: defineContract({
    channel: "google-drive-enable-project-sync",
    input: z.object({ appId: z.number() }),
    output: DriveSyncSummarySchema,
    invalidates: (input) => [{ family: "app", appId: input.appId }],
  }),

  disableProjectSync: defineContract({
    channel: "google-drive-disable-project-sync",
    input: z.object({ appId: z.number() }),
    output: z.void(),
    invalidates: (input) => [{ family: "app", appId: input.appId }],
  }),

  syncProjectNow: defineContract({
    channel: "google-drive-sync-project-now",
    input: z.object({ appId: z.number() }),
    output: DriveSyncSummarySchema,
    invalidates: (input) => [{ family: "app", appId: input.appId }],
  }),

  deleteProjectDriveFolder: defineContract({
    channel: "google-drive-delete-project-folder",
    input: z.object({ appId: z.number() }),
    output: z.void(),
  }),
};

export const googleDriveClient = createClient(googleDriveContracts);
