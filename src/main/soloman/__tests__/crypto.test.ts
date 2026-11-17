import { describe, it, expect } from "vitest";
import {
  generateIdentityKeys,
  generateEphemeralKeyPair,
  deriveSessionKey,
  encryptPayload,
  decryptPayload,
} from "../crypto";

describe("Soloman Crypto", () => {
  it("generates valid Ed25519 and X25519 identity keys with proper prefixes", () => {
    const keys = generateIdentityKeys();

    expect(keys.signingPublicKey.startsWith("ed25519:")).toBe(true);
    expect(keys.signingPrivateKey.startsWith("ed25519-priv:")).toBe(true);
    expect(keys.encryptionPublicKey.startsWith("x25519:")).toBe(true);
    expect(keys.encryptionPrivateKey.startsWith("x25519-priv:")).toBe(true);
  });

  it("derives the identical 32-byte session key on both sides using ECDH + HKDF", () => {
    const hostKeys = generateEphemeralKeyPair("x25519");
    const mobileKeys = generateEphemeralKeyPair("x25519");

    const hostSessionKey = deriveSessionKey(hostKeys.privateKey, mobileKeys.publicKey);
    const mobileSessionKey = deriveSessionKey(mobileKeys.privateKey, hostKeys.publicKey);

    expect(hostSessionKey.length).toBe(32);
    expect(mobileSessionKey.length).toBe(32);
    expect(hostSessionKey.equals(mobileSessionKey)).toBe(true);
  });

  it("supports P-256 key agreement as well", () => {
    const hostKeys = generateEphemeralKeyPair("p256");
    const mobileKeys = generateEphemeralKeyPair("p256");

    const hostSessionKey = deriveSessionKey(hostKeys.privateKey, mobileKeys.publicKey);
    const mobileSessionKey = deriveSessionKey(mobileKeys.privateKey, hostKeys.publicKey);

    expect(hostSessionKey.length).toBe(32);
    expect(hostSessionKey.equals(mobileSessionKey)).toBe(true);
  });

  it("encrypts and decrypts application payloads using AES-256-GCM with base64 envelope", () => {
    const hostKeys = generateEphemeralKeyPair("x25519");
    const mobileKeys = generateEphemeralKeyPair("x25519");
    const sessionKey = deriveSessionKey(hostKeys.privateKey, mobileKeys.publicKey);

    const message = {
      protocolVersion: 1,
      kind: "request",
      messageId: "a90184b2-c124-42b7-87cf-4519f7a8310c",
      messageType: "chat.prompt",
      payload: {
        workspaceId: "workspace_landing_page",
        chatId: "chat_session_491",
        prompt: "Run unit tests and fix any failing assertions in auth module.",
      },
    };

    const ciphertext = encryptPayload(message, sessionKey);
    expect(typeof ciphertext).toBe("string");

    // Decoded base64 should be a JSON envelope containing version, iv, ciphertext, tag
    const decodedRaw = Buffer.from(ciphertext, "base64").toString("utf8");
    const envelope = JSON.parse(decodedRaw) as {
      version: number;
      iv: string;
      ciphertext: string;
      tag: string;
    };
    expect(envelope.version).toBe(1);
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.ciphertext).toBe("string");
    expect(typeof envelope.tag).toBe("string");

    // Decrypt
    const decrypted = decryptPayload<typeof message>(ciphertext, sessionKey);
    expect(decrypted).toEqual(message);
  });

  it("fails to decrypt if ciphertext is corrupted or tag is tampered", () => {
    const keys = generateEphemeralKeyPair("x25519");
    const sessionKey = deriveSessionKey(keys.privateKey, keys.publicKey);

    const ciphertext = encryptPayload("Hello World", sessionKey);
    const decodedRaw = Buffer.from(ciphertext, "base64").toString("utf8");
    const envelope = JSON.parse(decodedRaw) as {
      version: number;
      iv: string;
      ciphertext: string;
      tag: string;
    };

    // Tamper with ciphertext bytes
    envelope.ciphertext = Buffer.from("corrupted").toString("base64");
    const tamperedB64 = Buffer.from(JSON.stringify(envelope)).toString("base64");

    expect(() => decryptPayload(tamperedB64, sessionKey)).toThrow();
  });
});
