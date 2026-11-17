import { solomanContracts } from "../types/soloman";
import { createTypedHandler } from "./base";
import { solomanBridge } from "@/main/soloman/soloman_bridge";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";

export function registerSolomanHandlers(): void {
  createTypedHandler(solomanContracts.getStatus, async () => {
    return solomanBridge.getStatus();
  });

  createTypedHandler(solomanContracts.enrollDevice, async (_event, input) => {
    try {
      return await solomanBridge.enrollDevice(
        input.enrollmentCode,
        input.deviceName,
        input.cloudUrl,
      );
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Enrollment failed",
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.listPendingPairings, async () => {
    const pairings = await solomanBridge.pollPendingPairings();
    return { pairings };
  });

  createTypedHandler(solomanContracts.approvePairing, async (_event, input) => {
    try {
      const grant = await solomanBridge.approvePairing(input.pairingId, input.verificationCode);
      return { grant };
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Approval failed",
        OctopusStudioErrorKind.Validation,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.listGrants, async () => {
    const grants = solomanBridge.getGrants();
    return { grants };
  });

  createTypedHandler(solomanContracts.revokeGrant, async (_event, input) => {
    solomanBridge.revokeGrant(input.grantId);
    return { ok: true as const };
  });

  createTypedHandler(solomanContracts.connectRelay, async () => {
    try {
      await solomanBridge.connectRelay();
      return { ok: true as const };
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Failed to connect to relay",
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.disconnectRelay, async () => {
    solomanBridge.disconnectRelay();
    return { ok: true as const };
  });

  createTypedHandler(solomanContracts.startBrowserLogin, async (_event, input) => {
    try {
      const res = await solomanBridge.startBrowserLogin(input.deviceName, input.cloudUrl);
      return res;
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Failed to start browser login",
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.directLogin, async (_event, input) => {
    try {
      return await solomanBridge.directLogin(
        input.username,
        input.password,
        input.deviceName,
        input.cloudUrl,
      );
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Failed to log in",
        OctopusStudioErrorKind.Auth,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.checkLoginSession, async (_event, input) => {
    try {
      return await solomanBridge.checkLoginSession(input.sessionId);
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Failed to check login session",
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.simulateBrowserLogin, async (_event, input) => {
    try {
      return await solomanBridge.simulateBrowserLogin(input.email, input.deviceName);
    } catch (err) {
      if (err instanceof OctopusStudioError) throw err;
      throw new OctopusStudioError(
        (err as Error).message || "Failed to simulate login",
        OctopusStudioErrorKind.External,
        { cause: err },
      );
    }
  });

  createTypedHandler(solomanContracts.logout, async () => {
    await solomanBridge.logout();
    return { ok: true as const };
  });
}
