"use client";

import type { Job, Activity } from "@/lib/types";
import {
  ArrowRightCircle,
  Heart,
  Coins,
  DollarSign,
  CircleDot,
  StickyNote,
  CheckCircle2,
} from "lucide-react";

const ICON: Record<Activity["kind"], typeof ArrowRightCircle> = {
  pipeline_changed: ArrowRightCircle,
  health_changed: Heart,
  milestone_advanced: CircleDot,
  cost_edited: Coins,
  revenue_edited: DollarSign,
  task_completed: CheckCircle2,
  note: StickyNote,
};

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

export function ActivityTab({ job }: { job: Job }) {
  const activity = [...(job.activity ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (activity.length === 0) {
    return (
      <div className="bg-surface border border-border border-dashed rounded-lg p-10 text-center max-w-3xl">
        <div className="text-sm font-medium text-text-primary mb-1">
          No activity yet
        </div>
        <p className="text-sm text-text-secondary">
          As you change pipeline status, health, or costs, every move is logged here.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <ol className="bg-surface border border-border rounded-lg overflow-hidden">
        {activity.map((entry) => {
          const Icon = ICON[entry.kind] ?? StickyNote;
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0"
            >
              <div className="mt-0.5 h-7 w-7 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary">{entry.message}</div>
                <div className="text-xs text-text-tertiary mt-0.5">
                  {relative(entry.timestamp)} · {entry.actor}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
