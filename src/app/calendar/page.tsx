"use client";

import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { CalendarView } from "@features/calendar/components/CalendarView";

export default function CalendarPage() {
  const { jobs, loading } = useJobs();

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Install schedule"
        subtitle="Every install date across the active pipeline."
      />
      <div className="px-8 py-6">
        {loading ? (
          <div className="bg-surface border border-border rounded-lg h-96 animate-pulse" />
        ) : (
          <CalendarView jobs={jobs} />
        )}
      </div>
    </>
  );
}
