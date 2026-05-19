"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { cn } from "@shared/lib/utils";
import { Section } from "./Section";

export function ResetSection() {
  const { resetToSeed } = useJobs();
  const [confirming, setConfirming] = useState(false);

  return (
    <Section title="Reset">
      <p className="text-sm text-text-secondary col-span-2 mb-3 leading-relaxed">
        Resetting reloads the original 6 seed jobs and erases any edits,
        cost-line changes, and activity history. On Supabase this also wipes
        the cloud table. Cannot be undone.
      </p>
      <div className="col-span-2">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium",
              "text-text-secondary hover:border-status-blocked hover:text-status-blocked transition-colors duration-fast"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reset to seed jobs
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-status-blocked-soft border border-status-blocked/30 rounded-md p-3">
            <span className="text-sm text-status-blocked flex-1">
              Reset will erase all edits. This cannot be undone.
            </span>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-sm rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors duration-fast"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await resetToSeed();
                setConfirming(false);
              }}
              className="px-3 py-1.5 text-sm rounded-md bg-status-blocked text-white hover:opacity-90 transition-opacity duration-fast"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
