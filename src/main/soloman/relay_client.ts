import { EventEmitter } from "node:events";
import { WebSocket, type RawData } from "ws";
import log from "electron-log";
import type { RelayAckFrame, RelayDataFrame, RelayFrame, RelayReadyFrame } from "./types";

const logger = log.scope("soloman-relay-client");

export interface RelayClientEvents {
  ready: (frame: RelayReadyFrame) => void;
  data: (frame: RelayDataFrame) => void;
  ack: (frame: RelayAckFrame) => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
}

interface PendingAck {
  resolve: (ack: RelayAckFrame) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

const DEFAULT_PING_INTERVAL_MS = 30_000;
const DEFAULT_ACK_TIMEOUT_MS = 15_000;
const HTTP_POLL_INTERVAL_MS = 1_000;

export interface HttpRelayOptions {
  baseUrl: string;
  accessToken: string;
  deviceId: string;
}

export class RelayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pendingAcks = new Map<string, PendingAck>();
  private isConnecting = false;
  private currentUrl: string | null = null;
  private httpRelay: HttpRelayOptions | null = null;
  private httpPollTimer: NodeJS.Timeout | null = null;
  private httpPollInFlight = false;
  private connectionGeneration = 0;

  public isConnected(): boolean {
    return Boolean((this.ws && this.ws.readyState === WebSocket.OPEN) || this.httpRelay);
  }

  public getTransport(): "websocket" | "http" | null {
    if (this.ws?.readyState === WebSocket.OPEN) return "websocket";
    if (this.httpRelay) return "http";
    return null;
  }

  /**
   * Connects to the relay WebSocket URL obtained from a connection ticket
   */
  public async connect(webSocketUrl: string): Promise<RelayReadyFrame> {
    if (this.isConnected() && this.currentUrl === webSocketUrl) {
      logger.info("Relay already connected to this URL");
      return {
        type: "ready",
        relayProtocolVersion: 1,
        deviceId: "",
        role: "host",
        peerDeviceId: "",
      };
    }

    this.disconnect("Switching or reconnecting socket");
    this.currentUrl = webSocketUrl;
    this.isConnecting = true;

    return new Promise<RelayReadyFrame>((resolve, reject) => {
      let isResolved = false;
      const connectionTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.disconnect("Connection attempt timed out");
          reject(new Error("Timeout connecting to Soloman relay WebSocket"));
        }
      }, 5_000);

