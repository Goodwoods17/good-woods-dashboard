import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_TOKEN,
  MAX_TOTAL_BYTES_PER_TOKEN,
  checkUploadAllowed,
  type UploadUsage,
} from "./uploadQuota";

const zero: UploadUsage = { count: 0, totalBytes: 0 };

describe("checkUploadAllowed — per-file size + per-token count/byte quota", () => {
  it("allows a normal first upload", () => {
    expect(checkUploadAllowed(1_000_000, zero)).toEqual({ ok: true });
  });

  it("rejects an empty file (0 bytes)", () => {
    const r = checkUploadAllowed(0, zero);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("rejects a file over the per-file byte limit (413)", () => {
    const r = checkUploadAllowed(MAX_UPLOAD_BYTES + 1, zero);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("too_large");
      expect(r.status).toBe(413);
    }
  });

  it("allows a file exactly at the per-file limit", () => {
    expect(checkUploadAllowed(MAX_UPLOAD_BYTES, zero).ok).toBe(true);
  });

  it("rejects once the per-token upload COUNT is exhausted (429)", () => {
    const usage: UploadUsage = { count: MAX_UPLOADS_PER_TOKEN, totalBytes: 10 };
    const r = checkUploadAllowed(100, usage);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("count_quota");
      expect(r.status).toBe(429);
    }
  });

  it("rejects when this file would push total bytes over the per-token cap (413)", () => {
    const usage: UploadUsage = { count: 1, totalBytes: MAX_TOTAL_BYTES_PER_TOKEN - 50 };
    const r = checkUploadAllowed(100, usage);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("total_quota");
      expect(r.status).toBe(413);
    }
  });

  it("allows a file that lands exactly on the per-token byte cap", () => {
    const usage: UploadUsage = { count: 1, totalBytes: MAX_TOTAL_BYTES_PER_TOKEN - 100 };
    expect(checkUploadAllowed(100, usage).ok).toBe(true);
  });

  it("treats a non-finite / negative size as empty (never trusts the number)", () => {
    expect(checkUploadAllowed(NaN, zero).ok).toBe(false);
    expect(checkUploadAllowed(-5, zero).ok).toBe(false);
  });
});
