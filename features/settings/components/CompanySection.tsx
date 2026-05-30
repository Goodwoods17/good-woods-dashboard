"use client";

import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import { Section, EditableField } from "./Section";

export function CompanySection() {
  const { settings, updateCompany } = useWorkspaceSettings();
  const { company } = settings;

  return (
    <Section title="Company" description="Branding shown on quotes and invoices.">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <EditableField
          label="Name"
          value={company.name}
          onChange={(v) => updateCompany({ name: v })}
        />
        <EditableField
          label="Tagline"
          value={company.tagline}
          onChange={(v) => updateCompany({ tagline: v })}
        />
        <EditableField
          label="Address"
          value={company.address}
          onChange={(v) => updateCompany({ address: v })}
        />
        <EditableField
          label="Email"
          type="email"
          value={company.email}
          onChange={(v) => updateCompany({ email: v })}
        />
        <EditableField
          label="GST number"
          value={company.gstNumber}
          onChange={(v) => updateCompany({ gstNumber: v })}
          mono
        />
      </div>
    </Section>
  );
}
