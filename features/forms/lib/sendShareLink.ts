import type { FormShareLink } from "@shared/lib/types";

/**
 * Pure email-composition + eligibility helpers for the owner's manual
 * "Send to client" / "Send reminder" actions (Forms P2 · Slice 5, issue #44).
 *
 * Pure (no React, no Supabase, no Resend) so the wording + the reminder gate are
 * unit-testable under the node vitest env and reusable by both the server route
 * (which actually sends) and the SharePanel (which decides which button to show).
 *
 * Every email is an EXPLICIT owner click — there is no cron / auto path anywhere
 * in this feature. `mode` distinguishes the first send from a manual nudge.
 */

/** The Resend test sender — delivers only to the account owner until a domain is verified. */
export const DEFAULT_RESEND_FROM = "onboarding@resend.dev";

/** Which manual action produced this email. */
export type SendMode = "send" | "reminder";

export type ShareEmail = {
  subject: string;
  html: string;
  text: string;
};

export type BuildShareEmailArgs = {
  link: FormShareLink;
  shareUrl: string;
  mode: SendMode;
  /** The form instance's title, shown in the subject + body. */
  formTitle: string;
};

/** Minimal HTML-entity escape so a recipient name / title can never inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Compose the subject + HTML + plaintext for a share email. The plaintext body
 * is always present (deliverability + a clean fallback for text clients). Reminder
 * mode only changes the wording — the link + form are identical.
 */
export function buildShareEmail({
  link,
  shareUrl,
  mode,
  formTitle,
}: BuildShareEmailArgs): ShareEmail {
  const name = link.recipientName?.trim() || null;
  const greetingText = name ? `Hi ${name},` : "Hi,";
  const greetingHtml = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const titleSafe = escapeHtml(formTitle);

  const subject =
    mode === "reminder"
      ? `Reminder: please complete "${formTitle}"`
      : `Please complete "${formTitle}"`;

  const lead =
    mode === "reminder"
      ? `This is a friendly reminder to fill out the form below — it only takes a few minutes.`
      : `Please fill out the form at the link below — it only takes a few minutes.`;

  const text = [
    greetingText,
    "",
    lead,
    "",
    `${formTitle}: ${shareUrl}`,
    "",
    "Thanks,",
    "Good Woods",
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">`,
    `<p>${greetingHtml}</p>`,
    `<p>${lead}</p>`,
    `<p><a href="${escapeHtml(shareUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open “${titleSafe}”</a></p>`,
    `<p style="font-size:12px;color:#6b6b6b;">Or paste this link into your browser:<br>${escapeHtml(shareUrl)}</p>`,
    `<p>Thanks,<br>Good Woods</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}

/**
 * Whether a manual reminder makes sense for this link: it has been sent at least
 * once, and the recipient has neither submitted nor had the link revoked. Before
 * the first send the owner uses "Send to client", not a reminder.
 */
export function canSendReminder(link: FormShareLink): boolean {
  return link.sentAt !== null && link.submittedAt === null && link.revokedAt === null;
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
