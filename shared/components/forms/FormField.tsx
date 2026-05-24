"use client";

/**
 * Cross-feature form primitives. Used inside a {@link Modal} body (or
 * any vertical form layout) to compose labeled inputs. The Field's label
 * is an all-caps eyebrow per DESIGN.md §3.2 label scale.
 *
 * Previously lived alongside the Modal shell at
 * `features/shop/components/Modal.tsx`; promoted to shared 2026-05-24.
 */

export function FieldStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    />
  );
}
