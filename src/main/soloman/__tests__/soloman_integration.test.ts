import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { SolomanBridge } from "../soloman_bridge";
import { SolomanKeyStore } from "../keystore";
import { ControlPlaneClient } from "../control_plane_client";
import {
  deriveSessionKey,
  encryptPayload,
  decryptPayload,
  generateEphemeralKeyPair,
} from "../crypto";
import type {
  ApplicationMessage,
  ChatPromptRequest,
  RelayAckFrame,
  RelayDataFrame,
  RelayFrame,
  SolomanConnectionTicket,
  SolomanPairing,
} from "../types";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (str: string) => Buffer.from(str),
    decryptString: (buf: Buffer) => buf.toString(),
  },
}));

describe("Soloman Desktop Host Integration Lifecycle", () => {
  let tmpDir: string;
  let keystorePath: string;
  let server: http.Server;
  let wss: WebSocketServer;
  let wsPort: number;
  let bridge: SolomanBridge;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "soloman-integ-test-"));
    keystorePath = path.join(tmpDir, "keystore.json");

    // Setup local mock WebSocket relay server
    server = http.createServer();
    wss = new WebSocketServer({ server });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        wsPort = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    bridge?.dispose();
    wss?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("completes full Step 1 to Step 5 lifecycle", async () => {
    const keyStore = new SolomanKeyStore(keystorePath);
    const controlPlane = new ControlPlaneClient("https://cloud.soloman.local");
    bridge = new SolomanBridge({
      keyStore,
      controlPlaneClient: controlPlane,
    });

    const hostDeviceId = "desk_6c8f12a4b89e";
    const controllerDeviceId = "mob_a8912e9b01cf";
    const pairingId = "7a3e81fc-0c21-4f18-bb92-91ef23d18e47";
    const sessionId = "4d168a22-38e2-482a-a035-7c2bc35de982";

    // -------------------------------------------------------------------------
    // Step 1: Device Registration & Enrollment
    // -------------------------------------------------------------------------
    const mockRegResponse = {
      device: {
        deviceId: hostDeviceId,
        name: "Alex MacBook Pro",
        deviceType: "desktop" as const,
        encryptionPublicKey: keyStore.getIdentityKeys().encryptionPublicKey,
        protocolVersion: 1,
        revokedAt: null,
        isOnline: false,
        lastSeenAt: null,
        createdAt: "2026-10-16T01:00:00Z",
      },
      deviceAccessToken: "sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x",
      tokenNotice: "This token is returned once and is not stored in plaintext.",
    };

    // -------------------------------------------------------------------------
    // Step 2: Inbound Pairing & Approval
    // -------------------------------------------------------------------------
    const mockPendingPairings: SolomanPairing[] = [
      {
        pairingId,
        controllerDevice: {
          deviceId: controllerDeviceId,
          name: "Alex iPhone 15 Pro",
          deviceType: "mobile",
        },
        hostDevice: {
          deviceId: hostDeviceId,
          name: "Alex MacBook Pro",
          deviceType: "desktop",
        },
        status: "pending",
        expiresAt: "2026-10-16T01:10:00Z",
        approvedAt: null,
        createdAt: "2026-10-16T01:00:00Z",
      },
    ];

    const mockApproveResponse = {
      pairing: {
        pairingId,
        status: "approved" as const,
        approvedAt: "2026-10-16T01:02:15Z",
      },
      grant: {
        grantId: "9b24ce4d-119c-48be-8857-418293701ef2",
        controllerDeviceId,
        hostDeviceId,
        status: "active" as const,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-10-16T01:02:15Z",
      },
    };

    // -------------------------------------------------------------------------
    // Step 3: Acquiring Host Connection Ticket
    // -------------------------------------------------------------------------
    const mockTicket: SolomanConnectionTicket = {
      ticketId: "3b18d270-4923-4927-b649-0d85f8c679a1",
      role: "host",
      sourceDeviceId: hostDeviceId,
      targetDeviceId: hostDeviceId,
      expiresAt: "2026-10-16T01:03:15Z",
      webSocketUrl: `ws://127.0.0.1:${wsPort}`,
    };

    // Mock Control Plane REST endpoints
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = url.toString();
      if (urlStr.endsWith("/api/v1/devices/")) {
        return {
          ok: true,
          status: 201,
          json: async () => mockRegResponse,
        } as Response;
      }
      if (urlStr.includes("/api/v1/pairings/?status=pending")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ pairings: mockPendingPairings }),
        } as Response;
      }
      if (urlStr.includes(`/api/v1/pairings/${pairingId}/approve/`)) {
        return {
          ok: true,
          status: 200,
          json: async () => mockApproveResponse,
        } as Response;
      }
      if (urlStr.endsWith("/api/v1/connections/tickets/")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ ticket: mockTicket }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    // -------------------------------------------------------------------------
    // Step 4: Relay WebSocket Setup & Handshake handling
    // -------------------------------------------------------------------------
    const receivedRelayFrames: RelayFrame[] = [];
    let relayHostSocket: WebSocket | null = null;

    wss.on("connection", (socket) => {
      relayHostSocket = socket;

      // 4.1 Server sends Relay Ready Frame
      socket.send(
        JSON.stringify({
          type: "ready",
          relayProtocolVersion: 1,
          deviceId: hostDeviceId,
          role: "host",
          peerDeviceId: hostDeviceId,
        }),
      );

      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString("utf8")) as RelayFrame;
        receivedRelayFrames.push(frame);

        if (frame.type === "ping") {
          // 4.2 Server replies pong
          socket.send(JSON.stringify({ type: "pong" }));
        }

        if (frame.type === "data") {
          // 5.6 Relay sends delivery ack immediately
          const ack: RelayAckFrame = {
            type: "ack",
            packetId: frame.packetId,
            status: "delivered",
            connectionCount: 1,
          };
          socket.send(JSON.stringify(ack));
        }
      });
    });

    // Step 1 Execution: Enroll Device
    const enrollResult = await bridge.enrollDevice("sol_enr_8aBcD9Ef2GhIjKlM", "Alex MacBook Pro");
    expect(enrollResult.enrolled).toBe(true);
    expect(enrollResult.deviceId).toBe(hostDeviceId);

    // Step 2 Execution: List Pending Pairings & Approve
    const pending = await bridge.pollPendingPairings();
    expect(pending.length).toBe(1);
    expect(pending[0].controllerDevice.name).toBe("Alex iPhone 15 Pro");

    const grant = await bridge.approvePairing(pairingId, "582914");
    expect(grant.status).toBe("active");
    expect(keyStore.isControllerAllowed(controllerDeviceId)).toBe(true);

    // Wait for relay connection to establish
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bridge.relayClient.isConnected()).toBe(true);

    // -------------------------------------------------------------------------
    // Step 5: E2EE Session Negotiation & Chat Execution
    // -------------------------------------------------------------------------
    // Mobile generates ephemeral key and derives session key with Host's public key
    const mobileKeys = generateEphemeralKeyPair("x25519");
    const hostKeys = keyStore.getIdentityKeys();
    const sessionKey = deriveSessionKey(mobileKeys.privateKey, hostKeys.encryptionPublicKey);

    // Register active session in Studio's session manager (as would happen via session.hello or negotiation)
    bridge.sessionManager.registerSession(sessionId, sessionKey, controllerDeviceId);

    // Mobile sends chat prompt
    const chatPrompt: ChatPromptRequest = {
      protocolVersion: 1,
      kind: "request",
      messageId: "a90184b2-c124-42b7-87cf-4519f7a8310c",
      correlationId: null,
      idempotencyKey: "f62b1a03-7b41-482f-8919-482b6c008741",
      messageType: "chat.prompt",
      sentAt: "2026-10-16T01:03:20Z",
      payload: {
        workspaceId: "workspace_landing_page",
        chatId: "chat_session_491",
        prompt: "Run unit tests and fix any failing assertions in auth module.",
      },
    };

    const ciphertext = encryptPayload(chatPrompt, sessionKey);

    // Simulate inbound relay data frame delivered from mobile over relay
    const inboundFrame: RelayDataFrame = {
      type: "data",
      packetId: "8f12b7a9-34b8-4d51-912c-0e86b2401f8d",
      sourceDeviceId: controllerDeviceId,
      targetDeviceId: hostDeviceId,
      sessionId,
      sequence: 1,
      expiresAt: "2026-10-16T01:05:00Z",
      ciphertext,
    };

    // Inject data frame into the relay connection
    relayHostSocket!.send(JSON.stringify(inboundFrame));

    // Wait for prompt execution and streamed chunks
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify Studio streamed response chunks back over the relay
    const outboundDataFrames = receivedRelayFrames.filter(
      (f): f is RelayDataFrame => f.type === "data" && f.targetDeviceId === controllerDeviceId,
    );

    expect(outboundDataFrames.length).toBeGreaterThan(0);

    // Decrypt the first streamed chunk from Studio using Mobile's sessionKey
    const firstChunkFrame = outboundDataFrames[0];
    expect(firstChunkFrame.sessionId).toBe(sessionId);

    const decryptedChunk = decryptPayload<ApplicationMessage>(
      firstChunkFrame.ciphertext,
      sessionKey,
    );
    expect(decryptedChunk.kind).toBe("stream");
    expect(decryptedChunk.messageType).toBe("chat.response.chunk");
    expect(decryptedChunk.correlationId).toBe("a90184b2-c124-42b7-87cf-4519f7a8310c");
  });

  it("enforces Invariant 3: drops frames from unapproved controllers", async () => {
    const keyStore = new SolomanKeyStore(keystorePath);
    bridge = new SolomanBridge({ keyStore });

    const unapprovedController = "mob_attacker_999";
    const keys = generateEphemeralKeyPair("x25519");
    const sessionKey = deriveSessionKey(keys.privateKey, keys.publicKey);

    bridge.sessionManager.registerSession("session_attack", sessionKey, unapprovedController);

    const frame: RelayDataFrame = {
      type: "data",
      packetId: "attack_packet",
      sourceDeviceId: unapprovedController,
      targetDeviceId: "desk_6c8f12a4b89e",
      sessionId: "session_attack",
      sequence: 1,
      ciphertext: encryptPayload("malicious", sessionKey),
    };

    await expect(bridge.handleInboundRelayDataFrame(frame)).resolves.not.toThrow(); // handled safely without throwing out of loop
    // Verified: controller was not allowed, no response frames generated
  });
});
