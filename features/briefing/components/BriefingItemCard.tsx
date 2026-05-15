import type { BriefingItem } from "@features/briefing/lib/types";
import Link from "next/link";
import { cn } from "@shared/lib/utils";

const SEVERITY_STYLES = {
  red: "border-l-status-blocked bg-status-blocked-soft",
  yellow: "border-l-status-at-risk bg-status-at-risk-soft",
  green: "border-l-status-on-track bg-status-on-track-soft",
} as const;

const SEVERITY_LABEL = {
  red: "Action today",
  yellow: "Watch",
  green: "Heads up",
} as const;

export function BriefingItemCard({ item }: { item: BriefingItem }) {
  return (
    <Link
      href={`/jobs/${item.job_id}`}
      className={cn(
        "block rounded-lg border-l-4 border border-border bg-surface px-4 py-3 hover:bg-surface-muted transition-colors duration-fast",
        SEVERITY_STYLES[item.severity]
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-text-primary">
          {item.headline}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary shrink-0">
          {SEVERITY_LABEL[item.severity]}
        </div>
      </div>
      <div className="mt-1 text-xs text-text-secondary">
        <span className="font-mono">{item.job_code}</span>
        <span className="mx-1.5 text-text-tertiary">·</span>
        <span>{item.job_name}</span>
        <span className="mx-1.5 text-text-tertiary">·</span>
        <span>{item.client}</span>
      </div>
      <div className="mt-2 text-sm text-text-secondary leading-relaxed">
        {item.reason}
      </div>
      <div className="mt-2 text-sm text-text-primary">
        <span className="text-text-tertiary text-xs uppercase tracking-wider mr-2">
          Do:
        </span>
        {item.suggested_action}
      </div>
    </Link>
  );
}
