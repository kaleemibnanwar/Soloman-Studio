import { describe, it, expect, vi, beforeEach } from "vitest";
import { ControlPlaneClient } from "../control_plane_client";
import { generateDefaultDeviceName } from "../keystore";
import type { RegisterDeviceRequest } from "../types";

describe("ControlPlaneClient", () => {
  let client: ControlPlaneClient;

  beforeEach(() => {
    client = new ControlPlaneClient("https://cloud.soloman.local");
    vi.restoreAllMocks();
  });

  it("registers device via POST /api/v1/devices/ (Step 1)", async () => {
    const mockResponse = {
      device: {
        deviceId: "desk_6c8f12a4b89e",
        name: "Alex MacBook Pro",
        deviceType: "desktop",
        publicKey: "x25519:MCowBQYDK2VuAyEA...",
        signingPublicKey: "ed25519:MCowBQYDK2VwAyEA9rN...",
        encryptionPublicKey: "x25519:MCowBQYDK2VuAyEA...",
        protocolVersion: 1,
        revokedAt: null,
        isOnline: false,
        lastSeenAt: null,
        createdAt: "2026-10-16T01:00:00Z",
      },
      deviceAccessToken: "sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x",
      tokenNotice: "This token is returned once and is not stored in plaintext.",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as Response);

    const req: RegisterDeviceRequest = {
      name: "Alex MacBook Pro",
      deviceType: "desktop",
      signingPublicKey: "ed25519:MCowBQYDK2VwAyEA9rN...",
      encryptionPublicKey: "x25519:MCowBQYDK2VuAyEA...",
      protocolVersion: 1,
      enrollmentCode: "sol_enr_8aBcD9Ef2GhIjKlM",
    };

    const result = await client.registerDevice(req);

    expect(fetchMock).toHaveBeenCalledWith("https://cloud.soloman.local/api/v1/devices/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(req),
    });

    expect(result.device.deviceId).toBe("desk_6c8f12a4b89e");
    expect(result.deviceAccessToken).toBe("sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x");
  });

  it("lists pending pairings via GET /api/v1/pairings/?status=pending (Step 2)", async () => {
    const mockPairings = [
      {
        pairingId: "7a3e81fc-0c21-4f18-bb92-91ef23d18e47",
        controllerDevice: {
          deviceId: "mob_a8912e9b01cf",
          name: "Alex iPhone 15 Pro",
          deviceType: "mobile" as const,
        },
        hostDevice: {
          deviceId: "desk_6c8f12a4b89e",
          name: "Alex MacBook Pro",
          deviceType: "desktop" as const,
        },
        status: "pending" as const,
        expiresAt: "2026-10-16T01:10:00Z",
        approvedAt: null,
        createdAt: "2026-10-16T01:00:00Z",
      },
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ pairings: mockPairings }),
    } as Response);

    const accessToken = "sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x";
    const result = await client.listPendingPairings(accessToken);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.soloman.local/api/v1/pairings/?status=pending",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );

    expect(result.length).toBe(1);
    expect(result[0].pairingId).toBe("7a3e81fc-0c21-4f18-bb92-91ef23d18e47");
  });

  it("approves pairing via POST /api/v1/pairings/{id}/approve/ (Step 2)", async () => {
    const mockApproveResponse = {
      pairing: {
        pairingId: "7a3e81fc-0c21-4f18-bb92-91ef23d18e47",
        status: "approved" as const,
        approvedAt: "2026-10-16T01:02:15Z",
      },
      grant: {
        grantId: "9b24ce4d-119c-48be-8857-418293701ef2",
        controllerDeviceId: "mob_a8912e9b01cf",
        hostDeviceId: "desk_6c8f12a4b89e",
        status: "active" as const,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-10-16T01:02:15Z",
      },
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockApproveResponse,
    } as Response);

    const accessToken = "sol_v1_dev_test";
    const pairingId = "7a3e81fc-0c21-4f18-bb92-91ef23d18e47";
    const verificationCode = "582914";

    const result = await client.approvePairing(accessToken, pairingId, verificationCode);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://cloud.soloman.local/api/v1/pairings/${pairingId}/approve/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ verificationCode: "582914" }),
      },
    );

    expect(result.pairing.status).toBe("approved");
    expect(result.grant.status).toBe("active");
  });

  it("acquires host connection ticket via POST /api/v1/connections/tickets/ (Step 3)", async () => {
    const mockTicketResponse = {
      ticket: {
        ticketId: "3b18d270-4923-4927-b649-0d85f8c679a1",
        role: "host" as const,
        sourceDeviceId: "desk_6c8f12a4b89e",
        targetDeviceId: "desk_6c8f12a4b89e",
        expiresAt: "2026-10-16T01:03:15Z",
        webSocketUrl:
          "wss://cloud.soloman.local/api/v1/connections/ws/?ticket=sol_v1_tkt_P2qL9vW0rT4xY7uI1oP3aB5cD7eG9hJ",
      },
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockTicketResponse,
    } as Response);

    const accessToken = "sol_v1_dev_test";
    const targetDeviceId = "desk_6c8f12a4b89e";

    const ticket = await client.acquireHostTicket(accessToken, targetDeviceId);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.soloman.local/api/v1/connections/tickets/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ targetDeviceId }),
      },
    );

    expect(ticket.role).toBe("host");
    expect(ticket.webSocketUrl).toContain(
      "wss://cloud.soloman.local/api/v1/connections/ws/?ticket=",
    );
  });

  it("performs direct in-app login via POST /api/v1/auth/login/", async () => {
    const mockAuthResponse = {
      userAccessToken: "sol_usr_5:1xHWT0:LW0e86RZuh4ZzgTeyf",
      user: {
        userId: 5,
        username: "alex",
        email: "alex@example.com",
      },
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockAuthResponse,
    } as Response);

    const result = await client.directLogin({ username: "alex", password: "SecretPassword123" });

    expect(fetchMock).toHaveBeenCalledWith("https://cloud.soloman.local/api/v1/auth/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ username: "alex", password: "SecretPassword123" }),
    });

    expect(result.userAccessToken).toBe("sol_usr_5:1xHWT0:LW0e86RZuh4ZzgTeyf");
    expect(result.user?.username).toBe("alex");
  });

  it("registers desktop host with userAccessToken in Authorization header", async () => {
    const mockResponse = {
      device: {
        deviceId: "desk_6c8f12a4b89e",
        name: "Alex MacBook Pro",
        deviceType: "desktop",
        protocolVersion: 1,
        isOnline: false,
        createdAt: "2026-10-16T01:00:00Z",
      },
      deviceAccessToken: "sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x",
      tokenNotice: "This token is returned once and is not stored in plaintext.",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as Response);

    const req: RegisterDeviceRequest = {
      name: "Alex MacBook Pro",
      deviceType: "desktop",
      signingPublicKey: "ed25519:test",
      encryptionPublicKey: "x25519:test",
      protocolVersion: 1,
    };

    const userToken = "sol_usr_5:1xHWT0:LW0e86RZuh4ZzgTeyf";
    const result = await client.registerDevice(req, userToken);

    expect(fetchMock).toHaveBeenCalledWith("https://cloud.soloman.local/api/v1/devices/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify(req),
    });

    expect(result.device.deviceId).toBe("desk_6c8f12a4b89e");
    expect(result.deviceAccessToken).toBe("sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x");
  });

  it("computes device name from OS name and hostname", () => {
    const computedName = generateDefaultDeviceName();
    expect(computedName).toBeTruthy();
    expect(typeof computedName).toBe("string");
    expect(computedName.length).toBeGreaterThan(3);
  });
});
