import { describe, it, expect } from "vitest";
import { validateUploadFile, isPdf, MAX_UPLOAD_BYTES } from "./upload";

describe("validateUploadFile", () => {
  it("accepts a PDF under the cap", () => {
    expect(validateUploadFile({ type: "application/pdf", size: 1024 })).toEqual({ ok: true });
  });
  it("accepts a JPEG under the cap", () => {
    expect(validateUploadFile({ type: "image/jpeg", size: 1024 })).toEqual({ ok: true });
  });
  it("rejects an unsupported type", () => {
    const r = validateUploadFile({ type: "text/plain", size: 10 });
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason");
  });
  it("rejects a file over the cap", () => {
    const r = validateUploadFile({ type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});

describe("isPdf", () => {
  it("true for application/pdf", () => expect(isPdf("application/pdf")).toBe(true));
  it("false for images and null", () => {
    expect(isPdf("image/png")).toBe(false);
    expect(isPdf(null)).toBe(false);
  });
});
