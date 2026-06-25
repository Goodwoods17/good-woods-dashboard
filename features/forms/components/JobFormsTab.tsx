"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useFormTemplates } from "../lib/formTemplatesStore";
import { useFormInstances } from "../lib/formInstancesStore";
import { formPhaseLabel } from "../lib/phase";
import { FormFillSurface } from "./FormFillSurface";

/**
 * The Forms tab on a job's detail page. Manually attach a template (which
 * snapshots its fields into a new instance) and fill the per-job copy. Default
 * auto-attach + standalone forms + lock/PDF land in later slices.
 */
export function JobFormsTab({ jobId }: { jobId: string }) {
  const { templates, fieldsForTemplate, loading: tplLoading } = useFormTemplates();
  const { instancesForJob, attachTemplate, loading: insLoading } = useFormInstances();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const instances = instancesForJob(jobId);
  const activeTemplates = templates.filter((t) => t.active);

  async function onAttach(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setBusy(templateId);
    try {
      await attachTemplate(template, fieldsForTemplate(templateId), jobId);
      setPicking(false);
    } catch {
      /* error surfaces via the store */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg text-text-primary">Forms</h2>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-pill px-3 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add form
        </button>
      </div>

      {picking && (
        <div className="mb-5 rounded-lg border border-border bg-surface p-3">
          {tplLoading ? (
            <p className="text-sm text-text-tertiary">Loading templates...</p>
          ) : activeTemplates.length === 0 ? (
            <p className="text-sm text-text-tertiary">No templates available.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {activeTemplates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => onAttach(t.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-muted disabled:opacity-50"
                  >
                    <span>{t.name}</span>
                    <span className="text-xs text-text-tertiary">
                      {busy === t.id ? "Adding..." : formPhaseLabel(t.phase)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {insLoading ? (
        <p className="text-sm text-text-tertiary">Loading forms...</p>
      ) : instances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No forms on this job yet.</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Add a Pre-Install check, design intake, or shop-drawing review.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {instances.map((instance) => (
            <section
              key={instance.id}
              data-testid="form-instance"
              className="rounded-lg border border-border bg-surface p-4 shadow-resting"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-medium text-text-primary">{instance.title}</h3>
                <span className="text-xs text-text-tertiary">{formPhaseLabel(instance.phase)}</span>
              </div>
              <FormFillSurface instance={instance} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
