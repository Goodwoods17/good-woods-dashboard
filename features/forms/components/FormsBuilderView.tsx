"use client";

import { useState } from "react";
import { ClipboardList, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Lock } from "lucide-react";
import type { FormPhase, FormTemplate } from "@shared/lib/types";
import { useFormTemplates } from "../lib/formTemplatesStore";
import { useFormInstances } from "../lib/formInstancesStore";
import { answerableFields } from "../lib/fieldRegistry";
import { formPhaseLabel } from "../lib/phase";
import { TemplateEditor } from "./TemplateEditor";
import { FormFillSurface } from "./FormFillSurface";
import { FormCompletionBar } from "./FormCompletionBar";
import { SharePanel } from "./SharePanel";
import { FormsErrorBanner } from "./FormsErrorBanner";

/**
 * /forms — template library + template CRUD (slice 2) + standalone form
 * instances. Templates are grouped; the TemplateEditor handles drag-reorder,
 * per-field edits, and is_default / active toggles.
 */
export function FormsBuilderView() {
  const {
    templates,
    loading: tplLoading,
    fieldsForTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    error: tplError,
  } = useFormTemplates();
  const {
    standaloneInstances,
    attachTemplate,
    loading: insLoading,
    error: insError,
  } = useFormInstances();

  const [editingId, setEditingId] = useState<string | null>(null);
  // Surface a swallowed provider error (load / create / delete). Dismissible.
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const storeError = tplError ?? insError;
  const visibleError = storeError && storeError !== dismissedError ? storeError : null;
  const [creatingNew, setCreatingNew] = useState(false);
  const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);

  // ─── New template form state ─────────────────────────────────────────
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPhase, setNewPhase] = useState<FormPhase | null>(null);
  const [newDefault, setNewDefault] = useState(false);
  const [newBusy, setNewBusy] = useState(false);

  async function handleCreateTemplate() {
    if (!newName.trim()) return;
    setNewBusy(true);
    const now = new Date().toISOString();
    const template: FormTemplate = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim() || null,
      phase: newPhase,
      isDefault: newDefault,
      active: true,
      sortOrder: templates.length,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await createTemplate(template, []);
      setEditingId(template.id);
      setCreatingNew(false);
      setNewName("");
      setNewDesc("");
      setNewPhase(null);
      setNewDefault(false);
    } finally {
      setNewBusy(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Delete this template? Existing job forms are not affected.")) return;
    await deleteTemplate(id);
    if (editingId === id) setEditingId(null);
  }

  async function handleCreateStandalone(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const fields = fieldsForTemplate(templateId);
    await attachTemplate(template, fields, null);
  }

  const activeTemplates = templates.filter((t) => t.active);
  const inactiveTemplates = templates.filter((t) => !t.active);

  if (tplLoading) {
    return (
      <div className="px-8 py-6">
        <p className="text-sm text-text-tertiary">Loading templates…</p>
      </div>
    );
  }

  // When editing a template, show the editor full-width.
  if (editingId) {
    const template = templates.find((t) => t.id === editingId);
    if (!template) {
      setEditingId(null);
      return null;
    }
    return (
      <div className="px-8 py-6 max-w-2xl">
        <button
          type="button"
          onClick={() => setEditingId(null)}
          className="mb-4 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
        >
          ← Back to forms
        </button>
        <h1 className="font-serif text-xl text-text-primary mb-4">
          Edit template: {template.name}
        </h1>
        <TemplateEditor template={template} onDone={() => setEditingId(null)} />
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text-primary">Forms</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Reusable form templates for shop checks, intakes, and reviews.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreatingNew((p) => !p);
          }}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-lg bg-ink-pill px-3 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New template
        </button>
      </header>

      {visibleError && (
        <FormsErrorBanner message={visibleError} onDismiss={() => setDismissedError(storeError)} />
      )}

      {/* New template quick-create form */}
      {creatingNew && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">New template</h2>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
              Name *
            </label>
            <input
              className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Pre-Install Check"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
              Description (optional)
            </label>
            <input
              className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What is this form for?"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-accent"
              checked={newDefault}
              onChange={(e) => setNewDefault(e.target.checked)}
            />
            <span className="text-sm text-text-secondary">Default (auto-attach to new jobs)</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreatingNew(false)}
              className="rounded-full px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateTemplate}
              disabled={!newName.trim() || newBusy}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {newBusy ? "Creating…" : "Create & edit fields"}
            </button>
          </div>
        </div>
      )}

      {/* Active templates */}
      {activeTemplates.length === 0 && !creatingNew ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center mb-6">
          <ClipboardList className="mx-auto mb-3 h-6 w-6 text-text-tertiary" strokeWidth={1.5} />
          <p className="text-sm text-text-secondary">No form templates yet.</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Click &ldquo;New template&rdquo; to get started.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 mb-6">
          {activeTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              fieldCount={answerableFields(fieldsForTemplate(t.id)).length}
              onEdit={() => setEditingId(t.id)}
              onDelete={() => handleDeleteTemplate(t.id)}
              onToggleActive={() => updateTemplate(t.id, { active: false })}
              onCreateStandalone={() => handleCreateStandalone(t.id)}
            />
          ))}
        </ul>
      )}

      {/* Inactive templates (collapsed) */}
      {inactiveTemplates.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-secondary select-none mb-2">
            {inactiveTemplates.length} inactive template{inactiveTemplates.length !== 1 ? "s" : ""}
          </summary>
          <ul className="grid gap-3 sm:grid-cols-2 mt-2">
            {inactiveTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                fieldCount={answerableFields(fieldsForTemplate(t.id)).length}
                onEdit={() => setEditingId(t.id)}
                onDelete={() => handleDeleteTemplate(t.id)}
                onToggleActive={() => updateTemplate(t.id, { active: true })}
                onCreateStandalone={() => handleCreateStandalone(t.id)}
                inactive
              />
            ))}
          </ul>
        </details>
      )}

      {/* Standalone instances */}
      <section>
        <h2 className="font-serif text-lg text-text-primary mb-3">Standalone forms</h2>
        {insLoading ? (
          <p className="text-sm text-text-tertiary">Loading…</p>
        ) : standaloneInstances.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-text-secondary">No standalone forms yet.</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Use &quot;Fill standalone&quot; on a template above to start one without a job.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {standaloneInstances.map((inst) => (
              <li
                key={inst.id}
                data-testid="standalone-instance"
                className="rounded-lg border border-border bg-surface shadow-resting"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedInstanceId((prev) => (prev === inst.id ? null : inst.id))
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{inst.title}</span>
                    {inst.phase && (
                      <span className="text-xs text-text-tertiary">
                        {formPhaseLabel(inst.phase)}
                      </span>
                    )}
                    {inst.status === "complete" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft/60 px-2 py-0.5 text-xs text-accent">
                        <Lock className="h-3 w-3" strokeWidth={2} />
                        Locked
                      </span>
                    )}
                  </div>
                  {expandedInstanceId === inst.id ? (
                    <ChevronDown
                      className="h-4 w-4 text-text-tertiary shrink-0"
                      strokeWidth={1.75}
                    />
                  ) : (
                    <ChevronRight
                      className="h-4 w-4 text-text-tertiary shrink-0"
                      strokeWidth={1.75}
                    />
                  )}
                </button>
                {expandedInstanceId === inst.id && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <FormFillSurface instance={inst} />
                    <FormCompletionBar instance={inst} />
                    <SharePanel instance={inst} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── TemplateCard ──────────────────────────────────────────────────────────
function TemplateCard({
  template,
  fieldCount,
  onEdit,
  onDelete,
  onToggleActive,
  onCreateStandalone,
  inactive,
}: {
  template: FormTemplate;
  fieldCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onCreateStandalone: () => void;
  inactive?: boolean;
}) {
  return (
    <li
      data-testid="form-template-card"
      className={
        "rounded-lg border bg-surface p-4 shadow-resting " +
        (inactive ? "border-border opacity-60" : "border-border")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-medium text-text-primary">{template.name}</h2>
        <div className="flex shrink-0 items-center gap-1">
          {template.isDefault && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
              Default
            </span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded p-1 text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Edit template"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-text-tertiary hover:text-status-blocked transition-colors"
            aria-label="Delete template"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {template.description && (
        <p className="mt-1 text-sm text-text-secondary">{template.description}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <span>{formPhaseLabel(template.phase)}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {fieldCount} {fieldCount === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleActive}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
        >
          {inactive ? "Re-activate" : "Deactivate"}
        </button>
        <button
          type="button"
          onClick={onCreateStandalone}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
        >
          Fill standalone
        </button>
      </div>
    </li>
  );
}
