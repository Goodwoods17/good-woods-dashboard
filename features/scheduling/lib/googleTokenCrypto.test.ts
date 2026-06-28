import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, tokenEncryptionConfigured } from "./googleTokenCrypto";

const SECRET = "test-secret-key-do-not-use-in-prod-0000000000";

describe("googleTokenCrypto", () => {
  it("round-trips a refresh token through encrypt → decrypt", () => {
    const plain = "1//refresh-token-abc.def_GHI-jkl";
    const cipher = encryptToken(plain, SECRET);
    expect(cipher).not.toContain(plain); // never stores the raw token
    expect(decryptToken(cipher, SECRET)).toBe(plain);
  });

  it("produces a different ciphertext each call (random IV) but both decrypt back", () => {
    const plain = "same-token";
    const a = encryptToken(plain, SECRET);
    const b = encryptToken(plain, SECRET);
    expect(a).not.toBe(b);
    expect(decryptToken(a, SECRET)).toBe(plain);
    expect(decryptToken(b, SECRET)).toBe(plain);
  });

  it("rejects a tampered ciphertext (GCM auth tag fails)", () => {
    const cipher = encryptToken("secret", SECRET);
    const parts = cipher.split(".");
    // Flip a character in the ciphertext segment.
    const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + "AA"].join(".");
    expect(() => decryptToken(tampered, SECRET)).toThrow();
  });

  it("fails to decrypt with the wrong secret", () => {
    const cipher = encryptToken("secret", SECRET);
    expect(() => decryptToken(cipher, "a-different-secret")).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptToken("not-a-valid-payload", SECRET)).toThrow();
  });

  it("reports configured only when a non-empty secret env is present", () => {
    expect(tokenEncryptionConfigured(undefined)).toBe(false);
    expect(tokenEncryptionConfigured("")).toBe(false);
    expect(tokenEncryptionConfigured("   ")).toBe(false);
    expect(tokenEncryptionConfigured("a-real-secret")).toBe(true);
  });
});
