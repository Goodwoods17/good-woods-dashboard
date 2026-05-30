"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/utils";
import { getStaleness } from "@features/catalog/lib/priceHistory";

/**
 * Auto-growing text cell: wraps long values onto extra lines (growing the row
 * taller) instead of forcing the column wider. This is how the catalog keeps
 * its width fixed while staying fully readable.
 */
export function AutoText({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full resize-none overflow-hidden break-words rounded-md bg-transparent px-2 py-1 text-sm leading-snug text-text-primary placeholder:text-text-tertiary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft",
        className
      )}
    />
  );
}

/** Numeric cell. Shows a formatted value at rest, raw number while editing. */
export function NumCell({
  value,
  onChange,
  step = "0.01",
  fmt,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
  fmt?: (n: number) => string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <input
      type={editing ? "number" : "text"}
      inputMode="decimal"
      step={step}
      value={editing ? value : fmt ? fmt(value) : String(value)}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={cn(
        "w-full rounded-md bg-transparent px-2 py-1 text-right text-sm tabular-nums text-text-primary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft",
        className
      )}
    />
  );
}

/** Quiet price-age flag driven by getStaleness. */
export function StaleChip({ iso }: { iso: string }) {
  const chip = getStaleness(iso);
  if (!chip || chip.level === "fresh") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-micro tabular-nums",
        chip.level === "ageing"
          ? "bg-status-at-risk-soft text-status-at-risk"
          : "bg-status-blocked-soft text-status-blocked"
      )}
      title={`Price last updated ${chip.label}`}
    >
      {chip.label}
    </span>
  );
}
