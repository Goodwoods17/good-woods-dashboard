"use client";

import { useMemo } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import type { Job } from "@shared/lib/types";
import { groupByInstallBucket } from "@features/installer/lib/buckets";
import { InstallGroup } from "./InstallGroup";

export function InstallerView() {
  const { jobs, updateJob } = useJobs();

  const groups = useMemo(() => {
    const today = new Date();
    return groupByInstallBucket(jobs, today);
  }, [jobs]);

  function markInstalled(job: Job) {
    updateJob(job.id, {
      pipelineStatus: "complete",
      healthStatus: "complete",
      currentMilestone: "install",
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Installer Portal"
        title="Today on site"
        subtitle="Pinned to today, optimised for phone. Tap an address to navigate."
      />
      <div className="px-4 md:px-8 py-6 max-w-3xl space-y-6">
        <InstallGroup title="Today" jobs={groups.today} onComplete={markInstalled} tone="today" />
        <InstallGroup title="This week" jobs={groups.this_week} onComplete={markInstalled} />
        <InstallGroup
          title="Coming up"
          jobs={groups.later}
          onComplete={markInstalled}
          tone="muted"
        />
        {groups.past.length > 0 && (
          <InstallGroup
            title="Past due: install date passed but not marked complete"
            jobs={groups.past}
            onComplete={markInstalled}
            tone="past"
          />
        )}
      </div>
    </>
  );
}
