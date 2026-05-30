"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { Section } from "./Section";

export function ResetSection() {
  const { resetToSeed } = useJobs();
  const [confirming, setConfirming] = useState(false);

  return (
    <Section
      title="Reset to seed"
      description="Reloads the original 6 seed jobs and erases every edit, cost-line change, and activity entry. On Supabase this also wipes the cloud table. This cannot be undone."
    >
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-status-blocked-soft px-4 text-sm font-medium text-status-blocked transition-colors duration-fast hover:bg-status-blocked hover:text-white focus:outline-none focus:ring-2 focus:ring-accent-soft"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
          Reset to seed jobs
        </button>
      ) : (
        <div className="rounded-xl bg-status-blocked-soft p-4">
          <p className="text-sm font-medium text-status-blocked">
            Reset will erase all edits. This cannot be undone.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={async () => {
                await resetToSeed();
                setConfirming(false);
              }}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-status-blocked px-5 text-sm font-medium text-white transition-opacity duration-fast hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-soft"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
              Yes, reset everything
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-surface px-4 text-sm font-medium text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover focus:outline-none focus:ring-2 focus:ring-accent-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
