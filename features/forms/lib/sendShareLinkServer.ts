import "server-only";
import type { FormInstance, FormShareLink } from "@shared/lib/types";
import { FORM_INSTANCES_TABLE, SHARE_TOKENS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { rowToFormInstance, type FormInstanceRow } from "./formInstancesRowMap";
import type { ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import { formShareLinkToShareTokenState, shareTokenRowToFormShareLink } from "./formShareTokenMap";
import { buildShareEmail, type SendMode } from "./sendShareLink";
import { resendDeliver, resolveFromAddress, type EmailDeliverer } from "@shared/lib/resendDeliver";
import { isShareLinkActive } from "./shareLink";

// Re-exported so the route handler's test can keep importing the deliverer seam
// type from this module (the deliverer itself now lives in the shared module).
export type { EmailDeliverer };

/**
 * Server-only send path for the owner's manual "Send to client" / "Send reminder"
 * buttons (Forms P2 · Slice 5, issue #44). Reads RESEND_API_KEY / RESEND_FROM
 * server-side ONLY (never NEXT_PUBLIC_*), and the recipient email is supplied at
 * click time (we don't store it). Invoked from an authed route handler only.
 *
 * Graceful-by-design: with no RESEND_API_KEY the result is `{ ok: false,
 * reason: "unconfigured" }` so the caller's UI falls back to the Slice-2
 * mailto/copy flow — never a crash, never a block. Preview/dev/CI have no key, so
 * `unconfigured` is the path they exercise. Tests MOCK the Resend send (no real
 * email is ever sent in CI).
 */

export type SendShareLinkResult =
  | { ok: true; mode: SendMode; emailId: string | null }
  | {
      ok: false;
      reason: "unconfigured" | "not_found" | "revoked" | "invalid_email" | "send_failed";
    };

export type SendShareLinkArgs = {
  linkId: string;
  recipientEmail: string;
  mode: SendMode;
  /** Request origin (e.g. https://app…). The /f/<token> URL is built from this. */
  origin: string;
  /** Test seam: override the deliverer. Defaults to the real Resend SDK. */
  deliver?: EmailDeliverer;
};

/**
 * Send (or re-send) the share link by email, then stamp `sent_at` on success.
 * "Send reminder" reuses this with `mode: "reminder"` — a manual nudge, no cron.
 * `sent_at` is set on the first successful send and never cleared; a reminder
 * leaves it as-is (the original sent date is what the owner-tracking surface
 * counts "N days ago" from).
 */
export async function sendShareLinkEmail(args: SendShareLinkArgs): Promise<SendShareLinkResult> {
  // No key → tell the caller to fall back to mailto/copy. Check before any DB work.
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: "unconfigured" };

  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  // ADR 0022: the READ lives on the generalized `share_tokens` registry
  // (capability_type=form).
  const { data: linkRow, error: linkErr } = await sb
    .from(SHARE_TOKENS_TABLE)
    .select("*")
    .eq("id", args.linkId)
    .eq("capability_type", "form")
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!linkRow) return { ok: false, reason: "not_found" };

  const link: FormShareLink = shareTokenRowToFormShareLink(linkRow as ShareTokenRow);
  if (!isShareLinkActive(link)) return { ok: false, reason: "revoked" };

  const { data: instRow } = await sb
    .from(FORM_INSTANCES_TABLE)
    .select("*")
    .eq("id", link.instanceId)
    .maybeSingle();
  const instance: FormInstance | null = instRow
    ? rowToFormInstance(instRow as FormInstanceRow)
    : null;
  const formTitle = instance?.title?.trim() || "your form";

  const shareUrl = `${args.origin.replace(/\/$/, "")}/f/${link.token}`;
  const email = buildShareEmail({
    link,
    shareUrl,
    mode: args.mode,
    formTitle,
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

  // Stamp sent_at on the first successful send (idempotent — never overwritten,
  // so a reminder keeps the original sent date the owner counts from). sentAt
  // lives in the `share_tokens` state jsonb (the read path).
  if (link.sentAt === null) {
    const now = new Date().toISOString();
    await sb
      .from(SHARE_TOKENS_TABLE)
      .update({ state: formShareLinkToShareTokenState({ ...link, sentAt: now }) })
      .eq("id", link.id)
      .eq("capability_type", "form");
  }

  return { ok: true, mode: args.mode, emailId: result.id };
}
