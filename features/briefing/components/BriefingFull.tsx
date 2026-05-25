import type { Briefing } from "@features/briefing/lib/types";
import { BriefingItemCard } from "./BriefingItemCard";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BriefingFull({ briefing }: { briefing: Briefing }) {
  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg px-5 py-4">
        <div className="text-micro uppercase tracking-wider text-text-tertiary mb-1">
          Summary · {formatTime(briefing.generated_at)}
        </div>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-line">
          {briefing.summary}
        </p>
        <div className="mt-3 text-xs text-text-tertiary">
          {briefing.jobs_considered} open jobs considered · {briefing.model} ·
          source: {briefing.source}
        </div>
      </div>

      {briefing.items.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-text-secondary">
          Nothing flagged today. Quiet shop.
        </div>
      ) : (
        <div className="space-y-2">
          {briefing.items.map((item, i) => (
            <BriefingItemCard key={`${item.job_id}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
