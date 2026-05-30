"use client";

import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import { Section, EditableField } from "./Section";

export function TaxSection() {
  const { settings, update } = useWorkspaceSettings();

  // Stored as a fraction (0.12); shown and edited as a percent (12).
  const pct = (settings.taxRate * 100).toFixed((settings.taxRate * 100) % 1 === 0 ? 0 : 2);

  return (
    <Section title="Tax" description="Applied to quotes and invoices by default.">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <EditableField
          label="Default rate"
          type="number"
          value={pct}
          onChange={(v) => update({ taxRate: (Number(v) || 0) / 100 })}
          suffix="%"
          mono
          hint="BC default is 12% (5% GST + 7% PST)."
        />
      </div>
    </Section>
  );
}
