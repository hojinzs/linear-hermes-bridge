import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plaintext: string, key: Buffer): string {
  if (!plaintext || plaintext.length === 0) {
    throw new Error("plaintext must be non-empty");
  }
  if (key.length !== 32) {
    throw new Error("key must be 32 bytes");
  }
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(nonce || tag || ciphertext)
  return Buffer.concat([nonce, tag, ct]).toString("base64");
}

export function decrypt(payload: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("key must be 32 bytes");
  }
  const buf = Buffer.from(payload, "base64");
  if (buf.length < NONCE_LEN + TAG_LEN + 1) {
    throw new Error("ciphertext too short");
  }
  const nonce = buf.subarray(0, NONCE_LEN);
  const tag = buf.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const ct = buf.subarray(NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
