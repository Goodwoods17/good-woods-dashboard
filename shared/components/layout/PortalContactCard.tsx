import { Phone, Mail } from "lucide-react";

/**
 * The "Questions? Who to call" card shared by the no-login client portals
 * (document view `/d`, document request `/d` upload). Renders the contact name
 * plus tappable tel:/mailto: chips. The contact is always server-derived from
 * the job (never client-supplied). Renders nothing when there is no name and no
 * way to reach anyone, so callers can pass the raw server value without guarding.
 */
export function PortalContactCard({
  contact,
}: {
  contact: { name?: string | null; phone?: string | null; email?: string | null };
}) {
  const name = contact.name?.trim() || null;
  const phone = contact.phone?.trim() || null;
  const email = contact.email?.trim() || null;
  if (!name && !phone && !email) return null;

  return (
    <section
      data-testid="portal-contact"
      className="mt-8 rounded-2xl border border-border bg-surface p-5 text-center shadow-resting"
    >
      <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
        Questions? Who to call
      </p>
      {name ? <p className="mt-1 text-sm font-medium text-text-primary">{name}</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary duration-fast hover:text-text-primary"
          >
            <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
            {phone}
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary duration-fast hover:text-text-primary"
          >
            <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
            {email}
          </a>
        ) : null}
      </div>
    </section>
  );
}
