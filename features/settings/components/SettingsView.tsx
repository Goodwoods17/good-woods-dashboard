"use client";

import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { ErrorBanner } from "./ErrorBanner";
import { StorageSection } from "./StorageSection";
import { RatesSection } from "./RatesSection";
import { CompanySection } from "./CompanySection";
import { TaxSection } from "./TaxSection";
import { ResetSection } from "./ResetSection";

export function SettingsView() {
  const { error } = useJobs();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Workspace"
        subtitle="Branding, tax, and storage."
      />
      <div className="px-8 py-6 max-w-3xl space-y-5">
        <ErrorBanner error={error} />
        <StorageSection />
        <RatesSection />
        <CompanySection />
        <TaxSection />
        <ResetSection />
      </div>
    </>
  );
}
