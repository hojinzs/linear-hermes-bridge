import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./encryption.js";

describe("encryption", () => {
  const key = randomBytes(32);

  it("round trips a string", () => {
    const ct = encrypt("hello world", key);
    expect(decrypt(ct, key)).toBe("hello world");
  });

  it("produces different ciphertext for same plaintext (random nonce)", () => {
    const a = encrypt("same", key);
    const b = encrypt("same", key);
    expect(a).not.toBe(b);
  });

  it("rejects decryption with wrong key", () => {
    const ct = encrypt("secret", key);
    const wrong = randomBytes(32);
    expect(() => decrypt(ct, wrong)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const ct = encrypt("secret", key);
    const tampered = `${ct.slice(0, -2)}aa`;
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("rejects empty plaintext", () => {
    expect(() => encrypt("", key)).toThrow();
  });

  it("supports unicode", () => {
    expect(decrypt(encrypt("한글テスト🔐", key), key)).toBe("한글テスト🔐");
  });
});
