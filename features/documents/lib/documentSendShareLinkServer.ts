import "server-only";
import { SHARE_TOKENS_TABLE, DOCUMENTS_TABLE, JOBS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { rowToShareToken, type ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import { buildDocumentShareEmail, resolveFromAddress } from "./documentSendShareLink";

/**
 * Server-only send path for the owner's manual "Send email" button on a
 * document share link (S3, ADR 0022 · milestone #12). Reads RESEND_API_KEY /
 * RESEND_FROM server-side ONLY (never NEXT_PUBLIC_*), and the recipient email
 * is supplied at click time (not stored on the row). Invoked from an authed
 * route handler only.
 *
 * Graceful-by-design: with no RESEND_API_KEY the result is `{ ok: false,
 * reason: "unconfigured" }` so the caller's UI falls back to the mailto/copy
 * flow — never a crash, never a block. Preview/dev/CI have no key, so
 * "unconfigured" is the path they exercise. Tests mock the deliver() seam (no
 * real email ever sent in CI).
 *
 * `sent_at` is stored in `state.sentAt` (the share_tokens state jsonb carries
 * type-specific bits, ADR 0022 locked-decision-2). It is set on the FIRST
 * successful send and never cleared (idempotent — a re-send leaves sentAt
 * as the original date so the owner's "first sent" tracking is preserved).
 */

/** Indirection so the route handler can mock the actual Resend call in tests. */
export type EmailDeliverer = (args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<{ id: string | null; error: string | null }>;

/** The real Resend deliverer. Lazy-imports the SDK so it never hits the client bundle. */
async function resendDeliver(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ id: string | null; error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { id: null, error: "unconfigured" };
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (error) return { id: null, error: error.message ?? "send failed" };
  return { id: data?.id ?? null, error: null };
}

export type SendDocumentShareLinkResult =
  | { ok: true; emailId: string | null }
  | {
      ok: false;
      reason: "unconfigured" | "not_found" | "revoked" | "invalid_email" | "send_failed";
    };

export type SendDocumentShareLinkArgs = {
  shareTokenId: string;
  recipientEmail: string;
  /** Request origin (e.g. https://app…). The /d/<token> URL is built from this. */
  origin: string;
  /** Test seam: override the deliverer. Defaults to the real Resend SDK. */
  deliver?: EmailDeliverer;
};

/**
 * Send the document share link by email, then record state.sentAt on the first
 * successful send. Re-sends are idempotent — sentAt is never overwritten (the
 * "first sent" date the owner tracks is preserved).
 */
export async function sendDocumentShareLinkEmail(
  args: SendDocumentShareLinkArgs
): Promise<SendDocumentShareLinkResult> {
  // No key → tell the caller to fall back to mailto/copy. Check before any DB work.
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: "unconfigured" };

  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  // Load the share token by its UUID id (not the opaque token string — the
  // owner knows the UUID from having minted the link).
  const { data: tokenRow, error: tokenErr } = await sb
    .from(SHARE_TOKENS_TABLE)
    .select("*")
    .eq("id", args.shareTokenId)
    .eq("capability_type", "document_view")
    .maybeSingle();
  if (tokenErr) throw tokenErr;
  if (!tokenRow) return { ok: false, reason: "not_found" };

  const share = rowToShareToken(tokenRow as ShareTokenRow);
  if (share.revokedAt !== null) return { ok: false, reason: "revoked" };
  if (!share.documentId) return { ok: false, reason: "not_found" };

  // Derive the job name from the document → job chain (service-role read scoped
  // to just the display fields — never `*`).
  const { data: docRow } = await sb
    .from(DOCUMENTS_TABLE)
    .select("project_id")
    .eq("id", share.documentId)
    .maybeSingle();
  const jobId = (docRow as { project_id?: string | null } | null)?.project_id ?? null;

  let jobName = "Your project";
  if (jobId) {
    const { data: jobRow } = await sb
      .from(JOBS_TABLE)
      .select("name")
      .eq("id", jobId)
      .maybeSingle();
    jobName = (jobRow as { name?: string | null } | null)?.name?.trim() || jobName;
  }

  const shareUrl = `${args.origin.replace(/\/$/, "")}/d/${share.token}`;
  const email = buildDocumentShareEmail({
    recipientName: share.recipientName,
    jobName,
    shareUrl,
  });

  const deliver = args.deliver ?? resendDeliver;
  const from = resolveFromAddress(process.env.RESEND_FROM);
  const result = await deliver({
    from,
    to: args.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (result.error) {
    if (result.error === "unconfigured") return { ok: false, reason: "unconfigured" };
    return { ok: false, reason: "send_failed" };
  }

  // Stamp state.sentAt on the FIRST successful send (idempotent — never
  // overwritten on a re-send so the owner's "first sent" tracking is preserved).
  const alreadySent = typeof share.state.sentAt === "string";
  if (!alreadySent) {
    const now = new Date().toISOString();
    await sb
      .from(SHARE_TOKENS_TABLE)
      .update({ state: { ...share.state, sentAt: now } })
      .eq("id", share.id);
  }

  return { ok: true, emailId: result.id };
}
