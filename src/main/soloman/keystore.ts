import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import log from "electron-log";
import { getUserDataPath } from "@/paths/paths";
import { encryptToString, decryptFromString } from "@/ipc/utils/secret_storage";
import { generateIdentityKeys, type IdentityKeyPair } from "./crypto";
import type { DeviceConnectionGrant, SolomanDevice } from "./types";

const logger = log.scope("soloman-keystore");

export interface StoredKeystoreData {
  version: 1;
  deviceId: string | null;
  deviceName: string;
  cloudUrl: string;
  // Encrypted via safeStorage / secret_storage
  encryptedDeviceAccessToken?: string | null;
  signingPublicKey: string;
  // Encrypted via safeStorage / secret_storage
  encryptedSigningPrivateKey: string;
  encryptionPublicKey: string;
  // Encrypted via safeStorage / secret_storage
  encryptedEncryptionPrivateKey: string;
  grants: DeviceConnectionGrant[];
  accountEmail?: string | null;
  autoTrustAccountDevices?: boolean;
  updatedAt: string;
}

export const DEFAULT_SOLOMAN_CLOUD_URL = process.env.SOLOMAN_CLOUD_URL ?? "https://soloman.si";

export function generateDefaultDeviceName(): string {
  const platform = os.platform();
  const hostname = os.hostname();
  let osName = "Desktop";
  if (platform === "darwin") osName = "macOS";
  else if (platform === "win32") osName = "Windows";
  else if (platform === "linux") osName = "Linux";

  if (hostname && hostname !== "localhost") {
    return `${hostname} (${osName})`;
  }
  return `${osName} Desktop Host`;
}

export class SolomanKeyStore {
  private filePath: string;
  private data: StoredKeystoreData | null = null;
  private memoryAccessToken: string | null = null;
  private memorySigningPrivateKey: string | null = null;
  private memoryEncryptionPrivateKey: string | null = null;

  constructor(customFilePath?: string) {
    if (customFilePath) {
      this.filePath = customFilePath;
    } else {
      const targetPath = path.join(getUserDataPath(), "keystore", "device-identity.json");
      const legacyPath = path.join(getUserDataPath(), "soloman", "keystore.json");

      // Auto-migrate from legacy location if it exists
      if (!fs.existsSync(targetPath) && fs.existsSync(legacyPath)) {
        try {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.copyFileSync(legacyPath, targetPath);
          logger.info(`Migrated legacy keystore from ${legacyPath} to ${targetPath}`);
        } catch (err) {
          logger.warn("Failed to migrate legacy keystore:", err);
        }
      }
      this.filePath = targetPath;
    }
  }

  /**
   * Initializes or loads the keystore from disk.
   * If identity keys do not exist, generates them automatically.
   */
  public ensureInitialized(): void {
    if (this.data) {
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        this.data = JSON.parse(raw) as StoredKeystoreData;

        if (this.data.cloudUrl === "https://cloud.soloman.local") {
          this.data.cloudUrl = "https://soloman.si";
          this.saveToDisk();
        }

        if (
          !this.data.deviceName ||
          this.data.deviceName === "Octopus Studio Desktop" ||
          this.data.deviceName === "Alex MacBook Pro" ||
          this.data.deviceName === "My MacBook Pro"
        ) {
          this.data.deviceName = generateDefaultDeviceName();
          this.saveToDisk();
        }

        // Note: Secrets are decrypted lazily on demand in getters once app.whenReady() has fired.
      }
    } catch (err) {
      logger.error("Failed to read keystore from disk, reinitializing", err);
    }

