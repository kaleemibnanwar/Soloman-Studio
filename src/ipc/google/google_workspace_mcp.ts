import { eq, inArray } from "drizzle-orm";
import log from "electron-log";
import { db } from "../../db";
import { mcpServers } from "../../db/schema";
import { LOCAL_MCP_CATALOG, GOOGLE_WORKSPACE_MCP_SLUGS } from "../shared/local_mcp_catalog";
import { encryptToString } from "../utils/secret_storage";
import { getGoogleDriveOAuthConfig } from "./google_drive_auth";
import { mcpManager } from "../mcp/mcp_manager";

const logger = log.scope("google_workspace_mcp");

export interface GoogleTokenBundle {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

const GOOGLE_WORKSPACE_ENTRIES = LOCAL_MCP_CATALOG.filter(
  (entry): entry is Extract<typeof entry, { transport: "http" }> =>
    entry.transport === "http" &&
    (GOOGLE_WORKSPACE_MCP_SLUGS as readonly string[]).includes(entry.slug),
);

/**
 * Provisions (or re-provisions) an `mcpServers` row for every Google
 * Workspace catalog entry from a single OAuth grant, so connecting the
 * Google account once in Settings makes Gmail/Calendar/Docs/Sheets/Slides/
 * Chat/Drive/Contacts all show up already connected — no per-server
 * consent screen, matching the one client Google issued the tokens to.
 */
export async function provisionGoogleWorkspaceMcpServers(tokens: GoogleTokenBundle): Promise<void> {
  const { clientId, clientSecret } = getGoogleDriveOAuthConfig();
  const oauthState = encryptToString(
    JSON.stringify({
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
      clientInformation: {
        client_id: clientId,
        client_secret: clientSecret,
      },
    }),
  );
  const encryptedClientSecret = encryptToString(clientSecret);

  for (const entry of GOOGLE_WORKSPACE_ENTRIES) {
    const existing = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.catalogSlug, entry.slug),
      columns: { id: true },
    });
    const shared = {
      name: entry.name,
      transport: "http" as const,
      url: entry.url,
      enabled: true,
      oauthEnabled: true,
      oauthClientId: clientId,
      oauthClientSecret: encryptedClientSecret,
      oauthScope: entry.oauth?.scope ?? null,
      oauthState,
      catalogSlug: entry.slug,
    };
    if (existing) {
      await db
        .update(mcpServers)
        .set({ ...shared, updatedAt: new Date() })
        .where(eq(mcpServers.id, existing.id));
      // Reconnect with the fresh token instead of an old cached client.
      void mcpManager.dispose(existing.id).catch(() => {});
    } else {
      await db.insert(mcpServers).values(shared);
    }
  }
  logger.info(`Provisioned ${GOOGLE_WORKSPACE_ENTRIES.length} Google Workspace MCP servers`);
}

/** Removes every auto-provisioned Google Workspace MCP server (used on disconnect). */
export async function deprovisionGoogleWorkspaceMcpServers(): Promise<void> {
  const rows = await db.query.mcpServers.findMany({
    where: inArray(mcpServers.catalogSlug, [...GOOGLE_WORKSPACE_MCP_SLUGS]),
    columns: { id: true },
  });
  for (const row of rows) {
    void mcpManager.dispose(row.id).catch(() => {});
  }
  if (rows.length > 0) {
    await db.delete(mcpServers).where(
      inArray(
        mcpServers.id,
        rows.map((r) => r.id),
      ),
    );
  }
  logger.info(`Removed ${rows.length} Google Workspace MCP servers`);
}
