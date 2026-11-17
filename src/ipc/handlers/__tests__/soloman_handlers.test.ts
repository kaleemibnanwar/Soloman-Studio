import { describe, it, expect, vi, beforeEach } from "vitest";
import { solomanContracts } from "../../types/soloman";
import { registerSolomanHandlers } from "../soloman_handlers";
import { solomanBridge } from "@/main/soloman/soloman_bridge";
import { getRegisteredHandlerForTesting } from "../base";
import type { IpcMainInvokeEvent } from "electron";

describe("Soloman IPC Handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerSolomanHandlers();
  });

  const mockEvent = {} as IpcMainInvokeEvent;

  it("handles getStatus contract", async () => {
    const mockStatus = {
      enrolled: true,
      deviceId: "desk_test",
      deviceName: "Host Machine",
      cloudUrl: "https://cloud.soloman.local",
      isRelayConnected: true,
      activeGrantsCount: 2,
      pendingPairingsCount: 0,
      lastConnectedAt: "2026-10-16T01:00:00Z",
      lastError: null,
    };

    vi.spyOn(solomanBridge, "getStatus").mockReturnValue(mockStatus);

    const handler = getRegisteredHandlerForTesting(solomanContracts.getStatus.channel);
    const result = await handler(mockEvent, undefined);

    expect(result).toEqual(mockStatus);
  });

  it("handles enrollDevice contract", async () => {
    const mockStatus = {
      enrolled: true,
      deviceId: "desk_new",
      deviceName: "MacBook",
      cloudUrl: "https://cloud.soloman.local",
      isRelayConnected: true,
      activeGrantsCount: 0,
      pendingPairingsCount: 0,
      lastConnectedAt: "2026-10-16T01:00:00Z",
      lastError: null,
    };

    const enrollSpy = vi.spyOn(solomanBridge, "enrollDevice").mockResolvedValue(mockStatus);

    const handler = getRegisteredHandlerForTesting(solomanContracts.enrollDevice.channel);
    const result = await handler(mockEvent, {
      enrollmentCode: "sol_enr_12345",
      deviceName: "MacBook",
    });

    expect(enrollSpy).toHaveBeenCalledWith("sol_enr_12345", "MacBook", undefined);
    expect(result).toEqual(mockStatus);
  });

  it("handles approvePairing contract", async () => {
    const mockGrant = {
      grantId: "grant_123",
      controllerDeviceId: "mob_123",
      hostDeviceId: "desk_123",
      status: "active" as const,
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-10-16T01:00:00Z",
    };

    const approveSpy = vi.spyOn(solomanBridge, "approvePairing").mockResolvedValue(mockGrant);

    const handler = getRegisteredHandlerForTesting(solomanContracts.approvePairing.channel);
    const result = await handler(mockEvent, {
      pairingId: "pair_123",
      verificationCode: "654321",
    });

    expect(approveSpy).toHaveBeenCalledWith("pair_123", "654321");
    expect(result).toEqual({ grant: mockGrant });
  });

  it("handles revokeGrant contract", async () => {
    const revokeSpy = vi.spyOn(solomanBridge, "revokeGrant").mockReturnValue(undefined);

    const handler = getRegisteredHandlerForTesting(solomanContracts.revokeGrant.channel);
    const result = await handler(mockEvent, { grantId: "grant_123" });

    expect(revokeSpy).toHaveBeenCalledWith("grant_123");
    expect(result).toEqual({ ok: true });
  });

  it("handles startBrowserLogin contract", async () => {
    const mockSession = {
      sessionId: "sol_sess_test",
      authUrl: "https://cloud.soloman.local/auth/desktop-login?session_id=sol_sess_test",
    };

    const startSpy = vi.spyOn(solomanBridge, "startBrowserLogin").mockResolvedValue(mockSession);

    const handler = getRegisteredHandlerForTesting(solomanContracts.startBrowserLogin.channel);
    const result = await handler(mockEvent, { deviceName: "My Mac" });

    expect(startSpy).toHaveBeenCalledWith("My Mac", undefined);
    expect(result).toEqual(mockSession);
  });

  it("handles checkLoginSession contract", async () => {
    const mockStatus = {
      enrolled: true,
      deviceId: "desk_login",
      deviceName: "MacBook",
      cloudUrl: "https://cloud.soloman.local",
      isRelayConnected: true,
      activeGrantsCount: 0,
      pendingPairingsCount: 0,
      lastConnectedAt: "2026-10-16T01:00:00Z",
      lastError: null,
    };

    const checkSpy = vi.spyOn(solomanBridge, "checkLoginSession").mockResolvedValue({
      completed: true,
      status: mockStatus,
    });

    const handler = getRegisteredHandlerForTesting(solomanContracts.checkLoginSession.channel);
    const result = await handler(mockEvent, { sessionId: "sol_sess_test" });

    expect(checkSpy).toHaveBeenCalledWith("sol_sess_test");
    expect(result).toEqual({ completed: true, status: mockStatus });
  });

  it("handles directLogin contract", async () => {
    const mockStatus = {
      enrolled: true,
      deviceId: "desk_login_direct",
      deviceName: "Alex MacBook Pro",
      cloudUrl: "https://soloman.si",
      isRelayConnected: true,
      activeGrantsCount: 0,
      pendingPairingsCount: 0,
      lastConnectedAt: "2026-10-16T01:00:00Z",
      lastError: null,
    };

    const directSpy = vi.spyOn(solomanBridge, "directLogin").mockResolvedValue(mockStatus);

    const handler = getRegisteredHandlerForTesting(solomanContracts.directLogin.channel);
    const result = await handler(mockEvent, {
      username: "alex",
      password: "secretpassword",
      deviceName: "Alex MacBook Pro",
      cloudUrl: "https://soloman.si",
    });

    expect(directSpy).toHaveBeenCalledWith(
      "alex",
      "secretpassword",
      "Alex MacBook Pro",
      "https://soloman.si",
    );
    expect(result).toEqual(mockStatus);
  });

  it("handles simulateBrowserLogin and logout contracts", async () => {
    const mockStatus = {
      enrolled: true,
      deviceId: "desk_sim",
      deviceName: "MacBook",
      cloudUrl: "https://cloud.soloman.local",
      isRelayConnected: true,
      activeGrantsCount: 0,
      pendingPairingsCount: 0,
      lastConnectedAt: "2026-10-16T01:00:00Z",
      lastError: null,
    };

    const simSpy = vi.spyOn(solomanBridge, "simulateBrowserLogin").mockResolvedValue(mockStatus);
    const logoutSpy = vi.spyOn(solomanBridge, "logout").mockResolvedValue(undefined);

    const simHandler = getRegisteredHandlerForTesting(
      solomanContracts.simulateBrowserLogin.channel,
    );
    const simResult = await simHandler(mockEvent, { email: "alex@soloman.io" });
    expect(simSpy).toHaveBeenCalledWith("alex@soloman.io", undefined);
    expect(simResult).toEqual(mockStatus);

    const logoutHandler = getRegisteredHandlerForTesting(solomanContracts.logout.channel);
    const logoutResult = await logoutHandler(mockEvent, undefined);
    expect(logoutSpy).toHaveBeenCalled();
    expect(logoutResult).toEqual({ ok: true });
  });
});
