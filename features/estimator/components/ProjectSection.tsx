"use client";

import { ContactCombobox } from "@features/contacts/components/ContactCombobox";
import { FieldInput } from "./inputs";

export function ProjectSection({
  payerId,
  project,
  onPayer,
  onProject,
}: {
  payerId: string | null;
  project: string;
  onPayer: (id: string | null) => void;
  onProject: (v: string) => void;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-3">Project</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client is the billable contact (jobs.payer_id). Picking a real
            contact is required: the DB rejects a null payer, and the QuickBooks
            customer is derived from it. + Create handles a brand-new client. */}
        <label className="block">
          <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
            Client<span className="text-accent"> *</span>
          </span>
          <div data-testid="estimator-client-picker">
            <ContactCombobox
              value={payerId}
              onChange={onPayer}
              placeholder="Who pays for this project"
            />
          </div>
        </label>
        <FieldInput
          label="Project"
          value={project}
          onChange={onProject}
          placeholder="e.g. Suite 305 kitchen + island"
        />
      </div>
    </section>
  );
}
