"use client";

import { useId } from "react";
import { cn } from "@shared/lib/utils";

/**
 * A floating settings card. Ghost-Border Rule: no border, separated from the
 * page by tonal step + resting shadow. Internal structure uses faint dividers.
 */
export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Anchor target so deep links like `/settings#quickbooks` scroll here. */
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl bg-surface shadow-resting">
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

/** Editable text/number setting. Calls onChange on every keystroke. */
export function EditableField({
  label,
  value,
  onChange,
  type = "text",
  prefix,
  suffix,
  mono,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "number";
  prefix?: string;
  suffix?: string;
  mono?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="text-label uppercase tracking-[0.06em] text-text-tertiary">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        {prefix && <span className="text-sm text-text-tertiary">{prefix}</span>}
        <input
          id={id}
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "min-h-[40px] w-full rounded-lg bg-surface-muted px-3 text-sm text-text-primary transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
            mono && "font-mono tabular-nums"
          )}
        />
        {suffix && <span className="text-sm text-text-tertiary">{suffix}</span>}
      </div>
      {hint && <p className="mt-1.5 text-caption leading-snug text-text-tertiary">{hint}</p>}
    </label>
  );
}
