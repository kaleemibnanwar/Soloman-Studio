import { eq } from "drizzle-orm";
import log from "electron-log";
import { db } from "../../db";
import { apps } from "../../db/schema";
import { createTypedHandler } from "./base";
import { googleDriveContracts } from "../types/google_drive";
import { clearDriveAccount, getDriveAccount } from "../google/google_drive_auth";
import { connectGoogleDrive } from "../google/google_drive_oauth_flow";
import {
  deleteProjectDriveFolder,
  disableProjectDriveSync,
  enableProjectDriveSync,
  syncProject,
} from "../google/google_drive_sync";
import {
  deprovisionGoogleWorkspaceMcpServers,
  provisionGoogleWorkspaceMcpServers,
} from "../google/google_workspace_mcp";
import { OctopusStudioError, OctopusStudioErrorKind } from "../../errors/octopus_studio_error";

const logger = log.scope("google_drive_handlers");

async function loadAppOrThrow(appId: number) {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: {
      googleDriveSyncEnabled: true,
      googleDriveFolderId: true,
      googleDriveFolderName: true,
      googleDriveLastSyncedAt: true,
    },
  });
  if (!app) {
    throw new OctopusStudioError(`Project not found: ${appId}`, OctopusStudioErrorKind.NotFound);
  }
  return app;
}

export function registerGoogleDriveHandlers() {
  createTypedHandler(googleDriveContracts.getAccountStatus, async () => {
    const account = await getDriveAccount();
    return { connected: account != null, email: account?.email ?? null };
  });

  createTypedHandler(googleDriveContracts.connect, async () => {
    const { email, tokens } = await connectGoogleDrive();
    // Best-effort: Drive access itself is already connected at this point,
    // so a provisioning hiccup shouldn't surface as a failed sign-in.
    await provisionGoogleWorkspaceMcpServers(tokens).catch((error) => {
      logger.error("Failed to provision Google Workspace MCP servers", error);
    });
    return { email };
  });

  createTypedHandler(googleDriveContracts.disconnect, async () => {
    await clearDriveAccount();
    await deprovisionGoogleWorkspaceMcpServers().catch((error) => {
      logger.error("Failed to remove Google Workspace MCP servers", error);
    });
  });

  createTypedHandler(googleDriveContracts.getProjectSyncStatus, async (_event, { appId }) => {
    const app = await loadAppOrThrow(appId);
    return {
      enabled: app.googleDriveSyncEnabled,
      folderId: app.googleDriveFolderId,
      folderName: app.googleDriveFolderName,
      lastSyncedAt: app.googleDriveLastSyncedAt,
    };
  });

  createTypedHandler(googleDriveContracts.enableProjectSync, async (_event, { appId }) =>
    enableProjectDriveSync(appId),
  );

  createTypedHandler(googleDriveContracts.disableProjectSync, async (_event, { appId }) => {
    await disableProjectDriveSync(appId);
  });

  createTypedHandler(googleDriveContracts.syncProjectNow, async (_event, { appId }) =>
    syncProject(appId),
  );

  createTypedHandler(googleDriveContracts.deleteProjectDriveFolder, async (_event, { appId }) => {
    await deleteProjectDriveFolder(appId);
  });
}
