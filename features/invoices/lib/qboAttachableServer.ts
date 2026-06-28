/**
 * Server-only I/O for QBO S8 — attach the source PDF to the pushed QBO Bill
 * (issue #154). SERVICE-ROLE only; never import from a client component.
 *
 * Sequence:
 *   1. Download the invoice file from the private `invoices` Supabase Storage
 *      bucket using the service-role client (bypasses RLS).
 *   2. POST a multipart upload to QBO's `/upload` endpoint with two parts:
 *      `file_metadata_01` (Attachable JSON with EntityRef linking to the Bill)
 *      `file_content_01` (the raw file bytes).
 *   3. Return a typed `AttachmentResult` — never throws.
 *
 * Failure is NON-BLOCKING by design: the push result carries the attachment
 * status, but a failed attachment does NOT undo a successful bill push.
 */
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { type QboEnvironment } from "./qboOAuth";
import { qboFetch } from "./qboClient";
import { INVOICES_BUCKET } from "./storage";
import {
  buildAttachableMetadata,
  buildAttachableFilename,
  parseQboAttachableResponse,
} from "./qboAttachable";

/** Typed outcome of an attachment attempt. */
export type AttachmentResult =
  | { status: "attached"; attachableId: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

/**
 * Download the source file from the private invoices Storage bucket via the
 * service-role client (no signed URL needed — the service role bypasses RLS).
 * Returns null when the client is unconfigured or the download fails.
 */
async function downloadInvoiceFile(
  storagePath: string
): Promise<{ blob: Blob; contentType: string } | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(INVOICES_BUCKET).download(storagePath);
  if (error || !data) return null;
  // Supabase returns a Blob; its .type is the stored content-type or '' when unknown.
  const contentType = data.type || "application/octet-stream";
  return { blob: data, contentType };
}

/**
 * Upload the file as a QBO Attachable linked to the given Bill.
 * Returns the created Attachable id on success; throws on a non-2xx response.
 */
async function uploadQboAttachable(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  billId: string,
  fileBlob: Blob,
  fileName: string,
  contentType: string
): Promise<string> {
  const metadata = buildAttachableMetadata(billId, fileName, contentType);

  const formData = new FormData();
  // Part 1: Attachable metadata JSON.
  formData.append(
    "file_metadata_01",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  // Part 2: raw file bytes (filename hint helps QBO set FileName on its side).
  formData.append("file_content_01", fileBlob, fileName);

  // A FormData body is passed straight through so `fetch` sets the multipart
  // boundary itself; `qboFetch` deliberately omits Content-Type for it.
  const res = await qboFetch({
    accessToken,
    realmId,
    environment,
    path: "upload",
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QBO upload failed: ${res.status} ${text.slice(0, 300)}`);
  }

  const responseBody = await res.json();
  const attachableId = parseQboAttachableResponse(responseBody);
  if (!attachableId) {
    throw new Error("QBO upload succeeded but returned no Attachable id");
  }
  return attachableId;
}

/**
 * Attach the invoice's source PDF (or image) to an already-created QBO Bill.
 *
 * Degrades gracefully at every failure point — returns a typed `AttachmentResult`
 * rather than throwing. This lets the caller include the attachment status in the
 * push response without making it a blocking gate.
 */
export async function attachInvoicePdfToQboBill(params: {
  storagePath: string;
  mime: string | null;
  billId: string;
  realmId: string;
  environment: QboEnvironment;
  accessToken: string;
}): Promise<AttachmentResult> {
  const { storagePath, mime, billId, realmId, environment, accessToken } = params;

  // 1. Download from private Storage (service role).
  let downloaded: { blob: Blob; contentType: string } | null;
  try {
    downloaded = await downloadInvoiceFile(storagePath);
  } catch (e) {
    return {
      status: "error",
      message: `Storage download failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!downloaded) {
    return { status: "skipped", reason: "source file not available in storage" };
  }

  const { blob, contentType } = downloaded;
  const fileName = buildAttachableFilename(storagePath, mime ?? contentType);

  // 2. Upload to QBO as an Attachable.
  try {
    const attachableId = await uploadQboAttachable(
      accessToken,
      realmId,
      environment,
      billId,
      blob,
      fileName,
      contentType
    );
    return { status: "attached", attachableId };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
