import { describe, expect, it, vi } from "vitest";
import type { FormInstanceField } from "@shared/lib/types";
import { preResolveImages } from "./signoffImages";

function field(over: Partial<FormInstanceField> = {}): FormInstanceField {
  return {
    id: "f1",
    instanceId: "i1",
    label: "Photo",
    type: "photo",
    config: {},
    value: null,
    checked: null,
    note: null,
    photoUrl: "path/to/photo.png",
    sortOrder: 0,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...over,
  };
}

describe("preResolveImages — shared signoff image pre-resolution", () => {
  it("resolves photo + signature fields keyed by field id", async () => {
    const fields = [
      field({ id: "a", type: "photo", photoUrl: "a.png" }),
      field({ id: "b", type: "signature", photoUrl: "b.png" }),
    ];
    const resolve = vi.fn(async (path: string) => `signed:${path}`);
    const result = await preResolveImages(fields, resolve);
    expect(result).toEqual({ a: "signed:a.png", b: "signed:b.png" });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("ignores non-media fields and fields without a stored path", async () => {
    const fields = [
      field({ id: "text", type: "short_text", photoUrl: null }),
      field({ id: "empty", type: "photo", photoUrl: "" }),
      field({ id: "ok", type: "photo", photoUrl: "ok.png" }),
    ];
    const resolve = vi.fn(async (path: string) => `signed:${path}`);
    const result = await preResolveImages(fields, resolve);
    expect(result).toEqual({ ok: "signed:ok.png" });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("drops a field whose resolver throws (missing/expired image never aborts)", async () => {
    const fields = [
      field({ id: "good", type: "photo", photoUrl: "good.png" }),
      field({ id: "bad", type: "photo", photoUrl: "bad.png" }),
    ];
    const resolve = vi.fn(async (path: string) => {
      if (path === "bad.png") throw new Error("expired");
      return `signed:${path}`;
    });
    const result = await preResolveImages(fields, resolve);
    expect(result).toEqual({ good: "signed:good.png" });
  });

  it("drops a field whose resolver returns null", async () => {
    const fields = [
      field({ id: "good", type: "photo", photoUrl: "good.png" }),
      field({ id: "null", type: "photo", photoUrl: "null.png" }),
    ];
    const resolve = async (path: string) => (path === "null.png" ? null : `signed:${path}`);
    const result = await preResolveImages(fields, resolve);
    expect(result).toEqual({ good: "signed:good.png" });
  });

  it("returns an empty map when there are no media fields", async () => {
    const result = await preResolveImages(
      [field({ type: "checkbox", photoUrl: null })],
      async () => "x"
    );
    expect(result).toEqual({});
  });
});
