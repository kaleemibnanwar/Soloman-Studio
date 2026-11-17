import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import http from "node:http";
import log from "electron-log";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { broadcastToAllWindows } from "@/ipc/utils/window_broadcast";
import { publishQueryInvalidations } from "@/ipc/utils/query_invalidation_delivery";
import { hitlEvents, type ApprovalPendingBroadcast } from "@/ipc/agent/hitl_interceptor";
import { ControlPlaneClient } from "./control_plane_client";
import { E2EESessionManager } from "./e2ee_session_manager";
import { SolomanKeyStore } from "./keystore";
import { LocalEngine } from "./local_engine";
import { RelayClient } from "./relay_client";
import type {
  ApplicationMessage,
  ChatResponseEndStream,
  DeviceConnectionGrant,
  RegisterDeviceRequest,
  RelayDataFrame,
  SolomanDevice,
  SolomanHostStatus,
  SolomanPairing,
  StartAuthSessionResponse,
} from "./types";

const logger = log.scope("soloman-bridge");

export interface SolomanBridgeOptions {
  keyStore?: SolomanKeyStore;
  controlPlaneClient?: ControlPlaneClient;
  relayClient?: RelayClient;
  sessionManager?: E2EESessionManager;
  localEngine?: LocalEngine;
}

export class SolomanBridge extends EventEmitter {
  public readonly keyStore: SolomanKeyStore;
  public readonly controlPlaneClient: ControlPlaneClient;
  public readonly relayClient: RelayClient;
  public readonly sessionManager: E2EESessionManager;
  public readonly localEngine: LocalEngine;

  private pairingPollTimer: NodeJS.Timeout | null = null;
  private pendingPairingsCache: SolomanPairing[] = [];
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;
  private isAutoReconnectScheduled = false;
  private loopbackServer: http.Server | null = null;
  private readonly activeMobileRoutes = new Map<string, string>();
  private readonly pendingApprovalBroadcasts = new Map<string, ApprovalPendingBroadcast>();
  private readonly onHitlApprovalPending = (payload: ApprovalPendingBroadcast) => {
    void this.broadcastApprovalPending(payload);
  };

  constructor(options?: SolomanBridgeOptions) {
    super();
    this.keyStore = options?.keyStore ?? new SolomanKeyStore();
    this.controlPlaneClient =
      options?.controlPlaneClient ?? new ControlPlaneClient(this.keyStore.getCloudUrl());
    this.relayClient = options?.relayClient ?? new RelayClient();
    this.sessionManager = options?.sessionManager ?? new E2EESessionManager();
    this.localEngine =
      options?.localEngine ?? new LocalEngine(this.keyStore.getDeviceId() ?? "desktop_host");

    this.setupRelayListeners();
    hitlEvents.on("approval_pending", this.onHitlApprovalPending);
  }

  private async broadcastApprovalPending(payload: ApprovalPendingBroadcast): Promise<void> {
    const message: ApplicationMessage = {
      protocolVersion: 1,
      kind: "event",
      messageId: randomUUID(),
      messageType: "approval.pending",
      sentAt: new Date().toISOString(),
      payload,
    };
    const routes = [...this.activeMobileRoutes.entries()];
    if (routes.length === 0) {
      this.pendingApprovalBroadcasts.set(payload.approvalId, payload);
      logger.info(`Approval ${payload.approvalId} is pending with no active mobile session`);
      return;
    }
    const results = await Promise.allSettled(
      routes.map(async ([sessionId, peerDeviceId]) => {
        const outbound = this.sessionManager.encryptOutboundMessage(
          sessionId,
          peerDeviceId,
          message,
          new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        );
        await this.relayClient.sendDataFrame(outbound);
      }),
    );
    if (results.some((result) => result.status === "fulfilled")) {
      this.pendingApprovalBroadcasts.delete(payload.approvalId);
    } else {
      this.pendingApprovalBroadcasts.set(payload.approvalId, payload);
    }
  }

  public closeLoopbackServer(): void {
    if (this.loopbackServer) {
      try {
        this.loopbackServer.close();
      } catch (err) {
        logger.warn("Error closing Soloman loopback server", err);
      }
      this.loopbackServer = null;
    }
  }

