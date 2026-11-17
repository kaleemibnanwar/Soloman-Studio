import crypto from "node:crypto";

export interface IdentityKeyPair {
  signingPublicKey: string; // "ed25519:<base64-spki>"
  signingPrivateKey: string; // "ed25519-priv:<base64-pkcs8>"
  encryptionPublicKey: string; // "x25519:<base64-spki>" or "p256:<base64-spki>"
  encryptionPrivateKey: string; // "x25519-priv:<base64-pkcs8>" or "p256-priv:<base64-pkcs8>"
}

export interface CiphertextEnvelope {
  version: 1;
  iv: string; // base64
  ciphertext: string; // base64
  tag: string; // base64
}

const DEFAULT_HKDF_SALT = "";
const DEFAULT_HKDF_INFO = "soloman-e2ee-session-v1";

/**
 * Generates persistent device identity keys:
 * - Ed25519 for signing
 * - X25519 for E2EE key exchange
 */
export function generateIdentityKeys(): IdentityKeyPair {
  // Generate Ed25519 signing keypair
  const edKeyPair = crypto.generateKeyPairSync("ed25519");
  const signingPublicKey =
    "ed25519:" + edKeyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const signingPrivateKey =
    "ed25519-priv:" +
    edKeyPair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

  // Generate X25519 encryption keypair
  const xKeyPair = crypto.generateKeyPairSync("x25519");
  const encryptionPublicKey =
    "x25519:" + xKeyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const encryptionPrivateKey =
    "x25519-priv:" +
    xKeyPair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

  return {
    signingPublicKey,
    signingPrivateKey,
    encryptionPublicKey,
    encryptionPrivateKey,
  };
}

/**
 * Generates an ephemeral P-256 or X25519 keypair for session negotiation
 */
export function generateEphemeralKeyPair(curve: "x25519" | "p256" = "x25519"): {
  publicKey: string;
  privateKey: string;
} {
  if (curve === "p256") {
    const pKeyPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    return {
      publicKey:
        "p256:" + pKeyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      privateKey:
        "p256-priv:" +
        pKeyPair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    };
  }
  const xKeyPair = crypto.generateKeyPairSync("x25519");
  return {
    publicKey:
      "x25519:" + xKeyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey:
      "x25519-priv:" +
      xKeyPair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

/**
 * Imports a private key from string representation (with or without prefix)
 */
export function importPrivateKey(keyString: string): crypto.KeyObject {
  let derB64 = keyString;
  if (derB64.includes(":")) {
    derB64 = derB64.split(":")[1];
  }
  return crypto.createPrivateKey({
    key: Buffer.from(derB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

/**
 * Imports a public key from string representation (with or without prefix)
 */
export function importPublicKey(keyString: string): crypto.KeyObject {
  let derB64 = keyString;
  if (derB64.includes(":")) {
    derB64 = derB64.split(":")[1];
  }
  return crypto.createPublicKey({
    key: Buffer.from(derB64, "base64"),
    format: "der",
    type: "spki",
  });
}

/**
 * Derives a 32-byte (256-bit) AES session key using ECDH (X25519 or P-256) + HKDF-SHA256
 */
export function deriveSessionKey(
  privateKeyStr: string,
  peerPublicKeyStr: string,
  salt: Buffer | string = DEFAULT_HKDF_SALT,
  info: string = DEFAULT_HKDF_INFO,
): Buffer {
  const privateKey = importPrivateKey(privateKeyStr);
  const peerPublicKey = importPublicKey(peerPublicKeyStr);

  const sharedSecret = crypto.diffieHellman({
    privateKey,
    publicKey: peerPublicKey,
  });

  const sessionKey = crypto.hkdfSync("sha256", sharedSecret, salt, info, 32);
  return Buffer.from(sessionKey);
}

/**
 * Encrypts an object or string with AES-256-GCM.
 * Returns a base64-encoded string representing the JSON envelope:
 * { version: 1, iv: "...", ciphertext: "...", tag: "..." }
 * (Which produces strings beginning with "eyJ2ZXJzaW9uIjoxLCJpdiI6IlFVRkRTVVJn...")
 */
export function encryptPayload(payload: string | object, sessionKey: Buffer): string {
  if (sessionKey.length !== 32) {
    throw new Error(`Invalid session key length: ${sessionKey.length} bytes (expected 32)`);
  }

  const plaintext = typeof payload === "string" ? payload : JSON.stringify(payload);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  const encryptedBuf = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: CiphertextEnvelope = {
    version: 1,
    iv: iv.toString("base64"),
    ciphertext: encryptedBuf.toString("base64"),
    tag: tag.toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

/**
 * Decrypts a base64-encoded ciphertext envelope with AES-256-GCM.
 * Parses the resulting decrypted string as JSON if requested.
 */
export function decryptPayload<T = unknown>(ciphertextB64: string, sessionKey: Buffer): T {
  if (sessionKey.length !== 32) {
    throw new Error(`Invalid session key length: ${sessionKey.length} bytes (expected 32)`);
  }

  // Handle potential quotes or clean whitespace
  const cleanB64 = ciphertextB64.trim().replace(/^["']|["']$/g, "");
  const decodedRaw = Buffer.from(cleanB64, "base64");

  let iv: Buffer;
  let ciphertext: Buffer;
  let tag: Buffer;

  // Check if base64 contains the JSON envelope
  try {
    const parsedEnvelope = JSON.parse(decodedRaw.toString("utf8")) as Record<string, unknown>;
    if (parsedEnvelope && typeof parsedEnvelope === "object") {
      const ivStr = (parsedEnvelope.iv ?? parsedEnvelope.nonce) as string;
      const dataStr = (parsedEnvelope.ciphertext ?? parsedEnvelope.data) as string;
      const tagStr = (parsedEnvelope.tag ?? parsedEnvelope.authTag) as string;

      if (ivStr && dataStr) {
        iv = Buffer.from(ivStr, "base64");
        ciphertext = Buffer.from(dataStr, "base64");
        tag = tagStr ? Buffer.from(tagStr, "base64") : Buffer.alloc(0);
      } else {
        throw new Error("Missing iv or ciphertext in JSON envelope");
      }
    } else {
      throw new Error("Invalid envelope format");
    }
  } catch {
    // Fallback: If ciphertext is raw concatenated bytes: iv (12) + ciphertext + tag (16)
    if (decodedRaw.length < 28) {
      throw new Error("Ciphertext too short to contain IV and auth tag");
    }
    iv = decodedRaw.subarray(0, 12);
    tag = decodedRaw.subarray(decodedRaw.length - 16);
    ciphertext = decodedRaw.subarray(12, decodedRaw.length - 16);
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey, iv);
  if (tag.length > 0) {
    decipher.setAuthTag(tag);
  }

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  try {
    return JSON.parse(decrypted) as T;
  } catch {
    return decrypted as unknown as T;
  }
}
