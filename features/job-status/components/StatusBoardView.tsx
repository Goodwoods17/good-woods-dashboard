"use client";

import { PageHeader } from "@shared/components/layout/PageHeader";
import { JobStatusTab } from "./JobStatusTab";

// Slice-1 tracer: a single demo job proves the live status cycle end-to-end.
// The owner live board across all jobs lands in slice 5.
export const DEMO_JOB_ID = "job-status-demo";

export function StatusBoardView() {
  return (
    <div>
      <PageHeader
        eyebrow="Live job status"
        title="Job progress"
        subtitle="Tap an item to advance its status — changes persist and sync live."
      />
      <JobStatusTab jobId={DEMO_JOB_ID} />
    </div>
  );
}
