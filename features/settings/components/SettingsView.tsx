"use client";

import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { ErrorBanner } from "./ErrorBanner";
import { Section } from "./Section";
import { StorageSection } from "./StorageSection";
import { RatesSection } from "./RatesSection";
import { CompanySection } from "./CompanySection";
import { TaxSection } from "./TaxSection";
import { ResetSection } from "./ResetSection";
import { TradeRegistryEditor } from "@features/partners/components/TradeRegistryEditor";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { ConnectQuickBooksPanel } from "@features/invoices/components/ConnectQuickBooksPanel";
import { QboMappingPanel } from "@features/invoices/components/QboMappingPanel";

export function SettingsView() {
  const { error } = useJobs();

  return (
    <>
      <PageHeader eyebrow="Settings" title="Workspace" subtitle="Branding, tax, and storage." />
      <div className="max-w-3xl space-y-5 px-4 py-6 md:px-8">
        <ErrorBanner error={error} />
        <StorageSection />
        <RatesSection />
        <Section
          title="Trades"
          description="The disciplines you assign subtrades to. Reorder, recolour, set their icon, mark which are suggested on new projects, or add your own."
        >
          <TradeRegistryEditor />
        </Section>
        <CompanySection />
        <TaxSection />
        {invoicesQboEnabled() && (
          <Section
            title="QuickBooks"
            description="Connect your QuickBooks company so posted invoices can sync as bills."
          >
            <ConnectQuickBooksPanel />
          </Section>
        )}
        {invoicesQboEnabled() && (
          <Section
            title="QuickBooks accounts & taxes"
            description="Map your expense accounts and confirm the per-company GST/PST tax codes so posted invoices can sync as bills."
          >
            <QboMappingPanel />
          </Section>
        )}
        <ResetSection />
      </div>
    </>
  );
}
