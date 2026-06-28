"use client";

import { useState } from "react";
import { Plus, Settings2, Trash2, X, Check } from "lucide-react";
import type { FieldType, FormInstance, FormInstanceField } from "@shared/lib/types";
import {
  getFieldEntry,
  FIELD_REGISTRY,
  IMPLEMENTED_TYPES,
  isFieldRequired,
} from "../lib/fieldRegistry";
import { getFillControl } from "../lib/fieldControls";
import { useFormInstances } from "../lib/formInstancesStore";
import { isFieldVisible } from "../lib/conditionals";
import { CompletionMeter } from "./CompletionMeter";

/**
 * Renders one form instance's fields for filling. Each field routes through the
 * field registry + the fill-control map. An unimplemented or unknown field type
 * renders a safe read-only fallback rather than crashing (forward-compat).
 *
 * Slice 2 adds per-instance ad-hoc field edits (add / edit-def / delete a field
 * on this copy without touching the master).
 */
export function FormFillSurface({ instance }: { instance: FormInstance }) {
  const {
    fieldsForInstance,
    updateInstanceField,
    addInstanceField,
    editInstanceField,
    deleteInstanceField,
  } = useFormInstances();
  const fields = fieldsForInstance(instance.id);
  const readOnly = instance.status === "complete";

  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);

  if (fields.length === 0 && !addingField) {
    return (
      <div>
        <p className="text-sm text-text-tertiary mb-2">This form has no fields.</p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setAddingField(true)}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary border border-dashed border-border rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add field
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {fields.map((field) => {
        if (!isFieldVisible(field, fields)) return null;
        return (
          <div key={field.id}>
            {editingDefId === field.id ? (
              <FieldDefEditor
                field={field}
                onSave={async (patch) => {
                  await editInstanceField(field.id, patch);
                  setEditingDefId(null);
                }}
                onCancel={() => setEditingDefId(null)}
                onDelete={async () => {
                  await deleteInstanceField(field.id);
                  setEditingDefId(null);
                }}
              />
            ) : (
              <FieldRow
                field={field}
                readOnly={readOnly}
                onChange={(patch) => updateInstanceField(field.id, patch)}
                onEditDef={
                  readOnly
                    ? undefined
                    : () => {
                        setAddingField(false);
                        setEditingDefId(field.id);
                      }
                }
              />
            )}
          </div>
        );
      })}

      {!readOnly && fields.length > 0 && (
        <div className="pt-2">
          <CompletionMeter fields={fields} />
        </div>
      )}

      {!readOnly && (
        <>
          {addingField ? (
            <AddFieldPanel
              instanceId={instance.id}
              sortOrder={fields.length}
              onAdd={async (field) => {
                await addInstanceField(field);
                setAddingField(false);
              }}
              onCancel={() => setAddingField(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingDefId(null);
                setAddingField(true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary border border-dashed border-border rounded-lg px-3 py-1.5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add field to this copy
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── FieldRow ───────────────────────────────────────────────────────────────
function FieldRow({
  field,
  readOnly,
  onChange,
  onEditDef,
}: {
  field: FormInstanceField;
  readOnly: boolean;
  onChange: (patch: Partial<FormInstanceField>) => void;
  onEditDef?: () => void;
}) {
  const entry = getFieldEntry(field.type);
  const Control = getFillControl(field.type);
  const isRequired = isFieldRequired(field);

  return (
    <div className="group flex items-start gap-1">
      <div className="flex-1 min-w-0">
        {entry?.implemented && Control ? (
          <div className="relative">
            <Control field={field} onChange={onChange} disabled={readOnly} />
            {isRequired && !entry.isLayout && (
              <span className="ml-0.5 text-accent" aria-label="required" title="Required">
                *
              </span>
            )}
          </div>
        ) : (
          // Safe read-only fallback for an unimplemented (later-slice) or unknown
          // (future) field type. Never crashes.
          <div className="py-1 text-sm text-text-tertiary">
            <span className="text-text-secondary">{field.label}</span>{" "}
            <span className="italic">(coming soon)</span>
          </div>
        )}
      </div>
      {onEditDef && (
        <button
          type="button"
          onClick={onEditDef}
          className="mt-1.5 rounded p-1 text-transparent group-hover:text-text-tertiary hover:!text-text-primary transition-colors shrink-0"
          aria-label="Edit field definition"
        >
          <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

// ─── FieldDefEditor — edit label/type on an instance field ─────────────────
function FieldDefEditor({
  field,
  onSave,
  onCancel,
  onDelete,
}: {
  field: FormInstanceField;
  onSave: (patch: Partial<FormInstanceField>) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<FieldType>(field.type);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onSave({ label: label.trim() || field.label, type });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/20 p-3 space-y-2 my-1">
      <input
        className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Field label"
      />
      <select
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
      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-status-blocked hover:bg-status-blocked-soft"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
          Remove
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <X className="h-3 w-3 inline" strokeWidth={2} /> Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-ink-pill px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AddFieldPanel — add a new ad-hoc field to this instance ──────────────
function AddFieldPanel({
  instanceId,
  sortOrder,
  onAdd,
  onCancel,
}: {
  instanceId: string;
  sortOrder: number;
  onAdd: (field: FormInstanceField) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("short_text");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    const now = new Date().toISOString();
    const field: FormInstanceField = {
      id: crypto.randomUUID(),
      instanceId,
      label: label.trim(),
      type,
      config: {},
      value: null,
      checked: null,
      note: null,
      photoUrl: null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await onAdd(field);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-3 space-y-2 mt-2">
      <input
        className="w-full text-sm bg-surface border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-soft"
        value={label}
        autoFocus
        placeholder="Field label"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <select
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
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={add}
          disabled={!label.trim() || busy}
          className="inline-flex items-center gap-1 rounded-full bg-ink-pill px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          Add
        </button>
      </div>
    </div>
  );
}
