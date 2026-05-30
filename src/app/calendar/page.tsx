"use client";

import { PageHeader } from "@shared/components/layout/PageHeader";
import { CalendarView } from "@features/calendar/components/CalendarView";

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Install calendar"
        subtitle="Every scheduled install, color-coded by health. Drag to reschedule."
        actions={null}
      />
      <div className="px-4 py-6 md:px-8">
        <CalendarView />
      </div>
    </>
  );
}