    if (!this.data || !this.data.signingPublicKey || !this.data.encryptedSigningPrivateKey) {
      // First-run: generate persistent identity keys
      logger.info("Generating new persistent identity keys for Desktop Host");
      const keys = generateIdentityKeys();
      const defaultName = generateDefaultDeviceName();

      this.memorySigningPrivateKey = keys.signingPrivateKey;
      this.memoryEncryptionPrivateKey = keys.encryptionPrivateKey;

      this.data = {
        version: 1,
        deviceId: null,
        deviceName: defaultName,
        cloudUrl: DEFAULT_SOLOMAN_CLOUD_URL,
        encryptedDeviceAccessToken: null,
        signingPublicKey: keys.signingPublicKey,
        encryptedSigningPrivateKey: encryptToString(keys.signingPrivateKey),
        encryptionPublicKey: keys.encryptionPublicKey,
        encryptedEncryptionPrivateKey: encryptToString(keys.encryptionPrivateKey),
        grants: [],
        updatedAt: new Date().toISOString(),
      };

      this.saveToDisk();
    }
  }

  private saveToDisk(): void {
    if (!this.data) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.data.updatedAt = new Date().toISOString();
      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      logger.error("Failed to write keystore to disk", err);
    }
  }

  public getDeviceId(): string | null {
    this.ensureInitialized();
    return this.data?.deviceId ?? null;
  }

  public getDeviceName(): string {
    this.ensureInitialized();
    return this.data?.deviceName || generateDefaultDeviceName();
  }

  public setDeviceName(name: string): void {
    this.ensureInitialized();
    if (this.data) {
      this.data.deviceName = name;
      this.saveToDisk();
    }
  }

  public getCloudUrl(): string {
    this.ensureInitialized();
    return this.data?.cloudUrl ?? DEFAULT_SOLOMAN_CLOUD_URL;
  }

  public setCloudUrl(url: string): void {
    this.ensureInitialized();
    if (this.data) {
      this.data.cloudUrl = url;
      this.saveToDisk();
    }
  }

  public getDeviceAccessToken(): string | null {
    this.ensureInitialized();
    if (this.memoryAccessToken && this.memoryAccessToken.startsWith("sol_")) {
      return this.memoryAccessToken;
    }

    if (!this.data?.encryptedDeviceAccessToken) {
      return null;
    }

    try {
      const decrypted = decryptFromString(this.data.encryptedDeviceAccessToken);
      if (decrypted && decrypted.startsWith("sol_")) {
        this.memoryAccessToken = decrypted;
        return decrypted;
      }
      logger.warn("Decrypted access token is invalid or failed safeStorage recovery");
      return null;
    } catch (err) {
      logger.warn("Failed to decrypt device access token", err);
      return null;
    }
  }

  public getIdentityKeys(): IdentityKeyPair {
    this.ensureInitialized();

    if (!this.memorySigningPrivateKey && this.data?.encryptedSigningPrivateKey) {
      try {
        const dec = decryptFromString(this.data.encryptedSigningPrivateKey);
        if (dec && dec.startsWith("ed25519-priv:")) {
          this.memorySigningPrivateKey = dec;
        }
      } catch (e) {
        logger.warn("Failed to decrypt signingPrivateKey", e);
      }
    }

    if (!this.memoryEncryptionPrivateKey && this.data?.encryptedEncryptionPrivateKey) {
      try {
        const dec = decryptFromString(this.data.encryptedEncryptionPrivateKey);
        if (dec && (dec.startsWith("x25519-priv:") || dec.startsWith("p256-priv:"))) {
          this.memoryEncryptionPrivateKey = dec;
        }
      } catch (e) {
        logger.warn("Failed to decrypt encryptionPrivateKey", e);
      }
    }

    return {
      signingPublicKey: this.data!.signingPublicKey,
      signingPrivateKey: this.memorySigningPrivateKey!,
      encryptionPublicKey: this.data!.encryptionPublicKey,
      encryptionPrivateKey: this.memoryEncryptionPrivateKey!,
    };
  }

  public isEnrolled(): boolean {
    this.ensureInitialized();
    return Boolean(this.data?.deviceId && this.getDeviceAccessToken());
  }

  /**
   * Saves the device registration outcome (deviceId and deviceAccessToken)
   */
  public saveEnrolledDevice(device: SolomanDevice, accessToken: string): void {
    this.ensureInitialized();
    if (!this.data) return;

    this.data.deviceId = device.deviceId;
    this.data.deviceName = device.name;
    this.memoryAccessToken = accessToken;
    this.data.encryptedDeviceAccessToken = encryptToString(accessToken);
    this.saveToDisk();
    logger.info(`Desktop Host registered with deviceId: ${device.deviceId}`);
  }

  /**
   * Retrieves all device connection grants
   */
  public getGrants(): DeviceConnectionGrant[] {
    this.ensureInitialized();
    return this.data?.grants ?? [];
  }

  /**
   * Stores or updates an approved grant
   */
  public addOrUpdateGrant(grant: DeviceConnectionGrant): void {
    this.ensureInitialized();
    if (!this.data) return;

    const existingIndex = this.data.grants.findIndex((g) => g.grantId === grant.grantId);
    if (existingIndex >= 0) {
      this.data.grants[existingIndex] = grant;
    } else {
      this.data.grants.push(grant);
    }
    this.saveToDisk();
    logger.info(`Saved grant ${grant.grantId} for controller: ${grant.controllerDeviceId}`);
  }

  /**
   * Revokes a grant locally
   */
  public revokeGrant(grantId: string): void {
    this.ensureInitialized();
    if (!this.data) return;

    const grant = this.data.grants.find((g) => g.grantId === grantId);
    if (grant) {
      grant.status = "revoked";
      grant.revokedAt = new Date().toISOString();
      this.saveToDisk();
      logger.info(`Revoked grant ${grantId}`);
    }
  }

  public getAccountEmail(): string | null {
    this.ensureInitialized();
    return this.data?.accountEmail ?? null;
  }

  public setAccountEmail(email: string | null): void {
    this.ensureInitialized();
    if (this.data) {
      this.data.accountEmail = email;
      this.saveToDisk();
    }
  }

  public isAutoTrustAccountDevices(): boolean {
    this.ensureInitialized();
    return this.data?.autoTrustAccountDevices ?? true;
  }

  public setAutoTrustAccountDevices(enabled: boolean): void {
    this.ensureInitialized();
    if (this.data) {
      this.data.autoTrustAccountDevices = enabled;
      this.saveToDisk();
    }
  }

  /**
   * Invariant 3: Verify whether controllerDeviceId has an active, unexpired, unrevoked grant
   * When autoTrustAccountDevices is true and host is enrolled via account login,
   * controller devices under the account are automatically authorized.
   */
  public isControllerAllowed(controllerDeviceId: string): boolean {
    this.ensureInitialized();
    if (!this.data) return false;

    // If auto-trust is enabled and device is enrolled, allow controller
    if (this.isAutoTrustAccountDevices() && this.isEnrolled()) {
      return true;
    }

    const grant = this.data.grants.find(
      (g) => g.controllerDeviceId === controllerDeviceId && g.status === "active",
    );

    if (!grant) {
      return false;
    }

    if (grant.revokedAt) {
      return false;
    }

    if (grant.expiresAt) {
      const expiry = new Date(grant.expiresAt).getTime();
      if (Date.now() > expiry) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clears device registration while retaining local identity keys
   */
  public resetRegistration(): void {
    this.ensureInitialized();
    if (this.data) {
      this.data.deviceId = null;
      this.data.accountEmail = null;
      this.data.encryptedDeviceAccessToken = null;
      this.memoryAccessToken = null;
      this.data.grants = [];
      this.saveToDisk();
    }
  }
}