  private setupRelayListeners(): void {
    this.relayClient.on("ready", (frame) => {
      logger.info("Soloman Relay connection established & ready", frame);
      this.lastConnectedAt = new Date().toISOString();
      this.lastError = null;
      this.emitStatusChanged();
    });

    this.relayClient.on("disconnected", (reason) => {
      logger.info(`Soloman Relay disconnected: ${reason}`);
      this.emitStatusChanged();
      this.maybeAutoReconnect();
    });

    this.relayClient.on("error", (err) => {
      logger.error("Soloman Relay error", err);
      this.lastError = err.message;
      this.emitStatusChanged();
    });

    this.relayClient.on("data", async (frame: RelayDataFrame) => {
      await this.handleInboundRelayDataFrame(frame);
    });
  }

  /**
   * Option A: Browser-Based Login (Standard Flow)
   * 1. Starts a temporary local loopback server on http://127.0.0.1:42100/callback.
   * 2. Opens system browser to https://soloman.si/auth/device-login/?redirect_uri=...
   * 3. Loopback server captures userAccessToken (sol_usr_...) and registers the desktop host.
   */
  public async startBrowserLogin(
    deviceName?: string,
    cloudUrl?: string,
  ): Promise<StartAuthSessionResponse> {
    this.keyStore.ensureInitialized();

    if (cloudUrl) {
      this.keyStore.setCloudUrl(cloudUrl);
      this.controlPlaneClient.setBaseUrl(cloudUrl);
    }
    if (deviceName) {
      this.keyStore.setDeviceName(deviceName);
    }

    this.closeLoopbackServer();

    const loopbackPort = 42100;
    const loopbackCallbackUrl = `http://127.0.0.1:${loopbackPort}/callback`;
    const state = "studio_auth_" + Math.random().toString(36).substring(2, 10);

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", `http://127.0.0.1:${loopbackPort}`);
        if (reqUrl.pathname === "/callback") {
          const token =
            reqUrl.searchParams.get("token") || reqUrl.searchParams.get("userAccessToken");
          const errParam = reqUrl.searchParams.get("error");

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Octopus Studio Authentication</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 14px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 16px 32px rgba(0,0,0,0.4); }
    h1 { color: #38bdf8; font-size: 20px; margin: 0 0 10px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${errParam ? "Authentication Error" : "Authentication Successful"}</h1>
    <p>${errParam ? errParam : "You are now logged in to Soloman. You can close this window and return to Octopus Studio."}</p>
  </div>
</body>
</html>`);

          this.closeLoopbackServer();

          if (token) {
            try {
              await this.completeLoginWithUserToken(token, deviceName, cloudUrl);
            } catch (authErr) {
              logger.error("Failed to complete device registration with user token", authErr);
              this.lastError = (authErr as Error).message;
              this.emitStatusChanged();
            }
          }
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      } catch (handlerErr) {
        logger.error("Error handling loopback callback", handlerErr);
      }
    });

    server.on("error", (err) => {
      logger.warn("Soloman loopback server error", err);
      this.closeLoopbackServer();
    });

    server.listen(loopbackPort, "127.0.0.1", () => {
      logger.info(`Soloman loopback server listening on 127.0.0.1:${loopbackPort}`);
    });
    this.loopbackServer = server;

    const targetBaseUrl = (cloudUrl ?? this.keyStore.getCloudUrl() ?? "https://soloman.si").replace(
      /\/+$/,
      "",
    );
    const authUrl = `${targetBaseUrl}/auth/device-login/?redirect_uri=${encodeURIComponent(
      loopbackCallbackUrl,
    )}&state=${encodeURIComponent(state)}`;

    return {
      sessionId: state,
      authUrl,
    };
  }

  /**
   * Option B: Direct In-App Login (Headless / CLI / Terminal)
   * POST /api/v1/auth/login/
   */
  public async directLogin(
    username: string,
    password: string,
    deviceName?: string,
    cloudUrl?: string,
  ): Promise<SolomanHostStatus> {
    this.keyStore.ensureInitialized();
    if (cloudUrl) {
      this.keyStore.setCloudUrl(cloudUrl);
      this.controlPlaneClient.setBaseUrl(cloudUrl);
    }
    if (deviceName) {
      this.keyStore.setDeviceName(deviceName);
    }

    const loginResp = await this.controlPlaneClient.directLogin({ username, password });
    const token = loginResp.userAccessToken || loginResp.token!;
    const userEmail = loginResp.user?.email || loginResp.user?.username;

    return await this.completeLoginWithUserToken(token, deviceName, cloudUrl, userEmail);
  }

  /**
   * Completes device registration on Soloman platform using user access token
   * Step 2 & Step 3 of integration guide
   */
  public async completeLoginWithUserToken(
    userAccessToken: string,
    deviceName?: string,
    cloudUrl?: string,
    accountEmail?: string,
  ): Promise<SolomanHostStatus> {
    this.keyStore.ensureInitialized();

    if (cloudUrl) {
      this.keyStore.setCloudUrl(cloudUrl);
      this.controlPlaneClient.setBaseUrl(cloudUrl);
    }
    if (deviceName) {
      this.keyStore.setDeviceName(deviceName);
    }

    const name = this.keyStore.getDeviceName();
    const identityKeys = this.keyStore.getIdentityKeys();

    const regPayload: RegisterDeviceRequest = {
      name,
      deviceType: "desktop",
      signingPublicKey: identityKeys.signingPublicKey,
      encryptionPublicKey: identityKeys.encryptionPublicKey,
      protocolVersion: 1,
    };

    logger.info("Registering desktop device with Soloman platform using userAccessToken", { name });
    const regResp = await this.controlPlaneClient.registerDevice(regPayload, userAccessToken);

    return await this.loginWithDevice(regResp.device, regResp.deviceAccessToken, accountEmail);
  }

  /**
   * Checks whether the user has completed login in the browser.
   */
  public async checkLoginSession(
    sessionId: string,
  ): Promise<{ completed: boolean; status: SolomanHostStatus }> {
    if (this.keyStore.isEnrolled()) {
      return { completed: true, status: this.getStatus() };
    }
    const check = await this.controlPlaneClient.checkAuthSession(sessionId);
    if (check.status === "completed" && check.device && check.deviceAccessToken) {
      await this.loginWithDevice(check.device, check.deviceAccessToken, check.user?.email);
      return { completed: true, status: this.getStatus() };
    }
    return { completed: false, status: this.getStatus() };
  }

  /**
   * Completes device enrollment & logins using received device credentials
   */
  public async loginWithDevice(
    device: SolomanDevice,
    deviceAccessToken: string,
    accountEmail?: string,
  ): Promise<SolomanHostStatus> {
    this.keyStore.ensureInitialized();
    this.keyStore.saveEnrolledDevice(device, deviceAccessToken);
    if (accountEmail) {
      this.keyStore.setAccountEmail(accountEmail);
    }
    this.localEngine.setHostDeviceId(device.deviceId);
    this.lastError = null;

    // Start background tasks
    this.startPairingPollLoop();
    void this.connectRelay();

    this.emitStatusChanged();
    return this.getStatus();
  }

  /**
   * Quick test / offline simulation: simulates a completed web browser login
   */
  public async simulateBrowserLogin(
    email = "user@example.com",
    deviceName?: string,
  ): Promise<SolomanHostStatus> {
    this.keyStore.ensureInitialized();
    if (deviceName) {
      this.keyStore.setDeviceName(deviceName);
    }
    const name = this.keyStore.getDeviceName();
    const identityKeys = this.keyStore.getIdentityKeys();

    const mockDevice: SolomanDevice = {
      deviceId: "desk_" + Math.random().toString(36).substring(2, 10),
      name,
      deviceType: "desktop",
      publicKey: identityKeys.encryptionPublicKey,
      signingPublicKey: identityKeys.signingPublicKey,
      encryptionPublicKey: identityKeys.encryptionPublicKey,
      protocolVersion: 1,
      revokedAt: null,
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const mockToken = "sol_v1_dev_sim_" + Math.random().toString(36).substring(2, 16);

    return this.loginWithDevice(mockDevice, mockToken, email);
  }

  /**
   * Logs out of Soloman Cloud: disconnects relay, clears stored credentials
   */
  public async logout(): Promise<void> {
    this.closeLoopbackServer();
    this.stopPairingPollLoop();
    this.relayClient.disconnect("User logged out");
    this.keyStore.resetRegistration();
    this.lastError = null;
    this.emitStatusChanged();
  }

  /**
   * Step 1: Device Registration & Enrollment
   * When Octopus Studio registers as a host using an enrollmentCode
   */
  public async enrollDevice(
    enrollmentCode?: string,
    deviceName?: string,
    cloudUrl?: string,
  ): Promise<SolomanHostStatus> {
    this.keyStore.ensureInitialized();

    if (cloudUrl) {
      this.keyStore.setCloudUrl(cloudUrl);
      this.controlPlaneClient.setBaseUrl(cloudUrl);
    }
    if (deviceName) {
      this.keyStore.setDeviceName(deviceName);
    }

    const name = this.keyStore.getDeviceName();
    const identityKeys = this.keyStore.getIdentityKeys();

    const regPayload: RegisterDeviceRequest = {
      name,
      deviceType: "desktop",
      signingPublicKey: identityKeys.signingPublicKey,
      encryptionPublicKey: identityKeys.encryptionPublicKey,
      protocolVersion: 1,
      enrollmentCode,
    };

    logger.info("Enrolling desktop host with Soloman control plane", { name });
    try {
      const regResp = await this.controlPlaneClient.registerDevice(regPayload);
      return await this.loginWithDevice(regResp.device, regResp.deviceAccessToken);
    } catch (err) {
      this.lastError = (err as Error).message;
      this.emitStatusChanged();
      throw err;
    }
  }

  /**
   * Step 2: Periodic check for pending inbound pairing requests
   * GET /api/v1/pairings/?status=pending
   */
  public async pollPendingPairings(): Promise<SolomanPairing[]> {
    if (!this.keyStore.isEnrolled()) {
      return [];
    }

    const accessToken = this.keyStore.getDeviceAccessToken();
    if (!accessToken) {
      return [];
    }

    try {
      const pairings = await this.controlPlaneClient.listPendingPairings(accessToken);
      const prevIds = new Set(this.pendingPairingsCache.map((p) => p.pairingId));
      this.pendingPairingsCache = pairings;

      // Look for newly arrived pairings to broadcast / alert
      for (const pairing of pairings) {
        if (!prevIds.has(pairing.pairingId)) {
          logger.info(
            `Inbound pairing request from ${pairing.controllerDevice.name} (${pairing.controllerDevice.deviceId})`,
          );
          this.emit("pairing-requested", pairing);
          broadcastToAllWindows("soloman:pairing-requested", pairing);
        }
      }

      this.emitStatusChanged();
      return pairings;
    } catch (err) {
      logger.warn("Failed to poll pending pairings", err);
      return this.pendingPairingsCache;
    }
  }

  /**
   * Step 2: Inbound Pairing Approval
   * POST /api/v1/pairings/{pairingId}/approve/
   */
  public async approvePairing(
    pairingId: string,
    verificationCode: string,
  ): Promise<DeviceConnectionGrant> {
    if (!this.keyStore.isEnrolled()) {
      throw new OctopusStudioError(
        "Host device is not registered with Soloman Cloud",
        OctopusStudioErrorKind.Precondition,
      );
    }

    const accessToken = this.keyStore.getDeviceAccessToken()!;
    const resp = await this.controlPlaneClient.approvePairing(
      accessToken,
      pairingId,
      verificationCode,
    );

    // Save grant to keyStore
    this.keyStore.addOrUpdateGrant(resp.grant);

    // Remove from pending pairings cache
    this.pendingPairingsCache = this.pendingPairingsCache.filter((p) => p.pairingId !== pairingId);

    logger.info(`Pairing approved! Active grant: ${resp.grant.grantId}`);
    this.emitStatusChanged();
    return resp.grant;
  }

  /**
   * Step 3 & 4: Acquire ticket and connect to relay WebSocket
   */
  public async connectRelay(): Promise<void> {
    if (!this.keyStore.isEnrolled()) {
      logger.info("Cannot connect relay: Device is not enrolled");
      return;
    }

    const deviceId = this.keyStore.getDeviceId()!;
    const accessToken = this.keyStore.getDeviceAccessToken()!;

    try {
      logger.info(`Acquiring host connection ticket for ${deviceId}`);
      const ticket = await this.controlPlaneClient.acquireHostTicket(accessToken, deviceId);

      logger.info(`Connecting to relay WebSocket: ${ticket.webSocketUrl}`);
      try {
        await this.relayClient.connect(ticket.webSocketUrl);
      } catch (webSocketError) {
        logger.warn("WebSocket relay unavailable; activating HTTP fallback", webSocketError);
        await this.relayClient.connectHttp({
          baseUrl: this.controlPlaneClient.getBaseUrl(),
          accessToken,
          deviceId,
        });
      }
      this.lastError = null;
      this.emitStatusChanged();
    } catch (err) {
      this.lastError = (err as Error).message;
      logger.error("Failed to connect to relay", err);
      this.emitStatusChanged();
      this.maybeAutoReconnect();
      throw err;
    }
  }

  public disconnectRelay(): void {
    this.relayClient.disconnect("User disconnected");
    this.emitStatusChanged();
  }

  private maybeAutoReconnect(): void {
    if (this.isAutoReconnectScheduled || !this.keyStore.isEnrolled()) {
      return;
    }

    this.isAutoReconnectScheduled = true;
    setTimeout(() => {
      this.isAutoReconnectScheduled = false;
      if (this.keyStore.isEnrolled() && !this.relayClient.isConnected()) {
        logger.info("Attempting auto-reconnect to Soloman relay...");
        void this.connectRelay().catch((err) => {
          logger.warn("Auto-reconnect failed", err);
        });
      }
    }, 10_000);
  }

  /**
   * Step 5: Handling Inbound Data Frames -> Decrypt -> LocalEngine -> Stream Encrypted Chunks
   */
  public async handleInboundRelayDataFrame(frame: RelayDataFrame): Promise<void> {
    const sourceDeviceId = frame.sourceDeviceId;
    if (!sourceDeviceId) {
      logger.warn("Dropped relay data frame: missing sourceDeviceId");
      return;
    }

    // Auto-trust account devices: if user is logged into their account,
    // ensure active grant exists so manual pairing approvals are never needed
    if (
      this.keyStore.isAutoTrustAccountDevices() &&
      this.keyStore.isEnrolled() &&
      !this.keyStore
        .getGrants()
        .some((g) => g.controllerDeviceId === sourceDeviceId && g.status === "active")
    ) {
      this.keyStore.addOrUpdateGrant({
        grantId: `grant_auto_${sourceDeviceId}`,
        controllerDeviceId: sourceDeviceId,
        hostDeviceId: this.keyStore.getDeviceId() ?? "desktop_host",
        status: "active",
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      });
    }

    try {
      if (!this.sessionManager.getSession(frame.sessionId) && frame.sourceEncryptionPublicKey) {
        this.sessionManager.deriveAndRegisterSession(
          frame.sessionId,
          sourceDeviceId,
          frame.sourceEncryptionPublicKey,
          this.keyStore.getIdentityKeys().encryptionPrivateKey,
        );
      }
      // Step 5.3: Decrypt ciphertext with derived session key (verifies pairing grant)
      const decryptedMsg = this.sessionManager.decryptInboundFrame(frame, this.keyStore);
      this.activeMobileRoutes.set(frame.sessionId, sourceDeviceId);
      if (this.pendingApprovalBroadcasts.size > 0) {
        for (const pending of this.pendingApprovalBroadcasts.values()) {
          void this.broadcastApprovalPending(pending);
        }
      }

      // Stream callback that encrypts and transmits chunks back over relay WS
      const emitStreamChunk = async (chunk: ApplicationMessage): Promise<void> => {
        const outboundFrame = this.sessionManager.encryptOutboundMessage(
          frame.sessionId,
          sourceDeviceId,
          chunk,
        );

        logger.info(
          `Sending encrypted stream chunk: seq=${outboundFrame.sequence}, type=${chunk.messageType}`,
        );

        // A tool failure must not tear down the mobile stream. Relay delivery
        // is retried with the same packet id so the receiver can de-duplicate
        // it while the desktop keeps producing the remaining output.
        const maxAttempts = 3;
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const ack = await this.relayClient.sendDataFrame(outboundFrame);
            logger.debug(`Relay confirmed delivery of stream chunk: status=${ack.status}`);
            return;
          } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) break;
            const delayMs = 250 * 2 ** (attempt - 1);
            logger.warn(
              `Relay stream delivery failed; retrying ${attempt}/${maxAttempts - 1} in ${delayMs}ms`,
              error,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      };

      // Step 5.4: Feed prompt into local agent runtime
      let immediateResp: ApplicationMessage | null = null;
      try {
        immediateResp = await this.localEngine.handleMessage(decryptedMsg, emitStreamChunk);
      } catch (engineErr) {
        if (decryptedMsg.messageType === "chat.prompt") {
          const errMessage = engineErr instanceof Error ? engineErr.message : String(engineErr);
          const errorEndMsg: ChatResponseEndStream = {
            protocolVersion: 1,
            kind: "stream",
            messageId: randomUUID(),
            correlationId: decryptedMsg.messageId,
            messageType: "chat.response.end",
            sentAt: new Date().toISOString(),
            payload: {
              turnId: `turn_${Date.now()}`,
              finishReason: "error",
              error: errMessage,
            },
          };
          await emitStreamChunk(errorEndMsg).catch((sendErr) => {
            logger.warn("Failed to emit chat.response.end error frame:", sendErr);
          });
        }
        throw engineErr;
      }

      if (immediateResp) {
        // Single response (e.g. session.ready)
        const outboundFrame = this.sessionManager.encryptOutboundMessage(
          frame.sessionId,
          sourceDeviceId,
          immediateResp,
        );
        await this.relayClient.sendDataFrame(outboundFrame);
      }
    } catch (err) {
      logger.error(`Error processing inbound relay data frame ${frame.packetId}`, err);
    }
  }

  /**
   * Pairing polling disabled: authentication and device trust are handled via account login
   */
  public startPairingPollLoop(): void {
    // No-op: pairing removed in favor of account login
  }

  public stopPairingPollLoop(): void {
    if (this.pairingPollTimer) {
      clearInterval(this.pairingPollTimer);
      this.pairingPollTimer = null;
    }
  }

  public getStatus(): SolomanHostStatus {
    const grants = this.keyStore.getGrants().filter((g) => g.status === "active");
    return {
      enrolled: this.keyStore.isEnrolled(),
      deviceId: this.keyStore.getDeviceId(),
      deviceName: this.keyStore.getDeviceName(),
      cloudUrl: this.keyStore.getCloudUrl(),
      isRelayConnected: this.relayClient.isConnected(),
      activeGrantsCount: grants.length,
      pendingPairingsCount: this.pendingPairingsCache.length,
      lastConnectedAt: this.lastConnectedAt,
      lastError: this.lastError,
      accountEmail: this.keyStore.getAccountEmail(),
      autoTrustAccountDevices: this.keyStore.isAutoTrustAccountDevices(),
    };
  }

  public getPendingPairings(): SolomanPairing[] {
    return this.pendingPairingsCache;
  }

  public getGrants(): DeviceConnectionGrant[] {
    return this.keyStore.getGrants();
  }

  public revokeGrant(grantId: string): void {
    this.keyStore.revokeGrant(grantId);
    this.emitStatusChanged();
  }

  private emitStatusChanged(): void {
    const status = this.getStatus();
    this.emit("status-changed", status);
    broadcastToAllWindows("soloman:status-changed", status);
    publishQueryInvalidations([{ family: "soloman-bridge" }]);
  }

  public dispose(): void {
    this.closeLoopbackServer();
    this.stopPairingPollLoop();
    this.relayClient.disconnect("Bridge disposed");
    hitlEvents.off("approval_pending", this.onHitlApprovalPending);
    this.activeMobileRoutes.clear();
    this.removeAllListeners();
  }
}

// Singleton bridge instance
export const solomanBridge = new SolomanBridge();
