import { eq } from "drizzle-orm";
import log from "electron-log";
import { db } from "../../db";
import { driveAccount } from "../../db/schema";
import { encryptToString, decryptFromString } from "../utils/secret_storage";
import { OctopusStudioError, OctopusStudioErrorKind } from "../../errors/octopus_studio_error";

const logger = log.scope("google_drive_auth");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// Refresh a bit early so a request started right before expiry doesn't race it.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export function getGoogleDriveOAuthConfig(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new OctopusStudioError(
      "Google Drive is not configured (missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET).",
      OctopusStudioErrorKind.Precondition,
    );
  }
  return { clientId, clientSecret };
}

export interface StoredDriveAccount {
  id: number;
  email: string | null;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
}

async function loadRawAccount() {
  // Single connected account expected; take the most recent if more than
  // one row ever exists (defensive — save always upserts row id 1... but
  // we don't assume that, so just order by id).
  const rows = await db.query.driveAccount.findMany({
    orderBy: (t, { desc }) => [desc(t.id)],
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function getDriveAccount(): Promise<StoredDriveAccount | null> {
  const row = await loadRawAccount();
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    refreshToken: decryptFromString(row.refreshTokenEncrypted),
    accessToken: row.accessTokenEncrypted ? decryptFromString(row.accessTokenEncrypted) : null,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
  };
}

export async function saveDriveAccount(params: {
  email: string | null;
  refreshToken: string;
  accessToken?: string | null;
  expiresInSeconds?: number | null;
}): Promise<void> {
  const existing = await loadRawAccount();
  const accessTokenExpiresAt =
    params.expiresInSeconds != null ? new Date(Date.now() + params.expiresInSeconds * 1000) : null;
  const values = {
    email: params.email,
    refreshTokenEncrypted: encryptToString(params.refreshToken),
    accessTokenEncrypted: params.accessToken ? encryptToString(params.accessToken) : null,
    accessTokenExpiresAt,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(driveAccount).set(values).where(eq(driveAccount.id, existing.id));
  } else {
    await db.insert(driveAccount).values(values);
  }
}

export async function clearDriveAccount(): Promise<void> {
  const existing = await loadRawAccount();
  if (existing) {
    await db.delete(driveAccount).where(eq(driveAccount.id, existing.id));
  }
}

/**
 * Returns a currently-valid access token, transparently refreshing via the
 * stored refresh token when the cached access token is missing or expiring.
 */
export async function getValidAccessToken(): Promise<string> {
  const account = await getDriveAccount();
  if (!account) {
    throw new OctopusStudioError(
      "Google Drive is not connected.",
      OctopusStudioErrorKind.Precondition,
    );
  }

  const isFresh =
    account.accessToken != null &&
    account.accessTokenExpiresAt != null &&
    account.accessTokenExpiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now();
  if (isFresh) {
    return account.accessToken!;
  }

  const { clientId, clientSecret } = getGoogleDriveOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error(`Token refresh failed: ${response.status} ${body}`);
    throw new OctopusStudioError(
      "Failed to refresh Google Drive access token. Reconnect Google Drive in Settings.",
      OctopusStudioErrorKind.External,
    );
  }
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  await saveDriveAccount({
    email: account.email,
    refreshToken: account.refreshToken,
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in,
  });
  return data.access_token;
}

export async function isDriveConnected(): Promise<boolean> {
  return (await getDriveAccount()) != null;
}
