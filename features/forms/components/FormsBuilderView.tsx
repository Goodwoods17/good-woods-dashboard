"use client";

import { ClipboardList } from "lucide-react";
import { useFormTemplates } from "../lib/formTemplatesStore";
import { formPhaseLabel } from "../lib/phase";

/**
 * /forms — lists the seeded form templates (the masters). Template CRUD + the
 * dnd-kit builder land in slice 2; this slice proves the read path end to end.
 */
export function FormsBuilderView() {
  const { templates, loading, fieldsForTemplate } = useFormTemplates();

  const active = templates.filter((t) => t.active);

  return (
    <div className="px-8 py-6">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-text-primary">Forms</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Reusable form templates for shop checks, intakes, and reviews. Attach one to a job from
          the job&apos;s Forms tab.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading templates...</p>
      ) : active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-6 w-6 text-text-tertiary" strokeWidth={1.5} />
          <p className="text-sm text-text-secondary">No form templates yet.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((t) => {
            const fieldCount = fieldsForTemplate(t.id).filter((f) => f.type !== "section").length;
            return (
              <li
                key={t.id}
                data-testid="form-template-card"
                className="rounded-lg border border-border bg-surface p-4 shadow-resting"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium text-text-primary">{t.name}</h2>
                  {t.isDefault && (
                    <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
                      Default
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="mt-1 text-sm text-text-secondary">{t.description}</p>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-text-tertiary">
                  <span>{formPhaseLabel(t.phase)}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    {fieldCount} {fieldCount === 1 ? "item" : "items"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
