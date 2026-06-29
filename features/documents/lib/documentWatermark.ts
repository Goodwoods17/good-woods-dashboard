import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Render-time dynamic watermark for the no-login document VIEW portal (S4, issue
 * #215 · milestone #12). The recipient name + date is stamped into the RENDERED
 * bytes every time a drawing is opened through `/d/<token>` — the stored Storage
 * object is NEVER mutated (the server downloads it, overlays in memory, and
 * streams the result). This deters redistribution of proprietary shop drawings:
 * a leaked copy carries the name of whoever it was shared with.
 *
 * Pure (no service client, no `server-only`) so the stamping is unit-testable
 * without a DB or a browser. The server module `documentWatermarkServer.ts` wires
 * these to the token-scoped download. Applies ONLY to the portal — authenticated
 * staff views fetch the raw object directly and are unaffected.
 */

/** What kind of overlay a document supports, from its MIME / filename. */
export type WatermarkTarget = "pdf" | "image" | "passthrough";

/** The diagonal stamp colour — a muted ink, kept low-opacity so it never hides line work. */
const STAMP_COLOR = rgb(0.42, 0.42, 0.42);
const STAMP_OPACITY = 0.16;

/** Build the human-readable stamp: "{recipient} · {YYYY-MM-DD} · Good Woods". */
export function buildWatermarkText(recipientName: string | null | undefined, at: Date): string {
  const day = at.toISOString().slice(0, 10);
  const who = recipientName?.trim();
  return who ? `${who} · ${day} · Good Woods` : `${day} · Good Woods`;
}

/** The token-scoped portal file route a portal "Open" button points at. */
export function buildPortalFileUrl(token: string, docId: string): string {
  return `/api/documents/portal/${encodeURIComponent(token)}/file/${encodeURIComponent(docId)}`;
}

/** Decide how to watermark a document from its stored MIME and storage path. */
export function classifyWatermarkTarget(
  mime: string | null | undefined,
  path: string | null | undefined
): WatermarkTarget {
  const m = (mime ?? "").toLowerCase();
  const p = (path ?? "").toLowerCase();
  if (m.includes("pdf") || p.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(p)) {
    return "image";
  }
  return "passthrough";
}

/**
 * Tile the stamp diagonally across one page so the whole drawing is covered (a
 * single corner stamp is trivially cropped out). Low-opacity, rotated 45°.
 */
function stampPage(page: PDFPage, font: PDFFont, text: string): void {
  const { width, height } = page.getSize();
  const size = Math.max(11, Math.min(width, height) * 0.028);
  const textWidth = font.widthOfTextAtSize(text, size);
  // Spacing keyed to the stamp's own size so density is consistent across page sizes.
  const stepX = textWidth + size * 4;
  const stepY = size * 9;
  for (let y = -stepY; y < height + stepY; y += stepY) {
    // Offset alternate rows so the grid reads as a wash, not stacked columns.
    const rowOffset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -textWidth; x < width + stepX; x += stepX) {
      page.drawText(text, {
        x: x - rowOffset,
        y,
        size,
        font,
        color: STAMP_COLOR,
        opacity: STAMP_OPACITY,
        rotate: degrees(45),
      });
    }
  }
}

/**
 * Overlay the watermark onto every page of a PDF and return new bytes. The page
 * tree, original content, and page count are preserved — we only add a content
 * stream per page. Encrypted PDFs are loaded leniently (we can't re-encrypt, but
 * a stamped copy is still better than passing the raw object through).
 */
export async function watermarkPdf(bytes: Uint8Array, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) stampPage(page, font, text);
  // Uncompressed object streams keep the stamped text searchable for the smoke
  // (and add negligible size for the small drawings this serves).
  return pdf.save({ useObjectStreams: false });
}

/**
 * Wrap a raster image in a single-page PDF sized to the image, then stamp it.
 * pdf-lib has no native image canvas, so the watermark rides on a PDF page over
 * the embedded image — same render-time, never-stored guarantee, and the
 * recipient's browser opens it inline like any other drawing.
 */
export async function watermarkImagePdf(
  bytes: Uint8Array,
  mime: string,
  text: string
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const isPng = mime.toLowerCase().includes("png");
  const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  stampPage(page, font, text);
  return pdf.save({ useObjectStreams: false });
}
