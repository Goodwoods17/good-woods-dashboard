import { describe, it, expect } from "vitest";
import { generateCapabilityToken } from "./capabilityToken";

describe("generateCapabilityToken", () => {
  it("mints an opaque token of at least 32 url-safe chars", () => {
    const t = generateCapabilityToken();
    // 32 random bytes → 43 base64url chars (no padding), comfortably >= 32.
    expect(t.length).toBeGreaterThanOrEqual(32);
    // base64url alphabet only: A–Z a–z 0–9 - _  (no +, /, or = padding).
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is effectively unique across many mints (no collisions in 1000)", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateCapabilityToken()));
    expect(tokens.size).toBe(1000);
  });
});
