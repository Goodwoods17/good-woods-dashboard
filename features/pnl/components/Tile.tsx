"use client";

import { cn } from "@shared/lib/utils";

export function Tile({
  label,
  value,
  sub,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2 flex items-center gap-2">
        {label}
        {icon}
      </div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          valueClass ?? "text-text-primary"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-text-tertiary mt-1.5">{sub}</div>}
    </div>
  );
}
