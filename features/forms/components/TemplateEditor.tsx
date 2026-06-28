"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X, Check, Settings2 } from "lucide-react";
import type { FieldType, FormPhase, FormTemplate, FormTemplateField } from "@shared/lib/types";
import { useFormTemplates } from "../lib/formTemplatesStore";
import { FIELD_REGISTRY, IMPLEMENTED_TYPES, isFieldRequired } from "../lib/fieldRegistry";
import { formPhaseLabel } from "../lib/phase";
import type { ShowWhenCondition } from "../lib/conditionals";
import {
  PREFILL_SOURCE_GROUPS,
  PREFILL_SOURCE_LABELS,
  type PrefillSourceKey,
} from "../lib/prefill";

const PHASES: (FormPhase | null)[] = [
  "design",
  "cnc_cut",
  "assembly",
  "finishing",
  "delivery",
  "install",
  null,
];

// ─── FieldConfigPanel — edit the label / type / config of one template field ──
function FieldConfigPanel({
  field,
  fieldsAbove = [],
  onSave,
  onCancel,
}: {
  field: FormTemplateField;
  /** Answerable (non-section) fields that appear above this one — used for the
   *  trigger dropdown in the Visibility control. */
  fieldsAbove?: FormTemplateField[];
  onSave: (patch: Partial<FormTemplateField>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<FieldType>(field.type);
  const [config, setConfig] = useState<Record<string, unknown>>(
    field.config as Record<string, unknown>
  );

  // Dropdown options helpers.
  const dropdownOptions: string[] = Array.isArray(config.options)
    ? (config.options as string[])
    : [];
  const [optionDraft, setOptionDraft] = useState("");

  // Visibility condition helpers.
  const existingCondition = config.showWhen as ShowWhenCondition | undefined;
  const [visMode, setVisMode] = useState<"always" | "conditional">(
    existingCondition ? "conditional" : "always"
  );
  const [showWhenFieldId, setShowWhenFieldId] = useState<string>(existingCondition?.fieldId ?? "");
  const [showWhenOperator, setShowWhenOperator] = useState<ShowWhenCondition["operator"]>(
    existingCondition?.operator ?? "is_checked"
  );
  const [showWhenValue, setShowWhenValue] = useState<string>(
    existingCondition?.value != null ? String(existingCondition.value) : ""
  );

  const existingPrefill = (config.prefillFrom as PrefillSourceKey | undefined) ?? "";
  const [prefillFrom, setPrefillFrom] = useState<string>(existingPrefill);

  // Answerable fields above this one (exclude sections — they can't hold a value).
  const triggerCandidates = fieldsAbove.filter(
    (f) => FIELD_REGISTRY[f.type] && !FIELD_REGISTRY[f.type].isLayout
  );

  function addOption() {
    const trimmed = optionDraft.trim();
    if (!trimmed) return;
    setConfig((c) => ({ ...c, options: [...dropdownOptions, trimmed] }));
    setOptionDraft("");
  }

  function removeOption(i: number) {
    setConfig((c) => ({
      ...c,
      options: dropdownOptions.filter((_, idx) => idx !== i),
    }));
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/20 p-3 space-y-3">
      <div>
        <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
          Label
        </label>
        <input
          aria-label="Field label"
          className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
          Type
        </label>
        <select
          aria-label="Field type"
          className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
        >
          {IMPLEMENTED_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_REGISTRY[t].label}
            </option>
          ))}
        </select>
      </div>

      {/* Per-type config knobs */}
      {(type === "short_text" || type === "long_text") && (
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
            Placeholder (optional)
          </label>
          <input
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
            value={(config.placeholder as string) ?? ""}
            onChange={(e) => setConfig((c) => ({ ...c, placeholder: e.target.value }))}
          />
        </div>
      )}

      {type === "number" && (
        <div className="grid grid-cols-3 gap-2">
          {(["min", "max", "step"] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
                {k}
              </label>
              <input
                type="number"
                className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
                value={(config[k] as string) ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {type === "dropdown" && (
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
            Options
          </label>
          <ul className="space-y-1 mb-2">
            {dropdownOptions.map((opt, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-text-primary">{opt}</span>
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-text-tertiary hover:text-status-blocked transition-colors"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
              placeholder="Add option"
              value={optionDraft}
              onChange={(e) => setOptionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <button
              type="button"
              onClick={addOption}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary hover:border-border-strong"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Required flag — applies to all answerable types */}
      {type !== "section" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="field-required"
            className="h-4 w-4 rounded border-border accent-accent"
            checked={isFieldRequired({ config })}
            onChange={(e) => setConfig((c) => ({ ...c, required: e.target.checked }))}
          />
          <span className="text-sm text-text-secondary">Required</span>
        </label>
      )}

      {/* Prefill from job — for text, long_text, number, date fields */}
      {(type === "short_text" || type === "long_text" || type === "number" || type === "date") && (
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
            Prefill from job
          </label>
          <select
            data-testid="field-prefill-source"
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
            value={prefillFrom}
            onChange={(e) => setPrefillFrom(e.target.value)}
          >
            <option value="">— none —</option>
            {PREFILL_SOURCE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.keys.map((key) => (
                  <option key={key} value={key}>
                    {PREFILL_SOURCE_LABELS[key]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {prefillFrom && (
            <p className="mt-1 text-xs text-text-tertiary">
              Pre-filled when this form is attached to a job. Standalone forms leave the field
              blank. The value is frozen at attach time.
            </p>
          )}
        </div>
      )}

      {/* Visibility — only applicable to non-section fields; sections are always shown */}
      {type !== "section" && (
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary">
            Visibility
          </label>
          <select
            data-testid="field-visibility-mode"
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
            value={visMode}
            onChange={(e) => {
              const m = e.target.value as "always" | "conditional";
              setVisMode(m);
              if (m === "always") {
                setShowWhenFieldId("");
              }
            }}
          >
            <option value="always">Always show</option>
            <option value="conditional">Show only when…</option>
          </select>

          {visMode === "conditional" && (
            <div className="space-y-2 pl-2 border-l-2 border-accent/30">
              {triggerCandidates.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  No answerable fields above this one yet. Add fields above to use this control.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Trigger field</label>
                    <select
                      data-testid="field-visibility-trigger"
                      className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
                      value={showWhenFieldId}
                      onChange={(e) => setShowWhenFieldId(e.target.value)}
                    >
                      <option value="">Select a field…</option>
                      {triggerCandidates.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Condition</label>
                    <select
                      data-testid="field-visibility-operator"
                      className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
                      value={showWhenOperator}
                      onChange={(e) =>
                        setShowWhenOperator(e.target.value as ShowWhenCondition["operator"])
                      }
                    >
                      <option value="is_checked">Is checked / Yes</option>
                      <option value="is_not_checked">Is not checked / No</option>
                      <option value="equals">Equals</option>
                      <option value="not_equals">Does not equal</option>
                    </select>
                  </div>

                  {(showWhenOperator === "equals" || showWhenOperator === "not_equals") && (
                    <div>
                      <label className="block text-xs text-text-tertiary mb-1">Value</label>
                      <input
                        data-testid="field-visibility-value"
                        className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
                        value={showWhenValue}
                        onChange={(e) => setShowWhenValue(e.target.value)}
                        placeholder="e.g. yes"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-xs text-text-secondary hover:text-text-primary border border-border"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            // Build the showWhen condition into config, or clear it.
            let updatedConfig = { ...config };
            if (
              visMode === "conditional" &&
              showWhenFieldId &&
              triggerCandidates.some((f) => f.id === showWhenFieldId)
            ) {
              const condition: ShowWhenCondition = {
                fieldId: showWhenFieldId,
                operator: showWhenOperator,
              };
              if (showWhenOperator === "equals" || showWhenOperator === "not_equals") {
                condition.value = showWhenValue;
              }
              updatedConfig = { ...updatedConfig, showWhen: condition };
            } else {
              // Always show — remove any prior condition.
              const { showWhen: _removed, ...rest } = updatedConfig;
              updatedConfig = rest;
            }
            // Persist the prefill source, or clear it when reset to "— none —".
            if (prefillFrom) {
              updatedConfig = { ...updatedConfig, prefillFrom };
            } else {
              const { prefillFrom: _pf, ...rest } = updatedConfig;
              updatedConfig = rest;
            }
            onSave({ label: label.trim() || field.label, type, config: updatedConfig });
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-3 py-1 text-xs font-medium text-white"
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
          Save field
        </button>
      </div>
    </div>
  );
}

// ─── SortableFieldRow ──────────────────────────────────────────────────────
function SortableFieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: FormTemplateField;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const entry = FIELD_REGISTRY[field.type];
  const cfg = field.config as Record<string, unknown>;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-text-tertiary hover:text-text-secondary"
      >
        <GripVertical className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-text-primary truncate">{field.label}</span>
        <span className="ml-2 text-xs text-text-tertiary">{entry?.label ?? field.type}</span>
        {cfg?.required === true && <span className="ml-1 text-xs text-accent">*</span>}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
        aria-label="Edit field"
      >
        <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-1 rounded text-text-tertiary hover:text-status-blocked transition-colors"
        aria-label="Delete field"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </li>
  );
}

// ─── TemplateEditor ────────────────────────────────────────────────────────
export function TemplateEditor({
  template,
  onDone,
}: {
  template: FormTemplate;
  onDone: () => void;
}) {
  const {
    fieldsForTemplate,
    updateTemplate,
    reorderTemplateFields,
    addTemplateField,
    updateTemplateField,
    deleteTemplateField,
  } = useFormTemplates();

  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [phase, setPhase] = useState<FormPhase | null>(template.phase);
  const [isDefault, setIsDefault] = useState(template.isDefault);
  const [active, setActive] = useState(template.active);
  const [savingMeta, setSavingMeta] = useState(false);

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);

  const templateFields = fieldsForTemplate(template.id);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await updateTemplate(template.id, {
        name: name.trim() || template.name,
        description: description.trim() || null,
        phase,
        isDefault,
        active,
      });
    } finally {
      setSavingMeta(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = templateFields.findIndex((f) => f.id === active.id);
    const newIndex = templateFields.findIndex((f) => f.id === over.id);
    const reordered = arrayMove(templateFields, oldIndex, newIndex);
    reorderTemplateFields(template.id, reordered);
  }

  function newBlankField(): Omit<FormTemplateField, "id"> {
    const now = new Date().toISOString();
    return {
      templateId: template.id,
      label: "New field",
      type: "short_text",
      config: {},
      sortOrder: templateFields.length,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function handleAddField(patch: Partial<FormTemplateField>) {
    const blank = newBlankField();
    const field: FormTemplateField = {
      ...blank,
      id: crypto.randomUUID(),
      ...patch,
    };
    await addTemplateField(field);
    setAddingField(false);
  }

  async function handleEditField(id: string, patch: Partial<FormTemplateField>) {
    await updateTemplateField(id, patch);
    setEditingFieldId(null);
  }

  async function handleDeleteField(id: string) {
    await deleteTemplateField(id);
  }

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Template settings</h3>

        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
            Name
          </label>
          <input
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
            Description (optional)
          </label>
          <input
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this form for?"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1">
            Phase tag
          </label>
          <select
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
            value={phase ?? ""}
            onChange={(e) => setPhase((e.target.value || null) as FormPhase | null)}
          >
            <option value="">Unphased</option>
            {(PHASES.filter(Boolean) as FormPhase[]).map((p) => (
              <option key={p} value={p}>
                {formPhaseLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-accent"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span className="text-sm text-text-secondary">Default (auto-attach to new jobs)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-accent"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="text-sm text-text-secondary">Active</span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-full px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border"
          >
            Close
          </button>
          <button
            type="button"
            onClick={saveMeta}
            disabled={savingMeta}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {savingMeta ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* Fields */}
      <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Fields</h3>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={templateFields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul data-testid="template-fields-list" className="space-y-2">
              {templateFields.map((field, idx) => (
                <div key={field.id}>
                  {editingFieldId === field.id ? (
                    <FieldConfigPanel
                      field={field}
                      fieldsAbove={templateFields.slice(0, idx)}
                      onSave={(patch) => handleEditField(field.id, patch)}
                      onCancel={() => setEditingFieldId(null)}
                    />
                  ) : (
                    <SortableFieldRow
                      field={field}
                      onEdit={() => {
                        setAddingField(false);
                        setEditingFieldId(field.id);
                      }}
                      onDelete={() => handleDeleteField(field.id)}
                    />
                  )}
                </div>
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {templateFields.length === 0 && !addingField && (
          <p className="text-sm text-text-tertiary">No fields yet. Add one below.</p>
        )}

        {addingField ? (
          <FieldConfigPanel
            field={{
              id: "__new__",
              ...newBlankField(),
            }}
            fieldsAbove={templateFields}
            onSave={(patch) => handleAddField(patch)}
            onCancel={() => setAddingField(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingFieldId(null);
              setAddingField(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors duration-fast"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add field
          </button>
        )}
      </section>
    </div>
  );
}
