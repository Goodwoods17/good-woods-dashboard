"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FormPhase } from "@shared/lib/types";
import { useFormTemplates } from "../lib/formTemplatesStore";
import { useFormInstances } from "../lib/formInstancesStore";
import { useJob } from "@features/jobs/lib/jobsStore";
import { formPhaseLabel } from "../lib/phase";
import { FormFillSurface } from "./FormFillSurface";
import { FormCompletionBar } from "./FormCompletionBar";
import { ShareFormButton } from "./ShareFormButton";
import { RecipientStatusList } from "./RecipientStatusList";

const PHASE_ORDER: (FormPhase | null)[] = [
  "design",
  "cnc_cut",
  "assembly",
  "finishing",
  "delivery",
  "install",
  null,
];

/**
 * The Forms tab on a job's detail page. Groups attached instances by their
 * snapshotted phase tag (locked decision, issue #33). Default auto-attach +
 * standalone forms + lock/PDF land in later slices.
 */
export function JobFormsTab({ jobId }: { jobId: string }) {
  const { templates, fieldsForTemplate, loading: tplLoading } = useFormTemplates();
  const {
    instancesForJob,
    attachTemplate,
    deleteInstance,
    loading: insLoading,
  } = useFormInstances();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const job = useJob(jobId);
  const jobContext = job ? { code: job.code, name: job.name } : null;

  const instances = instancesForJob(jobId);
  const activeTemplates = templates.filter((t) => t.active);

  // Group instances by phase (preserving phase order).
  const byPhase = PHASE_ORDER.reduce<Array<[FormPhase | null, typeof instances]>>((acc, phase) => {
    const group = instances.filter((i) => i.phase === phase);
    if (group.length > 0) acc.push([phase, group]);
    return acc;
  }, []);

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

  async function onDelete(instanceId: string) {
    if (!confirm("Remove this form from the job?")) return;
    await deleteInstance(instanceId);
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
            <p className="text-sm text-text-tertiary">Loading templates…</p>
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
                      {busy === t.id ? "Adding…" : formPhaseLabel(t.phase)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {insLoading ? (
        <p className="text-sm text-text-tertiary">Loading forms…</p>
      ) : instances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">No forms on this job yet.</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Add a Pre-Install check, design intake, or shop-drawing review.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {byPhase.map(([phase, phaseInstances]) => (
            <div key={phase ?? "__unphased__"}>
              {/* Phase group header — only rendered when there are multiple phases */}
              {byPhase.length > 1 && (
                <h3 className="mb-2 text-xs uppercase tracking-[0.06em] text-text-tertiary">
                  {formPhaseLabel(phase)}
                </h3>
              )}
              <div className="flex flex-col gap-4">
                {phaseInstances.map((instance) => (
                  <section
                    key={instance.id}
                    data-testid="form-instance"
                    className="rounded-lg border border-border bg-surface p-4 shadow-resting"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-medium text-text-primary">{instance.title}</h4>
                        {byPhase.length === 1 && (
                          <span className="text-xs text-text-tertiary">
                            {formPhaseLabel(instance.phase)}
                          </span>
                        )}
                      </div>
                      {instance.status !== "complete" && (
                        <button
                          type="button"
                          onClick={() => onDelete(instance.id)}
                          className="shrink-0 rounded p-1 text-text-tertiary hover:text-status-blocked transition-colors"
                          aria-label="Remove form"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                    <FormFillSurface instance={instance} />
                    <FormCompletionBar instance={instance} jobContext={jobContext} />
                    <ShareFormButton instance={instance} />
                    <RecipientStatusList instance={instance} />
                  </section>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
