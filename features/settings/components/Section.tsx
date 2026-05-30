"use client";

import { cn } from "@shared/lib/utils";

/**
 * A floating settings card. Ghost-Border Rule: no border, separated from the
 * page by tonal step + resting shadow. Internal structure uses faint dividers.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface shadow-resting">
      <div className="px-5 py-4 md:px-6 md:py-5">
        <h2 className="font-serif text-title font-medium text-text-primary">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
        )}
      </div>
      <div className="border-t border-border-faint px-5 py-4 md:px-6 md:py-5">{children}</div>
    </section>
  );
}

/**
 * A read-only labelled value. Used for fields that are not yet editable
 * (rendered as display values, never fake-editable inputs).
 */
export function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-[0.06em] text-text-tertiary">{label}</dt>
      <dd
        className={cn("mt-1 text-sm text-text-primary", mono && "font-mono text-xs tabular-nums")}
      >
        {value}
      </dd>
    </div>
  );
}

/** Quiet caption noting a section is read-only for now. */
export function NotEditableNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-caption leading-relaxed text-text-tertiary">{children}</p>;
}
