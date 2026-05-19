"use client";

import { COMPANY } from "@features/jobs/lib/invoice";
import { Section, Field } from "./Section";

export function CompanySection() {
  return (
    <Section title="Company">
      <Field label="Name" value={COMPANY.name} />
      <Field label="Tagline" value={COMPANY.tagline} />
      <Field label="Address" value={COMPANY.address} />
      <Field label="Email" value={COMPANY.email} />
      <Field label="GST" value={COMPANY.gstNumber} mono />
      <p className="text-xs text-text-tertiary col-span-2 mt-1">
        Editing company details lands in M3 alongside the catalog and tax-rate
        UI.
      </p>
    </Section>
  );
}
