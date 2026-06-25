"use client";

import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { getFieldEntry } from "../lib/fieldRegistry";
import { getFillControl } from "../lib/fieldControls";
import { useFormInstances } from "../lib/formInstancesStore";

/**
 * Renders one form instance's fields for filling. Each field routes through the
 * field registry + the fill-control map. An unimplemented or unknown field type
 * renders a safe read-only fallback rather than crashing (forward-compat).
 */
export function FormFillSurface({ instance }: { instance: FormInstance }) {
  const { fieldsForInstance, updateInstanceField } = useFormInstances();
  const fields = fieldsForInstance(instance.id);
  const readOnly = instance.status === "complete";

  if (fields.length === 0) {
    return <p className="text-sm text-text-tertiary">This form has no fields.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {fields.map((field) => (
        <FieldRow
          key={field.id}
          field={field}
          readOnly={readOnly}
          onChange={(patch) => updateInstanceField(field.id, patch)}
        />
      ))}
    </div>
  );
}

function FieldRow({
  field,
  readOnly,
  onChange,
}: {
  field: FormInstanceField;
  readOnly: boolean;
  onChange: (patch: Partial<FormInstanceField>) => void;
}) {
  const entry = getFieldEntry(field.type);
  const Control = getFillControl(field.type);

  if (entry?.implemented && Control) {
    return <Control field={field} onChange={onChange} disabled={readOnly} />;
  }

  // Safe read-only fallback for an unimplemented (later-slice) or unknown
  // (future) field type. Never crashes.
  return (
    <div className="py-1 text-sm text-text-tertiary">
      <span className="text-text-secondary">{field.label}</span>{" "}
      <span className="italic">(coming soon)</span>
    </div>
  );
}
