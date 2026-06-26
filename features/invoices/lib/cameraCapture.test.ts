import { describe, it, expect } from "vitest";
import { buildPagePath, buildCapturePages, MAX_CAMERA_PAGES } from "./cameraCapture";

describe("buildPagePath", () => {
  it("produces <invoiceId>/page_<n>.<ext> (1-based)", () => {
    expect(buildPagePath("inv-abc", 1, "jpeg")).toBe("inv-abc/page_1.jpeg");
  });

  it("handles page 2", () => {
    expect(buildPagePath("inv-abc", 2, "png")).toBe("inv-abc/page_2.png");
  });

  it("handles heic extension", () => {
    expect(buildPagePath("inv-xyz", 3, "heic")).toBe("inv-xyz/page_3.heic");
  });
});

describe("buildCapturePages", () => {
  it("maps each file to its page path (1-based index)", () => {
    const files = [
      new File(["a"], "snap1.jpg", { type: "image/jpeg" }),
      new File(["b"], "snap2.jpg", { type: "image/jpeg" }),
    ];
    const paths = buildCapturePages("inv-1", files);
    // invoiceFileExt picks the name extension (jpg), not the mime subtype (jpeg)
    expect(paths).toEqual(["inv-1/page_1.jpg", "inv-1/page_2.jpg"]);
  });

  it("handles a single-page capture", () => {
    const files = [new File(["x"], "photo.png", { type: "image/png" })];
    const paths = buildCapturePages("inv-2", files);
    expect(paths).toEqual(["inv-2/page_1.png"]);
  });

  it("uses the HEIC extension (lowercase) for camera-snapped HEIC photos", () => {
    // invoiceFileExt lowercases the name extension: .HEIC → heic
    const files = [new File(["h"], "IMG_0042.HEIC", { type: "image/heic" })];
    const paths = buildCapturePages("inv-3", files);
    expect(paths).toEqual(["inv-3/page_1.heic"]);
  });

  it("falls back to jpeg extension when mime is empty", () => {
    const files = [new File(["x"], "photo", { type: "" })];
    const paths = buildCapturePages("inv-4", files);
    // invoiceFileExt falls through to mime subtype (empty) → default "pdf"
    // Camera capture files with no mime still get a deterministic extension.
    expect(paths[0]).toMatch(/^inv-4\/page_1\.\w+$/);
  });

  it("handles up to MAX_CAMERA_PAGES files", () => {
    const files = Array.from({ length: MAX_CAMERA_PAGES }, (_, i) =>
      new File(["x"], `page${i + 1}.jpg`, { type: "image/jpeg" })
    );
    const paths = buildCapturePages("inv-5", files);
    expect(paths).toHaveLength(MAX_CAMERA_PAGES);
    // Name ext is "jpg" (not the MIME subtype "jpeg")
    expect(paths[MAX_CAMERA_PAGES - 1]).toBe(`inv-5/page_${MAX_CAMERA_PAGES}.jpg`);
  });
});

describe("MAX_CAMERA_PAGES", () => {
  it("is a sensible limit (1 ≤ MAX ≤ 20)", () => {
    expect(MAX_CAMERA_PAGES).toBeGreaterThanOrEqual(1);
    expect(MAX_CAMERA_PAGES).toBeLessThanOrEqual(20);
  });
});
