import { randomUUID } from "node:crypto";
import log from "electron-log";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { decryptPayload, deriveSessionKey, encryptPayload } from "./crypto";
import type { SolomanKeyStore } from "./keystore";
import type { ApplicationMessage, RelayDataFrame } from "./types";

const logger = log.scope("soloman-e2ee");

export interface SessionState {
  sessionId: string;
  peerDeviceId: string;
  sessionKey: Buffer;
  outboundSequence: number;
  inboundSequence: number;
  createdAt: string;
  lastActiveAt: string;
}

export class E2EESessionManager {
  private sessions = new Map<string, SessionState>();

  /**
   * Registers or updates an active session with a known session key
   */
  public registerSession(
    sessionId: string,
    sessionKey: Buffer,
    peerDeviceId: string,
  ): SessionState {
    const session: SessionState = {
      sessionId,
      peerDeviceId,
      sessionKey,
      outboundSequence: 0,
      inboundSequence: 0,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    logger.info(`Registered E2EE session ${sessionId} for peer ${peerDeviceId}`);
    return session;
  }

  /**
   * Derives session key using host private key and peer public key, then registers the session
   */
  public deriveAndRegisterSession(
    sessionId: string,
    peerDeviceId: string,
    peerPublicKey: string,
    hostPrivateKey: string,
  ): SessionState {
    const sessionKey = deriveSessionKey(hostPrivateKey, peerPublicKey);
    return this.registerSession(sessionId, sessionKey, peerDeviceId);
  }

  public getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Invariant 3 & Step 5:
   * 1. Verifies that the sourceDeviceId has an active grant approved by the user
   * 2. Decrypts ciphertext with derived session key
   */
  public decryptInboundFrame(frame: RelayDataFrame, keyStore: SolomanKeyStore): ApplicationMessage {
    const sourceDeviceId = frame.sourceDeviceId;
    if (!sourceDeviceId) {
      throw new OctopusStudioError(
        "Inbound frame missing sourceDeviceId",
        OctopusStudioErrorKind.Validation,
      );
    }

    // Invariant 3: Explicit Pairing Grants
    const isAllowed = keyStore.isControllerAllowed(sourceDeviceId);
    if (!isAllowed) {
      logger.warn(
        `Rejected relay data frame from unapproved or expired controller: ${sourceDeviceId}`,
      );
      throw new OctopusStudioError(
        `Controller device ${sourceDeviceId} does not have an active approved grant.`,
        OctopusStudioErrorKind.Auth,
      );
    }

    let session = this.sessions.get(frame.sessionId);
    if (!session) {
      // If session not pre-registered, try deriving key if identity key is available
      // or if peer public key can be resolved from grants or peer hello
      logger.warn(`Session ${frame.sessionId} not found in memory`);
      throw new OctopusStudioError(
        `Active E2EE session not found for sessionId: ${frame.sessionId}`,
        OctopusStudioErrorKind.Precondition,
      );
    }

    session.lastActiveAt = new Date().toISOString();
    session.inboundSequence = frame.sequence;

    try {
      const decrypted = decryptPayload<ApplicationMessage>(frame.ciphertext, session.sessionKey);
      return decrypted;
    } catch (err) {
      logger.error(`Failed to decrypt inbound frame for session ${frame.sessionId}`, err);
      throw new OctopusStudioError(
        `E2EE decryption failed: ${(err as Error).message}`,
        OctopusStudioErrorKind.Validation,
        { cause: err },
      );
    }
  }

  /**
   * Encrypts an outbound application message into a RelayDataFrame
   */
  public encryptOutboundMessage(
    sessionId: string,
    targetDeviceId: string,
    message: ApplicationMessage,
    expiresAt?: string,
  ): RelayDataFrame {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new OctopusStudioError(
        `Cannot encrypt message: session ${sessionId} not found`,
        OctopusStudioErrorKind.Precondition,
      );
    }

    session.outboundSequence += 1;
    session.lastActiveAt = new Date().toISOString();

    const ciphertext = encryptPayload(message, session.sessionKey);
    const packetId = randomUUID();

    // Default expiration 2 minutes if not specified
    const expiry = expiresAt ?? new Date(Date.now() + 2 * 60 * 1000).toISOString();

    return {
      type: "data",
      packetId,
      targetDeviceId,
      sessionId,
      sequence: session.outboundSequence,
      expiresAt: expiry,
      ciphertext,
    };
  }

  /**
   * Cleans up expired sessions
   */
  public pruneInactiveSessions(maxAgeMs = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      const lastActive = new Date(session.lastActiveAt).getTime();
      if (now - lastActive > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }
}
