/**
 * Pure, environment-free email-composition helpers for the owner's manual
 * "Send email" action on a document share link (S3, ADR 0022 · milestone #12).
 *
 * Pure (no React, no Supabase, no Resend) so the wording is unit-testable
 * under the node vitest env and reusable by both the server route (which
 * actually sends) and the DocumentShareSection (which decides which button to
 * show). Every send is an EXPLICIT owner click — there is no cron / auto path.
 */

/** The Resend test sender — delivers only to the account owner until a domain is verified. */
export const DEFAULT_RESEND_FROM = "onboarding@resend.dev";

/** How often the recipient wishes to hear from us (stored in state.notifyPreference). */
export type NotifyPreference = "everything" | "major" | "digest";

export const NOTIFY_PREF_LABELS: Record<NotifyPreference, string> = {
  everything: "All activity",
  major: "Major milestones only",
  digest: "Weekly digest",
};

export type ShareEmail = {
  subject: string;
  html: string;
  text: string;
};

export type BuildDocumentShareEmailArgs = {
  recipientName: string | null;
  /** The job name used in the subject + body. Derived server-side; never client-supplied. */
  jobName: string;
  shareUrl: string;
};

/** Minimal HTML-entity escape so values can never inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Compose the subject + HTML + plaintext for a document share email. The
 * plaintext body is always present (deliverability + a clean fallback for
 * text clients).
 */
export function buildDocumentShareEmail({
  recipientName,
  jobName,
  shareUrl,
}: BuildDocumentShareEmailArgs): ShareEmail {
  const name = recipientName?.trim() || null;
  const greetingText = name ? `Hi ${name},` : "Hi,";
  const greetingHtml = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const titleSafe = escapeHtml(jobName);
  const urlSafe = escapeHtml(shareUrl);

  const subject = `Project documents ready: ${jobName}`;
  const lead = `Your project documents for ${jobName} are ready to view at the link below.`;
  const leadHtml = `Your project documents for <strong>${titleSafe}</strong> are ready to view.`;

  const text = [
    greetingText,
    "",
    lead,
    "",
    `View documents: ${shareUrl}`,
    "",
    "Thanks,",
    "Good Woods",
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">`,
    `<p>${greetingHtml}</p>`,
    `<p>${leadHtml}</p>`,
    `<p><a href="${urlSafe}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View documents</a></p>`,
    `<p style="font-size:12px;color:#6b6b6b;">Or paste this link into your browser:<br>${urlSafe}</p>`,
    `<p>Thanks,<br>Good Woods</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}

/** A deliberately permissive client-side sanity check — the real validation is Resend's. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** The from address: RESEND_FROM if set, else the Resend onboarding test sender. */
export function resolveFromAddress(envFrom: string | undefined | null): string {
  const trimmed = envFrom?.trim();
  return trimmed ? trimmed : DEFAULT_RESEND_FROM;
}