      try {
        let origin = "https://soloman.si";
        try {
          const u = new URL(webSocketUrl);
          origin = `${u.protocol === "wss:" ? "https:" : "http:"}//${u.host}`;
        } catch {
          // fallback
        }

        const ws = new WebSocket(webSocketUrl, "soloman.relay.v1", {
          headers: {
            Origin: origin,
            "User-Agent": "OctopusStudio-DesktopHost/1.0",
          },
        });
        this.ws = ws;

        ws.on("unexpected-response", (req, res) => {
          logger.warn(
            `Relay WebSocket unexpected HTTP response: ${res.statusCode} ${res.statusMessage}`,
            {
              headers: res.headers,
              url: webSocketUrl,
            },
          );
        });

        ws.on("open", () => {
          logger.info("Connected to Soloman relay WebSocket, awaiting ready frame");
          this.startHeartbeat();
        });

        ws.on("message", (raw: RawData) => {
          try {
            const parsed = JSON.parse(raw.toString("utf8")) as RelayFrame;
            this.handleIncomingFrame(parsed, (readyFrame) => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(connectionTimeout);
                resolve(readyFrame);
              }
            });
          } catch (err) {
            logger.warn("Malformed relay frame received", err);
          }
        });

        ws.on("close", (code, reason) => {
          logger.info(`Relay WebSocket closed (${code}): ${reason.toString()}`);
          this.cleanupSocket();
          this.emit("disconnected", reason.toString());
          if (!isResolved) {
            isResolved = true;
            clearTimeout(connectionTimeout);
            reject(new Error(`WebSocket closed before ready frame (${code})`));
          }
        });

        ws.on("error", (err) => {
          logger.error("Relay WebSocket error", err);
          this.emit("error", err);
          if (!isResolved) {
            isResolved = true;
            clearTimeout(connectionTimeout);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        reject(err as Error);
      }
    });
  }

  private handleIncomingFrame(frame: RelayFrame, onReady?: (frame: RelayReadyFrame) => void): void {
    if (frame.type === "ready") {
      logger.info(`Received ready frame: role=${frame.role}, deviceId=${frame.deviceId}`);
      this.isConnecting = false;
      this.emit("ready", frame);
      onReady?.(frame);
    } else if (frame.type === "pong") {
      // Keepalive pong received
      logger.debug("Received pong from relay");
    } else if (frame.type === "ping") {
      // Server requested ping
      this.sendRaw({ type: "pong" });
    } else if (frame.type === "ack") {
      logger.debug(`Received ack for packet ${frame.packetId}, status: ${frame.status}`);
      const pending = this.pendingAcks.get(frame.packetId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingAcks.delete(frame.packetId);
        pending.resolve(frame);
      }
      this.emit("ack", frame);
    } else if (frame.type === "data") {
      logger.debug(
        `Received relay data frame: packetId=${frame.packetId}, session=${frame.sessionId}`,
      );
      this.emit("data", frame);
    }
  }

  /**
   * Sends an encrypted data frame over the relay and awaits delivery acknowledgment
   */
  public async sendDataFrame(
    frame: RelayDataFrame,
    timeoutMs = DEFAULT_ACK_TIMEOUT_MS,
  ): Promise<RelayAckFrame> {
    if (this.httpRelay) {
      const response = await fetch(`${this.httpRelay.baseUrl}/api/v1/relay/messages/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.httpRelay.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(frame),
      });
      if (!response.ok) {
        throw new Error(
          `HTTP relay rejected packet (${response.status}): ${await response.text()}`,
        );
      }
      const ack = (await response.json()) as RelayAckFrame;
      this.emit("ack", ack);
      return ack;
    }
    if (!this.isConnected()) {
      throw new Error("Cannot send data frame: Relay WebSocket is not connected");
    }

    return new Promise<RelayAckFrame>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(frame.packetId);
        reject(new Error(`Timed out waiting for relay ack on packet ${frame.packetId}`));
      }, timeoutMs);

      this.pendingAcks.set(frame.packetId, {
        resolve,
        reject,
        timeout,
      });

      this.sendRaw(frame);
    });
  }

  public async connectHttp(options: HttpRelayOptions): Promise<RelayReadyFrame> {
    this.disconnect("Switching to HTTP relay fallback");
    this.httpRelay = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
    };
    const generation = this.connectionGeneration;
    await this.postHeartbeat();
    this.scheduleHttpPoll(generation, 0);
    const ready: RelayReadyFrame = {
      type: "ready",
      relayProtocolVersion: 1,
      deviceId: options.deviceId,
      role: "host",
      peerDeviceId: options.deviceId,
    };
    logger.info("Connected through authenticated HTTP relay fallback");
    this.emit("ready", ready);
    return ready;
  }

  private async postHeartbeat(): Promise<void> {
    if (!this.httpRelay) return;
    const response = await fetch(`${this.httpRelay.baseUrl}/api/v1/relay/heartbeat/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.httpRelay.accessToken}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP relay heartbeat failed (${response.status})`);
    }
  }

  private scheduleHttpPoll(generation: number, delayMs = HTTP_POLL_INTERVAL_MS): void {
    if (!this.httpRelay || generation !== this.connectionGeneration) return;
    this.httpPollTimer = setTimeout(() => void this.pollHttp(generation), delayMs);
  }

  private async pollHttp(generation: number): Promise<void> {
    if (!this.httpRelay || this.httpPollInFlight || generation !== this.connectionGeneration)
      return;
    this.httpPollInFlight = true;
    try {
      const response = await fetch(`${this.httpRelay.baseUrl}/api/v1/relay/messages/?limit=50`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.httpRelay.accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP relay poll failed (${response.status})`);
      }
      const payload = (await response.json()) as { frames?: RelayDataFrame[] };
      for (const frame of payload.frames ?? []) this.emit("data", frame);
    } catch (err) {
      logger.warn("HTTP relay poll failed; retrying", err);
      this.emit("error", err as Error);
    } finally {
      this.httpPollInFlight = false;
      this.scheduleHttpPoll(generation);
    }
  }

  /**
   * Step 4: Heartbeat / Keepalive
   * Studio sends {"type": "ping"} every 30 seconds
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        logger.debug("Sending ping to relay");
        this.sendRaw({ type: "ping" });
      }
    }, DEFAULT_PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendRaw(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public disconnect(reason = "Normal closure"): void {
    this.connectionGeneration += 1;
    if (this.httpPollTimer) {
      clearTimeout(this.httpPollTimer);
      this.httpPollTimer = null;
    }
    this.httpRelay = null;
    this.httpPollInFlight = false;
    this.stopHeartbeat();
    this.isConnecting = false;
    this.currentUrl = null;

    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Relay disconnected before ack: ${reason}`));
    }
    this.pendingAcks.clear();

    if (this.ws) {
      try {
        this.ws.close(1000, reason);
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private cleanupSocket(): void {
    this.stopHeartbeat();
    this.isConnecting = false;
    this.ws = null;
  }
}
