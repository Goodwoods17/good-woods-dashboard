import type { BriefingItem, BriefingSeverity } from "@features/briefing/lib/types";
import Link from "next/link";
import { StatusDot } from "@shared/components/ui/StatusDot";
import type { HealthStatus } from "@shared/lib/types";

const SEVERITY_LABEL = {
  red: "Action today",
  yellow: "Watch",
  green: "Heads up",
} as const;

const SEVERITY_TO_STATUS: Record<BriefingSeverity, HealthStatus> = {
  red: "blocked",
  yellow: "at_risk",
  green: "on_track",
};

export function BriefingItemCard({ item }: { item: BriefingItem }) {
  const isRelationship = item.kind === "relationship";
  const href = isRelationship
    ? `/crm/${item.contact_id ?? item.job_id}`
    : `/jobs/${item.job_id}`;

  return (
    <Link
      href={href}
      className="block rounded-lg bg-surface p-4 shadow-resting hover:shadow-hover transition-shadow duration-fast"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <StatusDot status={SEVERITY_TO_STATUS[item.severity]} size="lg" />
          <div className="text-sm font-semibold text-text-primary">
            {item.headline}
          </div>
        </div>
        <div className="text-micro uppercase tracking-wider text-text-tertiary shrink-0">
          {SEVERITY_LABEL[item.severity]}
        </div>
      </div>
      <div className="mt-1 text-xs text-text-secondary">
        {isRelationship ? (
          <>
            <span className="text-text-tertiary uppercase tracking-wider text-[10px] font-medium">
              Relationship
            </span>
            <span className="mx-1.5 text-text-tertiary">·</span>
            <span>{item.contact_name ?? item.client}</span>
          </>
        ) : (
          <>
            <span className="font-mono">{item.job_code}</span>
            <span className="mx-1.5 text-text-tertiary">·</span>
            <span>{item.job_name}</span>
            <span className="mx-1.5 text-text-tertiary">·</span>
            <span>{item.client}</span>
          </>
        )}
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
