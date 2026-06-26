"use client";

import { useMemo } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobProgress } from "../lib/jobProgressStore";
import { JobStatusTab } from "./JobStatusTab";
import { ItemTimeline } from "./ItemTimeline";

// Slice-1 tracer: a single demo job proves the live status cycle end-to-end.
// The owner live board across all jobs lands in slice 5.
export const DEMO_JOB_ID = "job-status-demo";

export function StatusBoardView() {
  const { items } = useJobProgress(DEMO_JOB_ID);
  // Provide the timeline's item picker with the current job's items so workers
  // can attach notes/photos without needing to know item IDs.
  const pickerItems = useMemo(() => items.map((i) => ({ id: i.id, label: i.label })), [items]);

  return (
    <div>
      <PageHeader
        eyebrow="Live job status"
        title="Job progress"
        subtitle="Tap an item to advance its status — changes persist and sync live."
      />
      <JobStatusTab jobId={DEMO_JOB_ID} />
      <ItemTimeline jobId={DEMO_JOB_ID} items={pickerItems} />
    </div>
  );
}
