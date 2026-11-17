import { createServer } from "node:http";
import crypto from "node:crypto";
import { shell } from "electron";
import log from "electron-log";
import { getGoogleDriveOAuthConfig, saveDriveAccount } from "./google_drive_auth";
import { OctopusStudioError, OctopusStudioErrorKind } from "../../errors/octopus_studio_error";

const logger = log.scope("google_drive_oauth_flow");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// This one consent screen covers Drive sync (this module) plus every
// Google Workspace MCP server in the catalog (see
// GOOGLE_WORKSPACE_MCP_SLUGS / google_workspace_mcp.ts) — it requests the
// union of every scope those servers document, so connecting once here
// provisions all of them without a separate consent screen each. Keep this
// in sync with the `oauth.scope` on each Google Workspace entry in
// local_mcp_catalog.ts.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.memberships.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
  "https://www.googleapis.com/auth/chat.messages.create",
  "https://www.googleapis.com/auth/chat.users.readstate",
  "https://www.googleapis.com/auth/directory.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
  "openid",
  "email",
].join(" ");
const FLOW_TIMEOUT_MS = 5 * 60_000;

let flowInFlight = false;

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(json) as { email?: string };
    return parsed.email ?? null;
  } catch {
    return null;
  }
}

function renderCallbackPage(kind: "success" | "error", message: string): string {
  const accent = kind === "success" ? "#10b981" : "#ef4444";
  const escaped = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Google Drive — OctopusStudio</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#0f172a;}
.card{max-width:420px;padding:32px;border-radius:16px;background:#fff;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center;}
h1{margin:0 0 8px;font-size:20px;color:${accent};}
p{margin:0;color:#475569;font-size:14px;}
</style></head><body><div class="card"><h1>${kind === "success" ? "Connected" : "Connection failed"}</h1><p>${escaped}</p><p style="margin-top:12px">You can close this tab and return to OctopusStudio.</p></div></body></html>`;
}

/**
 * Runs a one-shot Google OAuth (PKCE, loopback redirect) flow: opens the
 * consent screen in the system browser, waits for the redirect back to a
 * local server, exchanges the code for tokens, and stores them.
 */
export async function connectGoogleDrive(): Promise<{
  email: string | null;
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
}> {
  if (flowInFlight) {
    throw new OctopusStudioError(
      "A Google Drive connection attempt is already in progress.",
      OctopusStudioErrorKind.Precondition,
    );
  }
  flowInFlight = true;

  try {
    const { clientId } = getGoogleDriveOAuthConfig();
    const state = base64UrlEncode(crypto.randomBytes(16));
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(
      crypto.createHash("sha256").update(codeVerifier).digest(),
    );

    const { code, redirectUri } = await new Promise<{
      code: string;
      redirectUri: string;
    }>((resolve, reject) => {
      let settled = false;
      const server = createServer((req, res) => {
        if (settled || !req.url) return;
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404).end();
          return;
        }
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const returnedCode = url.searchParams.get("code");

        if (returnedState !== state) {
          res
            .writeHead(400, { "Content-Type": "text/html" })
            .end(renderCallbackPage("error", "Mismatched request. Please try again."));
          return;
        }
        if (error || !returnedCode) {
          res
            .writeHead(400, { "Content-Type": "text/html" })
            .end(renderCallbackPage("error", error ?? "No authorization code returned."));
          settled = true;
          server.close();
          reject(
            new OctopusStudioError(
              `Google sign-in failed: ${error ?? "no code returned"}`,
              OctopusStudioErrorKind.External,
            ),
          );
          return;
        }

        res
          .writeHead(200, { "Content-Type": "text/html" })
          .end(renderCallbackPage("success", "Google Drive is now connected."));
        settled = true;
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        server.close();
        resolve({
          code: returnedCode,
          redirectUri: `http://127.0.0.1:${port}/oauth2callback`,
        });
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        server.close();
        reject(
          new OctopusStudioError(
            "Timed out waiting for Google sign-in.",
            OctopusStudioErrorKind.External,
          ),
        );
      }, FLOW_TIMEOUT_MS);
      server.on("close", () => clearTimeout(timeout));

      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
        const authUrl = new URL(GOOGLE_AUTH_URL);
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", SCOPES);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        shell.openExternal(authUrl.toString()).catch((err) => {
          logger.error("Failed to open browser for Google sign-in", err);
        });
      });
    });

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      const body = await tokenResponse.text().catch(() => "");
      logger.error(`Token exchange failed: ${tokenResponse.status} ${body}`);
      throw new OctopusStudioError(
        "Failed to complete Google sign-in.",
        OctopusStudioErrorKind.External,
      );
    }
    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
      token_type?: string;
      scope?: string;
    };
    if (!tokenData.refresh_token) {
      throw new OctopusStudioError(
        "Google did not return a refresh token. Disconnect any existing OctopusStudio access at myaccount.google.com/permissions and try again.",
        OctopusStudioErrorKind.External,
      );
    }
    const email = decodeIdTokenEmail(tokenData.id_token);
    await saveDriveAccount({
      email,
      refreshToken: tokenData.refresh_token,
      accessToken: tokenData.access_token,
      expiresInSeconds: tokenData.expires_in,
    });
    return {
      email,
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type ?? "Bearer",
        // Falls back to the requested scope string if Google omits it (it
        // shouldn't, but the field is technically optional per RFC 6749).
        scope: tokenData.scope ?? SCOPES,
      },
    };
  } finally {
    flowInFlight = false;
  }
}
