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
  const { items, pieces } = useJobProgress(DEMO_JOB_ID);
  // Provide the timeline's item picker with both job_items and pieces so workers
  // can attach notes/photos to any trackable item (slice 4 adds pieces).
  const pickerItems = useMemo(
    () => [
      ...items.map((i) => ({ id: i.id, label: i.label })),
      ...pieces.map((p) => ({ id: p.id, label: p.label })),
    ],
    [items, pieces]
  );

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
