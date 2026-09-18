import { db } from "@/db";
import { mcpServers } from "@/db/schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { startOctoLimbBridge, stopOctoLimbBridge } from "./octolimb_bridge";

const logger = log.scope("browser-limb-bridge");

const BROWSER_LIMB_NAME = "OctoLimb";
const BROWSER_LIMB_URL = "http://127.0.0.1:32527/mcp";

/**
 * Manages the Octopus Studio Browser Limb (OctoLimb) bridge and database sync.
 *
 * The bridge itself (an MCP-over-HTTP server plus a WebSocket server for the
 * companion Chrome extension) runs in-process inside the Electron main
 * process — see `octolimb_bridge.ts`. There is no external script or child
 * process involved.
 */
export async function syncBrowserLimbBridge(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await startOctoLimbBridge();
      await ensureMcpServerRecord(true);
    } else {
      await stopOctoLimbBridge();
      await ensureMcpServerRecord(false);
    }
  } catch (error) {
    logger.error("Failed to sync OctoLimb bridge:", error);
  }
}

async function ensureMcpServerRecord(enabled: boolean): Promise<void> {
  const existing = await db.select().from(mcpServers).where(eq(mcpServers.name, BROWSER_LIMB_NAME));

  if (existing.length === 0) {
    if (enabled) {
      await db.insert(mcpServers).values({
        name: BROWSER_LIMB_NAME,
        transport: "http",
        url: BROWSER_LIMB_URL,
        enabled: true,
        oauthEnabled: false,
      });
      logger.info("Inserted OctoLimb server record into database");
    }
  } else {
    const server = existing[0];
    if (server.enabled !== enabled) {
      await db.update(mcpServers).set({ enabled }).where(eq(mcpServers.id, server.id));
      logger.info(`Updated OctoLimb server record enabled status to ${enabled}`);
    }
  }
}
