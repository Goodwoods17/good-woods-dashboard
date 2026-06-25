import { describe, it, expect } from "vitest";
import { formFileExt, formPhotoPath, resolveFormPhotoUrl, uploadSignaturePng } from "./storage";

describe("formFileExt", () => {
  it("uses the extension from the file name", () => {
    expect(formFileExt({ name: "site.JPG", type: "image/jpeg" })).toBe("jpg");
  });
  it("falls back to the mime subtype when the name has no extension", () => {
    expect(formFileExt({ name: "capture", type: "image/png" })).toBe("png");
  });
  it("defaults to jpg when nothing is known", () => {
    expect(formFileExt({ name: "blob", type: "" })).toBe("jpg");
  });
});

describe("formPhotoPath", () => {
  it("is instanceId/fieldId.<ext>", () => {
    expect(formPhotoPath("i1", "f9", { name: "Kitchen.png", type: "image/png" })).toBe("i1/f9.png");
  });
});

describe("resolveFormPhotoUrl (offline fallback)", () => {
  it("passes a data: URL straight through", async () => {
    const dataUrl = "data:image/png;base64,AAAA";
    expect(await resolveFormPhotoUrl(dataUrl)).toBe(dataUrl);
  });
  it("passes an http URL straight through", async () => {
    const url = "https://example.com/x.png";
    expect(await resolveFormPhotoUrl(url)).toBe(url);
  });
});

describe("uploadSignaturePng (offline fallback)", () => {
  it("returns the data URL unchanged when Supabase is absent", async () => {
    // The node test env has no NEXT_PUBLIC_SUPABASE_* vars → hasSupabase() is
    // false, so the signature PNG round-trips as its inline data URL.
    const dataUrl = "data:image/png;base64,SIGNATURE";
    const result = await uploadSignaturePng("i1", "f1", dataUrl);
    expect(result.storagePath).toBe(dataUrl);
  });
});
