import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SolomanKeyStore } from "../keystore";
import type { DeviceConnectionGrant, SolomanDevice } from "../types";

const testUserDataDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require("node:os");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "soloman-keystore-test-"));
});

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => false, // tests fallback to plaintext encoding cleanly
    encryptString: (str: string) => Buffer.from(str),
    decryptString: (buf: Buffer) => buf.toString(),
  },
}));

vi.mock("@/paths/paths", () => ({
  getUserDataPath: () => testUserDataDir,
}));

describe("SolomanKeyStore", () => {
  let tmpDir: string;
  let tmpFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "soloman-keystore-test-"));
    tmpFilePath = path.join(tmpDir, "keystore.json");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("initializes persistent identity keys on first run", () => {
    const keyStore = new SolomanKeyStore(tmpFilePath);
    expect(keyStore.isEnrolled()).toBe(false);

    const keys = keyStore.getIdentityKeys();
    expect(keys.signingPublicKey.startsWith("ed25519:")).toBe(true);
    expect(keys.encryptionPublicKey.startsWith("x25519:")).toBe(true);

    // Keystore file should have been written to disk
    expect(fs.existsSync(tmpFilePath)).toBe(true);
  });

  it("persists device registration and securely stores deviceAccessToken", () => {
    const keyStore = new SolomanKeyStore(tmpFilePath);
    const mockDevice: SolomanDevice = {
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
    };

    const accessToken = "sol_v1_dev_K9fL2mQpW7xR8tY1uI4oP0aB3cD5eG7hJ9kL2mQpW7x";
    keyStore.saveEnrolledDevice(mockDevice, accessToken);

    expect(keyStore.isEnrolled()).toBe(true);
    expect(keyStore.getDeviceId()).toBe("desk_6c8f12a4b89e");
    expect(keyStore.getDeviceAccessToken()).toBe(accessToken);

    // Re-instantiate keystore from disk to verify reload
    const reloadedKeyStore = new SolomanKeyStore(tmpFilePath);
    expect(reloadedKeyStore.isEnrolled()).toBe(true);
    expect(reloadedKeyStore.getDeviceId()).toBe("desk_6c8f12a4b89e");
    expect(reloadedKeyStore.getDeviceAccessToken()).toBe(accessToken);
  });

  it("enforces Invariant 3: Explicit Pairing Grants", () => {
    const keyStore = new SolomanKeyStore(tmpFilePath);

    const controllerA = "mob_a8912e9b01cf";
    const controllerB = "mob_unapproved_123";

    // Unapproved controller
    expect(keyStore.isControllerAllowed(controllerB)).toBe(false);

    // Add active grant for controllerA
    const activeGrant: DeviceConnectionGrant = {
      grantId: "9b24ce4d-119c-48be-8857-418293701ef2",
      controllerDeviceId: controllerA,
      hostDeviceId: "desk_6c8f12a4b89e",
      status: "active",
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-10-16T01:02:15Z",
    };
    keyStore.addOrUpdateGrant(activeGrant);

    expect(keyStore.isControllerAllowed(controllerA)).toBe(true);
    expect(keyStore.isControllerAllowed(controllerB)).toBe(false);

    // Revoking grant
    keyStore.revokeGrant(activeGrant.grantId);
    expect(keyStore.isControllerAllowed(controllerA)).toBe(false);
  });

  it("rejects expired grants", () => {
    const keyStore = new SolomanKeyStore(tmpFilePath);
    const expiredGrant: DeviceConnectionGrant = {
      grantId: "grant_expired",
      controllerDeviceId: "mob_expired",
      hostDeviceId: "desk_6c8f12a4b89e",
      status: "active",
      expiresAt: new Date(Date.now() - 10000).toISOString(), // expired in past
      revokedAt: null,
      createdAt: "2026-10-16T01:00:00Z",
    };

    keyStore.addOrUpdateGrant(expiredGrant);
    expect(keyStore.isControllerAllowed("mob_expired")).toBe(false);
  });

  it("auto-migrates legacy soloman/keystore.json to keystore/device-identity.json", () => {
    const legacyDir = path.join(testUserDataDir, "soloman");
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyFile = path.join(legacyDir, "keystore.json");
    const targetDir = path.join(testUserDataDir, "keystore");
    const targetFile = path.join(targetDir, "device-identity.json");

    // Clean up if already exists
    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);

    // Seed legacy keystore
    const legacyData = {
      version: 1,
      deviceId: "desk_migrated_123",
      deviceName: "Migrated Device",
      cloudUrl: "https://soloman.si",
      signingPublicKey: "ed25519:test",
      encryptedSigningPrivateKey: "test-priv",
      encryptionPublicKey: "x25519:test",
      encryptedEncryptionPrivateKey: "test-enc-priv",
      grants: [],
      updatedAt: "2026-10-16T00:00:00Z",
    };
    fs.writeFileSync(legacyFile, JSON.stringify(legacyData), "utf8");

    // Instantiate without custom path to trigger default path logic
    const store = new SolomanKeyStore();
    expect(fs.existsSync(targetFile)).toBe(true);
    expect(store.getDeviceId()).toBe("desk_migrated_123");
    expect(store.getDeviceName()).toBe("Migrated Device");
  });
});
