"use client";

import { cn } from "@shared/lib/utils";

export function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-1.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
      />
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  step,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string | number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? "0.01"}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={cn(
        "w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:border-border-strong",
        className
      )}
    />
  );
}

export function Sub({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

export function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-2 last:mb-0">
      <span
        className={cn("text-sm", muted ? "text-text-tertiary" : "text-text-secondary")}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums",
          muted ? "text-text-tertiary" : "text-text-primary font-medium"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Category input — free-text with suggestions ────────────────────────
// Uses native <datalist> for cross-browser autocomplete. Free typing wins:
// suggestions appear but never block what the user types.

export function CategoryInput({
  value,
  onChange,
  suggestions,
  listId,
  placeholder = "Category",
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  listId: string;
  placeholder?: string;
}) {
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm bg-surface-muted border border-border rounded-md px-2 py-1 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
