"use client";

import { COMPANY } from "@features/jobs/lib/invoice";
import { Section, Field, NotEditableNote } from "./Section";

export function CompanySection() {
  return (
    <Section title="Company" description="Branding shown on quotes and invoices.">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Name" value={COMPANY.name} />
        <Field label="Tagline" value={COMPANY.tagline} />
        <Field label="Address" value={COMPANY.address} />
        <Field label="Email" value={COMPANY.email} />
        <Field label="GST number" value={COMPANY.gstNumber} mono />
      </dl>
      <NotEditableNote>
        Not yet editable. Editing company details lands alongside the catalog and tax-rate UI.
      </NotEditableNote>
    </Section>
  );
}
