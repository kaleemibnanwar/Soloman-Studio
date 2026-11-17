import log from "electron-log";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import type {
  AcquireConnectionTicketRequest,
  ApprovePairingRequest,
  ApprovePairingResponse,
  CheckAuthSessionResponse,
  DirectLoginRequest,
  DirectLoginResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  SolomanConnectionTicket,
  SolomanPairing,
  StartAuthSessionResponse,
} from "./types";

const logger = log.scope("soloman-control-plane");

export class ControlPlaneClient {
  private baseUrl: string;

  constructor(baseUrl = "https://soloman.si") {
    // Normalize base URL
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Option B: Direct In-App Login (Headless / CLI / Terminal)
   * POST /api/v1/auth/login/
   */
  public async directLogin(req: DirectLoginRequest): Promise<DirectLoginResponse> {
    const url = `${this.baseUrl}/api/v1/auth/login/`;
    logger.info(`Performing direct in-app login at ${url}`, { username: req.username });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req),
      });
    } catch (err) {
      throw new OctopusStudioError(
        `Failed to reach Soloman Control Plane at ${this.baseUrl}: ${(err as Error).message}`,
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      let errorDetail = errBody;
      try {
        const parsed = JSON.parse(errBody) as { error?: string; detail?: string; message?: string };
        errorDetail = parsed.error ?? parsed.detail ?? parsed.message ?? errBody;
      } catch {
        // use raw body
      }

      throw new OctopusStudioError(
        `Login failed (${response.status}): ${errorDetail}`,
        response.status === 401 || response.status === 403
          ? OctopusStudioErrorKind.Auth
          : OctopusStudioErrorKind.Validation,
      );
    }

    const data = (await response.json()) as DirectLoginResponse;
    // Standardize token field
    const token = data.userAccessToken ?? data.token;
    if (!token) {
      throw new OctopusStudioError(
        "Invalid response from Soloman auth: token not found",
        OctopusStudioErrorKind.External,
      );
    }
    return {
      userAccessToken: token,
      token,
      user: data.user,
    };
  }

  /**
   * Step 2: Register Desktop Host on Platform
   * POST /api/v1/devices/
   */
  public async registerDevice(
    req: RegisterDeviceRequest,
    userAccessToken?: string,
  ): Promise<RegisterDeviceResponse> {
    const url = `${this.baseUrl}/api/v1/devices/`;
    logger.info(`Registering desktop device at ${url}`, { name: req.name });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (userAccessToken) {
      headers["Authorization"] = `Bearer ${userAccessToken}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      });
    } catch (err) {
      throw new OctopusStudioError(
        `Failed to reach Soloman Control Plane at ${this.baseUrl}: ${(err as Error).message}`,
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      let errorDetail = errBody;
      try {
        const parsed = JSON.parse(errBody) as { error?: string; detail?: string; message?: string };
        errorDetail = parsed.error ?? parsed.detail ?? parsed.message ?? errBody;
      } catch {
        // use raw body
      }

      const kind =
        response.status === 401 || response.status === 403
          ? OctopusStudioErrorKind.Auth
          : response.status === 400
            ? OctopusStudioErrorKind.Validation
            : OctopusStudioErrorKind.External;

      throw new OctopusStudioError(
        `Device registration failed (${response.status}): ${errorDetail}`,
        kind,
      );
    }

    const data = (await response.json()) as RegisterDeviceResponse;
    return data;
  }

  /**
   * Step 2: List Pending Pairings
   * GET /api/v1/pairings/?status=pending
   */
  public async listPendingPairings(accessToken: string): Promise<SolomanPairing[]> {
    const url = `${this.baseUrl}/api/v1/pairings/?status=pending`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (err) {
      throw new OctopusStudioError(
        `Failed to query pending pairings: ${(err as Error).message}`,
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new OctopusStudioError(
        `Failed to list pairings (${response.status}): ${errBody}`,
        response.status === 401 ? OctopusStudioErrorKind.Auth : OctopusStudioErrorKind.External,
      );
    }

    const data = (await response.json()) as { pairings?: SolomanPairing[] };
    return data.pairings ?? [];
  }

  /**
   * Step 2: Approve Pairing
   * POST /api/v1/pairings/{pairingId}/approve/
   */
  public async approvePairing(
    accessToken: string,
    pairingId: string,
    verificationCode: string,
  ): Promise<ApprovePairingResponse> {
    const url = `${this.baseUrl}/api/v1/pairings/${pairingId}/approve/`;
    logger.info(`Approving pairing ${pairingId} with code: ${verificationCode}`);

    const payload: ApprovePairingRequest = { verificationCode };
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new OctopusStudioError(
        `Failed to reach Soloman Control Plane to approve pairing: ${(err as Error).message}`,
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      let msg = errBody;
      try {
        const parsed = JSON.parse(errBody) as { error?: string; detail?: string };
        msg = parsed.error ?? parsed.detail ?? errBody;
      } catch {
        // fallback
      }
      throw new OctopusStudioError(
        `Pairing approval failed (${response.status}): ${msg}`,
        response.status === 400
          ? OctopusStudioErrorKind.Validation
          : response.status === 401 || response.status === 403
            ? OctopusStudioErrorKind.Auth
            : OctopusStudioErrorKind.External,
      );
    }

    const data = (await response.json()) as ApprovePairingResponse;
    return data;
  }

  /**
   * Step 3: Acquiring a Host Connection Ticket
   * POST /api/v1/connections/tickets/
   */
  public async acquireHostTicket(
    accessToken: string,
    targetDeviceId: string,
  ): Promise<SolomanConnectionTicket> {
    const url = `${this.baseUrl}/api/v1/connections/tickets/`;
    logger.info(`Acquiring host ticket for targetDeviceId: ${targetDeviceId}`);

    const payload: AcquireConnectionTicketRequest = { targetDeviceId };
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new OctopusStudioError(
        `Failed to acquire connection ticket: ${(err as Error).message}`,
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new OctopusStudioError(
        `Ticket acquisition failed (${response.status}): ${errBody}`,
        response.status === 401 || response.status === 403
          ? OctopusStudioErrorKind.Auth
          : OctopusStudioErrorKind.External,
      );
    }

    const data = (await response.json()) as { ticket: SolomanConnectionTicket };
    return data.ticket;
  }

  /**
   * Browser-Based Authentication:
   * Initiates a desktop auth session for browser login.
   * POST /api/v1/auth/desktop-session/ (with fallback)
   */
  public async startAuthSession(params: {
    name: string;
    signingPublicKey: string;
    encryptionPublicKey: string;
  }): Promise<StartAuthSessionResponse> {
    const url = `${this.baseUrl}/api/v1/auth/desktop-session/`;
    logger.info(`Starting desktop auth session at ${url}`, { name: params.name });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(params),
      });

      if (response.ok) {
        const data = (await response.json()) as StartAuthSessionResponse;
        if (data.sessionId && data.authUrl) {
          return data;
        }
      }
    } catch {
      // Endpoint might not exist on local dev or mock, use standard web login URL
    }

    const sessionId =
      "sol_sess_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const search = new URLSearchParams({
      session_id: sessionId,
      name: params.name,
      signing_key: params.signingPublicKey,
      encryption_key: params.encryptionPublicKey,
    });
    const authUrl = `${this.baseUrl}/auth/desktop-login?${search.toString()}`;

    return { sessionId, authUrl };
  }

  /**
   * Browser-Based Authentication:
   * Checks whether the user has completed login in the browser.
   * GET /api/v1/auth/desktop-session/?session_id=${sessionId}
   */
  public async checkAuthSession(sessionId: string): Promise<CheckAuthSessionResponse> {
    const url = `${this.baseUrl}/api/v1/auth/desktop-session/?session_id=${encodeURIComponent(sessionId)}`;
    logger.info(`Checking desktop auth session at ${url}`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as CheckAuthSessionResponse;
        return data;
      }
    } catch {
      // Network or mock failure, return pending
    }

    return { status: "pending" };
  }
}
