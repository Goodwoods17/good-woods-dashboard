import { NextResponse, type NextRequest } from "next/server";
import { loadPortalDocumentFile } from "@features/documents/lib/documentWatermarkServer";
import { projectFilesEnabled } from "@shared/lib/projectFilesFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The bytes are watermarked per-recipient at view time and ride a short-lived
// capability — never cache them.
export const fetchCache = "force-no-store";

/**
 * Public, no-login file route for the document VIEW portal (S4, issue #215). The
 * portal's "Open" button points here; the server downloads the stored object,
 * stamps the recipient name + date into the RENDERED bytes (pdf-lib), and streams
 * the result inline — the stored file is never mutated. Authenticated staff views
 * never touch this route (they fetch the raw object directly), so they are
 * unaffected. The render happens on click, so it never blocks the portal's first
 * paint. Gated by the feature flag so prod stays dormant until the owner flips it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string; docId: string } }
) {
  if (!projectFilesEnabled()) return new NextResponse(null, { status: 404 });

  const result = await loadPortalDocumentFile(params.token, params.docId);
  if (!result.ok) return new NextResponse(null, { status: result.status });

  // Uint8Array → ArrayBuffer slice keeps the body a valid BodyInit for the runtime.
  const body = result.bytes.buffer.slice(
    result.bytes.byteOffset,
    result.bytes.byteOffset + result.bytes.byteLength
  ) as ArrayBuffer;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Watermark": result.watermarked ? "applied" : "none",
    },
  });
}
