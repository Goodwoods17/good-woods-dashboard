import "server-only";

/**
 * The single server-only Resend delivery seam, shared by every "send a share
 * link" path (Forms `/f`, Documents `/d`). Was copy-pasted verbatim in
 * `features/forms/lib/sendShareLinkServer.ts` and
 * `features/documents/lib/documentSendShareLinkServer.ts`; hoisted here so the
 * lazy SDK import, the unconfigured guard, and the from-address resolution live
 * in exactly one place. Server-only: the `resend` SDK must never reach the
 * client bundle.
 */

/** The Resend test sender — delivers only to the account owner until a domain is verified. */
export const DEFAULT_RESEND_FROM = "onboarding@resend.dev";

/** Indirection so a route handler can mock the actual Resend call in tests. */
export type EmailDeliverer = (args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<{ id: string | null; error: string | null }>;

/** The real Resend deliverer. Lazy-imports the SDK so it never hits the client bundle. */
export async function resendDeliver(args: {
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

/** The from address: RESEND_FROM if set, else the Resend onboarding test sender. */
export function resolveFromAddress(envFrom: string | undefined | null): string {
  const trimmed = envFrom?.trim();
  return trimmed ? trimmed : DEFAULT_RESEND_FROM;
}
