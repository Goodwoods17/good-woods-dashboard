"use client";

import { TAX_RATE } from "@features/jobs/lib/invoice";
import { Section, Field, NotEditableNote } from "./Section";

export function TaxSection() {
  return (
    <Section title="Tax" description="Applied to quotes and invoices by default.">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Default rate" value={`${(TAX_RATE * 100).toFixed(0)}%`} mono />
        <Field label="Region" value="British Columbia (5% GST + 7% PST)" />
      </dl>
      <NotEditableNote>
        Not yet editable. The rate is fixed for BC for now. If a client outside BC needs a different
        rate, this becomes a per-job setting.
      </NotEditableNote>
    </Section>
  );
}
