import { NextResponse, type NextRequest } from "next/server";
import { handleDesignerUpload } from "@features/documents/lib/documentRequestServer";
import { projectFilesEnabled } from "@shared/lib/projectFilesFlag";
import { createRateLimiter } from "@shared/lib/rateLimit";
import { MAX_UPLOAD_BYTES } from "@features/documents/lib/uploadQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Public, no-login WRITE route for the designer UPLOAD portal (S11, ADR 0022 ·
 * milestone #12) — a token holder POSTs ONE requested file here and it lands in
 * the job. This route is thin: gate the flag, throttle, parse the multipart body
 * with a hard byte ceiling, then hand the RECEIVED bytes to
 * `handleDesignerUpload`, which owns every security gate (service-role-only,
 * capability-type assertion, revoked RE-check before the write, magic-byte sniff,
 * per-file size + per-token quota, server-generated path with upsert:false).
 *
 * Gated by NEXT_PUBLIC_PROJECT_FILES_ENABLED — when off the route 404s so prod
 * stays dormant until the owner flips the flag.
 */

// Best-effort per-instance throttle (the durable per-token quota lives in the DB).
// 10 uploads / minute / key is generous for a human dropping files, tight for a
// script hammering a leaked token.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  if (!projectFilesEnabled()) return new NextResponse(null, { status: 404 });

  const ip = clientIp(request);
  // Throttle on token + IP so neither a single leaked token nor a single IP can
  // flood the route.
  const gate = limiter.check(`${params.token}:${ip}`);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
    );
  }

  // Hard ceiling on the declared body size — reject obviously oversized bodies
  // before reading them (the byte-accurate check happens again on the real bytes).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 1_048_576) {
    return NextResponse.json({ ok: false, error: "File is too large." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 });
  }

  const rawIndex = form.get("requestIndex");
  const parsedIndex =
    typeof rawIndex === "string" && rawIndex.trim() !== "" ? Number(rawIndex) : NaN;
  const requestIndex = Number.isInteger(parsedIndex) ? parsedIndex : null;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await handleDesignerUpload({
    token: params.token,
    bytes,
    clientFilename: file.name,
    requestIndex,
    ip,
    ua: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      submissionId: result.submissionId,
      documentId: result.documentId,
      filename: result.filename,
      status: result.checklist.status,
      outstandingCount: result.checklist.outstandingCount,
    },
    { status: 201 }
  );
}
