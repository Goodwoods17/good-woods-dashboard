/**
 * Pure, I/O-free helpers for QBO S8 — attach the source PDF to the pushed bill
 * (issue #154). No Supabase, no QBO API, no React. The server-side I/O that
 * actually downloads the file from Storage and uploads to QBO lives in
 * `qboAttachableServer.ts`.
 *
 * QBO Attachable upload pattern (POST /v3/company/{realmId}/upload):
 *   - Multipart form-data; two parts per file.
 *   - Part 1: `file_metadata_01` — application/json metadata with the EntityRef
 *     that links the attachment to the Bill.
 *   - Part 2: `file_content_01` — the raw file bytes with the correct MIME type.
 *
 * Defined here as testable pure functions so they can be validated without a live
 * QBO sandbox.
 */

/** One entry in `AttachableRef`. Always links to a `Bill`; we never re-send. */
export type AttachableEntityRef = {
  EntityRef: { type: "Bill"; value: string };
  IncludeOnSend: false;
};

/** JSON metadata sent as `file_metadata_01` in the QBO multipart upload. */
export type AttachableMetadata = {
  AttachableRef: AttachableEntityRef[];
  ContentType: string;
  FileName: string;
};

/**
 * Build the Attachable metadata JSON for the QBO `/upload` multipart request.
 *
 * The returned object should be serialised to JSON and sent as the
 * `file_metadata_01` part. `IncludeOnSend: false` keeps the PDF off
 * any automated emails QBO might send.
 */
export function buildAttachableMetadata(
  billId: string,
  fileName: string,
  contentType: string
): AttachableMetadata {
  return {
    AttachableRef: [
      {
        EntityRef: { type: "Bill", value: billId },
        IncludeOnSend: false,
      },
    ],
    ContentType: contentType,
    FileName: fileName,
  };
}

/**
 * Derive a human-readable filename for the QBO attachment from the storage path
 * and the stored MIME type.
 *
 * Storage paths are always `<invoiceId>/source.<ext>` (from `invoiceObjectPath`),
 * so the base name "source.*" is not meaningful to QBO. We normalise to
 * `invoice.<ext>` using the MIME type as the authoritative source of the
 * extension (set from File.type at upload time).
 */
/** Canonical MIME subtype → file extension overrides (where they differ). */
const MIME_EXT_OVERRIDES: Record<string, string> = {
  jpeg: "jpg",
  "x-png": "png",
  "vnd.ms-office": "doc",
};

export function buildAttachableFilename(storagePath: string, mime: string | null): string {
  // Derive extension: prefer mime (authoritative), fall back to path extension.
  let ext = "";
  if (mime) {
    const sub = mime.split("/")[1] ?? "";
    const normalized = sub.replace(/[^a-z0-9-]/gi, "").toLowerCase();
    ext = MIME_EXT_OVERRIDES[normalized] ?? normalized;
  }
  if (!ext) {
    // Fall back to path extension.
    const lastSegment = storagePath.split("/").pop() ?? "";
    const dotIdx = lastSegment.lastIndexOf(".");
    if (dotIdx !== -1) {
      const rawExt = lastSegment.slice(dotIdx + 1).replace(/[^a-z0-9]/gi, "").toLowerCase();
      ext = MIME_EXT_OVERRIDES[rawExt] ?? rawExt;
    }
  }
  return `invoice.${ext || "pdf"}`;
}

/**
 * Parse the QBO `/upload` response body to extract the created Attachable id.
 *
 * Response shape from QBO:
 * ```json
 * { "AttachableResponse": [{ "Attachable": { "Id": "123", ... } }] }
 * ```
 * Returns null when the structure is missing or the Id is absent.
 */
export function parseQboAttachableResponse(body: unknown): string | null {
  const resp = body as {
    AttachableResponse?: Array<{ Attachable?: { Id?: string } }>;
  } | null | undefined;
  return resp?.AttachableResponse?.[0]?.Attachable?.Id ?? null;
}
