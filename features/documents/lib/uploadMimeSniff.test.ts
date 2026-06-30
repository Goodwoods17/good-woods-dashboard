import { describe, it, expect } from "vitest";
import {
  sniffMime,
  isAllowedUploadMime,
  ALLOWED_UPLOAD_MIME_TYPES,
  uploadExtensionFor,
} from "./uploadMimeSniff";

/** Build a byte array from a signature prefix, padded to a usable length. */
function bytesFrom(prefix: number[], len = 64): Uint8Array {
  const out = new Uint8Array(len);
  out.set(prefix.slice(0, len));
  return out;
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // %PDF-1.4
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];

/** RIFF....WEBP — the WEBP container: "RIFF" + 4 size bytes + "WEBP". */
function webp(): Uint8Array {
  const out = new Uint8Array(32);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  out.set([0x00, 0x00, 0x00, 0x00], 4); // size (ignored)
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return out;
}

describe("sniffMime — magic-byte detection (never trusts client file.type)", () => {
  it("detects a real PDF by its %PDF header", () => {
    expect(sniffMime(bytesFrom(PDF))).toBe("application/pdf");
  });

  it("detects a real PNG by its 8-byte signature", () => {
    expect(sniffMime(bytesFrom(PNG))).toBe("image/png");
  });

  it("detects a real JPEG by its FF D8 FF header", () => {
    expect(sniffMime(bytesFrom(JPEG))).toBe("image/jpeg");
  });

  it("detects a real WEBP by RIFF....WEBP", () => {
    expect(sniffMime(webp())).toBe("image/webp");
  });

  it("returns null for an unknown / spoofed binary (e.g. an MZ executable)", () => {
    // A Windows PE/EXE starts with "MZ" — a classic spoof: named .png, mislabeled
    // image/png by the client, but the bytes are an executable.
    expect(sniffMime(bytesFrom([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it("returns null for empty / too-short input", () => {
    expect(sniffMime(new Uint8Array(0))).toBeNull();
    expect(sniffMime(new Uint8Array([0x25]))).toBeNull();
  });

  it("does NOT mistake a RIFF that is not WEBP (e.g. a WAV) for an image", () => {
    const wav = new Uint8Array(32);
    wav.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE, not WEBP
    expect(sniffMime(wav)).toBeNull();
  });
});

describe("isAllowedUploadMime — the sniffed type must be on the allow-list", () => {
  it("accepts every allow-listed type", () => {
    for (const m of ALLOWED_UPLOAD_MIME_TYPES) expect(isAllowedUploadMime(m)).toBe(true);
  });

  it("rejects a null sniff and any non-listed type", () => {
    expect(isAllowedUploadMime(null)).toBe(false);
    expect(isAllowedUploadMime("application/octet-stream")).toBe(false);
    expect(isAllowedUploadMime("text/html")).toBe(false);
  });
});

describe("uploadExtensionFor — server-chosen extension from the SNIFFED type", () => {
  it("maps each sniffed type to a safe extension", () => {
    expect(uploadExtensionFor("application/pdf")).toBe("pdf");
    expect(uploadExtensionFor("image/png")).toBe("png");
    expect(uploadExtensionFor("image/jpeg")).toBe("jpg");
    expect(uploadExtensionFor("image/webp")).toBe("webp");
  });
});
