/**
 * Octopus Studio (Desktop Host) - Soloman Cloud Relay Types
 * Defines the schemas and types for Control Plane, Relay WebSocket, and E2EE.
 */

export type DeviceType = "desktop" | "mobile" | "web";

export interface SolomanDevice {
  deviceId: string;
  name: string;
  deviceType: DeviceType;
  publicKey?: string;
  signingPublicKey?: string;
  encryptionPublicKey: string;
  protocolVersion: number;
  revokedAt: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface RegisterDeviceRequest {
  name: string;
  deviceType: "desktop";
  signingPublicKey: string;
  encryptionPublicKey: string;
  protocolVersion: number;
  enrollmentCode?: string;
}

export interface DirectLoginRequest {
  username: string;
  password: string;
}

export interface DirectLoginResponse {
  userAccessToken?: string;
  token?: string;
  user?: {
    userId?: number | string;
    id?: number | string;
    username?: string;
    email?: string;
  };
}

export interface RegisterDeviceResponse {
  device: SolomanDevice;
  deviceAccessToken: string;
  tokenNotice: string;
}

export interface SolomanPairingDeviceSummary {
  deviceId: string;
  name: string;
  deviceType: DeviceType;
}

export interface SolomanPairing {
  pairingId: string;
  controllerDevice: SolomanPairingDeviceSummary;
  hostDevice: SolomanPairingDeviceSummary;
  status: "pending" | "approved" | "rejected" | "expired";
  expiresAt: string;
  approvedAt: string | null;
  createdAt: string;
}

export interface DeviceConnectionGrant {
  grantId: string;
  controllerDeviceId: string;
  hostDeviceId: string;
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApprovePairingRequest {
  verificationCode: string;
}

export interface ApprovePairingResponse {
  pairing: {
    pairingId: string;
    status: "approved";
    approvedAt: string;
  };
  grant: DeviceConnectionGrant;
}

export interface AcquireConnectionTicketRequest {
  targetDeviceId: string;
}

export interface SolomanConnectionTicket {
  ticketId: string;
  role: "host" | "client";
  sourceDeviceId: string;
  targetDeviceId: string;
  expiresAt: string;
  webSocketUrl: string;
}

// =============================================================================
// WebSocket Relay Frame Types
// =============================================================================

export interface RelayReadyFrame {
  type: "ready";
  relayProtocolVersion: number;
  deviceId: string;
  role: "host" | "client" | string;
  peerDeviceId: string;
}

export interface RelayPingFrame {
  type: "ping";
}

export interface RelayPongFrame {
  type: "pong";
}

export interface RelayDataFrame {
  type: "data";
  packetId: string;
  sourceDeviceId?: string;
  sourceEncryptionPublicKey?: string;
  targetDeviceId: string;
  sessionId: string;
  sequence: number;
  expiresAt?: string;
  ciphertext: string;
}

export interface RelayAckFrame {
  type: "ack";
  packetId: string;
  status: "delivered" | "queued" | "failed";
  connectionCount?: number;
}

export type RelayFrame =
  | RelayReadyFrame
  | RelayPingFrame
  | RelayPongFrame
  | RelayDataFrame
  | RelayAckFrame;

// =============================================================================
// Application E2EE Decrypted Messages
// =============================================================================

export interface ApplicationBaseMessage {
  protocolVersion: 1;
  kind: "request" | "response" | "stream" | "event";
  messageId: string;
  correlationId?: string | null;
  idempotencyKey?: string;
  messageType: string;
  sentAt: string;
}

export interface ChatPromptPayload {
  workspaceId: string;
  chatId: string;
  prompt: string;
  model?: string;
  mode?: "agent" | "ask" | "plan";
  includePlannerTasks?: boolean;
}

export interface ChatPromptRequest extends ApplicationBaseMessage {
  kind: "request";
  messageType: "chat.prompt";
  payload: ChatPromptPayload;
}

export interface ChatResponseChunkPayload {
  turnId: string;
  delta?: string;
  /** Authoritative response text, used when Studio rewrites a streaming tail. */
  text?: string;
}

export interface ChatResponseChunkStream extends ApplicationBaseMessage {
  kind: "stream";
  correlationId: string;
  messageType: "chat.response.chunk";
  payload: ChatResponseChunkPayload;
}

export interface ChatResponseEndPayload {
  turnId: string;
  finishReason?: string;
  error?: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatResponseEndStream extends ApplicationBaseMessage {
  kind: "stream";
  correlationId: string;
  messageType: "chat.response.end";
  payload: ChatResponseEndPayload;
}

export interface DesktopSnapshotRequest extends ApplicationBaseMessage {
  kind: "request";
  messageType: "desktop.snapshot.request";
  payload: Record<string, never>;
}

export interface ChatHistoryRequest extends ApplicationBaseMessage {
  kind: "request";
  messageType: "chat.history.request";
  payload: { chatId: string; beforeMessageId?: number; limit?: number };
}

export interface ChatCreateRequest extends ApplicationBaseMessage {
  kind: "request";
  messageType: "chat.create.request";
  payload: { workspaceId: string; title?: string; mode?: "agent" | "ask" | "plan" };
}

export interface SessionHelloPayload {
  clientPublicKey?: string;
  sessionId?: string;
}

export interface SessionHelloRequest extends ApplicationBaseMessage {
  kind: "request";
  messageType: "session.hello";
  payload: SessionHelloPayload;
}

export interface SessionReadyPayload {
  status: "ready";
  hostDeviceId: string;
}

export interface SessionReadyResponse extends ApplicationBaseMessage {
  kind: "response";
  correlationId: string;
  messageType: "session.ready";
  payload: SessionReadyPayload;
}

export type ApplicationMessage =
  | ChatPromptRequest
  | ChatResponseChunkStream
  | ChatResponseEndStream
  | SessionHelloRequest
  | SessionReadyResponse
  | (ApplicationBaseMessage & { payload: unknown });

// =============================================================================
// Browser Auth Session Types
// =============================================================================

export interface StartAuthSessionResponse {
  sessionId: string;
  authUrl: string;
}

export interface CheckAuthSessionResponse {
  status: "pending" | "completed" | "expired";
  device?: SolomanDevice;
  deviceAccessToken?: string;
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
}

// =============================================================================
// Host Status
// =============================================================================

export interface SolomanHostStatus {
  enrolled: boolean;
  deviceId: string | null;
  deviceName: string | null;
  cloudUrl: string;
  isRelayConnected: boolean;
  activeGrantsCount: number;
  pendingPairingsCount: number;
  lastConnectedAt: string | null;
  lastError: string | null;
  accountEmail?: string | null;
  autoTrustAccountDevices?: boolean;
}
