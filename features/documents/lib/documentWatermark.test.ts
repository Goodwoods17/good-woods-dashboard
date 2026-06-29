import { deflateSync, crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Build a real, valid RGB PNG of the given size (a flat light-grey fill) so the
// image-watermark page is large enough for pdfjs to extract the stamped text —
// a 1×1 image yields a 1pt page pdfjs treats as empty.
function makePng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "latin1");
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // colour type 2 = truecolour RGB
  const raw = Buffer.alloc(height * (1 + width * 3), 0xdd);
  for (let y = 0; y < height; y++) raw[y * (1 + width * 3)] = 0; // filter byte per scanline
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Uint8Array.from(
    Buffer.concat([
      sig,
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}
import {
  buildWatermarkText,
  buildPortalFileUrl,
  classifyWatermarkTarget,
  watermarkPdf,
  watermarkImagePdf,
} from "./documentWatermark";

// pdf-lib flate-compresses page content streams, so the stamped text is not
// searchable in the raw bytes — extract it the way a viewer would (pdfjs) to
// prove the recipient name actually rendered onto the page.
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " ";
  }
  return out;
}

// S4 (issue #215) — render-time dynamic watermark for the no-login document view
// portal. The watermark is stamped into the RENDERED bytes on each request; the
// stored object is never mutated. These tests pin the pure pieces: the stamp text,
// the per-doc portal URL, the MIME classifier, and that the pdf-lib stamp actually
// injects the recipient text into the output bytes (round-trip parse + literal
// search of the uncompressed content stream).

describe("buildWatermarkText", () => {
  it("stamps recipient · date · Good Woods when a recipient is known", () => {
    const text = buildWatermarkText("E2E Test Client", new Date("2026-06-29T12:00:00Z"));
    expect(text).toBe("E2E Test Client · 2026-06-29 · Good Woods");
  });

  it("falls back to date · Good Woods when no recipient is set", () => {
    expect(buildWatermarkText(null, new Date("2026-06-29T00:00:00Z"))).toBe(
      "2026-06-29 · Good Woods"
    );
    expect(buildWatermarkText("   ", new Date("2026-06-29T00:00:00Z"))).toBe(
      "2026-06-29 · Good Woods"
    );
  });
});

describe("buildPortalFileUrl", () => {
  it("points at the token-scoped portal file route and encodes both ids", () => {
    expect(buildPortalFileUrl("tok abc", "52d00000-0000-4000-8000-000000000001")).toBe(
      "/api/documents/portal/tok%20abc/file/52d00000-0000-4000-8000-000000000001"
    );
  });
});

describe("classifyWatermarkTarget", () => {
  it("recognises PDFs and images, and marks everything else passthrough", () => {
    expect(classifyWatermarkTarget("application/pdf", "x.pdf")).toBe("pdf");
    expect(classifyWatermarkTarget(null, "drawing.PDF")).toBe("pdf");
    expect(classifyWatermarkTarget("image/png", "p.png")).toBe("image");
    expect(classifyWatermarkTarget("image/jpeg", "p.jpg")).toBe("image");
    expect(classifyWatermarkTarget(null, "photo.JPEG")).toBe("image");
    expect(classifyWatermarkTarget("application/octet-stream", "tool.nc")).toBe("passthrough");
  });
});

async function makeBlankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Kitchen elevations original", {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });
  return pdf.save();
}

describe("watermarkPdf", () => {
  it("injects the recipient text into the rendered bytes and stays a valid PDF", async () => {
    const original = await makeBlankPdf();
    const text = buildWatermarkText("E2E Test Client", new Date("2026-06-29T00:00:00Z"));

    const stamped = await watermarkPdf(original, text);

    // Still a parseable PDF with the same page count (we overlay, never re-paginate).
    const reparsed = await PDFDocument.load(stamped);
    expect(reparsed.getPageCount()).toBe(1);

    // The recipient name actually renders onto the page (not just an overlay div).
    const rendered = await extractPdfText(stamped);
    expect(rendered).toContain("E2E Test Client");
    expect(rendered).toContain("Good Woods");

    // The stored original carried no such text → the stamp is render-time only.
    expect(await extractPdfText(original)).not.toContain("E2E Test Client");
  });
});

describe("watermarkImagePdf", () => {
  it("wraps an image in a watermarked single-page PDF", async () => {
    const text = buildWatermarkText("E2E Test Client", new Date("2026-06-29T00:00:00Z"));
    const png = makePng(240, 180);
    const out = await watermarkImagePdf(png, "image/png", text);

    const reparsed = await PDFDocument.load(out);
    expect(reparsed.getPageCount()).toBe(1);
    // The page is sized to the embedded image (the photo is preserved, not cropped).
    expect(Math.round(reparsed.getPage(0).getWidth())).toBe(240);
    expect(await extractPdfText(out)).toContain("E2E Test Client");
  });
});
