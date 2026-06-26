import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FormInstance, FormShareLink } from "@shared/lib/types";
import { FORM_INSTANCES_TABLE, FORM_SHARE_LINKS_TABLE } from "@shared/lib/supabase";
import { rowToFormShareLink, type FormShareLinkRow } from "./formShareLinksRowMap";
import { rowToFormInstance, type FormInstanceRow } from "./formInstancesRowMap";
import { buildShareEmail, resolveFromAddress, type SendMode } from "./sendShareLink";
import { isShareLinkActive } from "./shareLink";

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

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

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

  const sb = getServiceClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  const { data: linkRow, error: linkErr } = await sb
    .from(FORM_SHARE_LINKS_TABLE)
    .select("*")
    .eq("id", args.linkId)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!linkRow) return { ok: false, reason: "not_found" };

  const link: FormShareLink = rowToFormShareLink(linkRow as FormShareLinkRow);
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
  // so a reminder keeps the original sent date the owner counts from).
  if (link.sentAt === null) {
    const now = new Date().toISOString();
    await sb.from(FORM_SHARE_LINKS_TABLE).update({ sent_at: now }).eq("id", link.id);
  }

  return { ok: true, mode: args.mode, emailId: result.id };
}
