"use client";

import { TAX_RATE } from "@features/jobs/lib/invoice";
import { Section, Field } from "./Section";

export function TaxSection() {
  return (
    <Section title="Tax">
      <Field label="Default rate" value={`${(TAX_RATE * 100).toFixed(0)}%`} />
      <Field label="Region" value="British Columbia (5% GST + 7% PST)" />
    </Section>
  );
}
