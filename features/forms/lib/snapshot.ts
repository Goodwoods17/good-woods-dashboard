import type {
  FormInstance,
  FormInstanceField,
  FormTemplate,
  FormTemplateField,
} from "@shared/lib/types";

/**
 * Snapshot invariant (issue #32): when a template is attached to a job, the
 * instance COPIES the template's field defs (label/type/config) at attach time.
 * The copy is frozen — editing the master never disturbs forms already on jobs,
 * not even while the instance is still a draft. This helper is the single place
 * that copy happens, so the invariant is testable and lives in one spot.
 */

function newId(): string {
  // crypto.randomUUID exists in modern browsers + Node 18+ (our runtimes).
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export type SnapshotResult = {
  instance: FormInstance;
  fields: FormInstanceField[];
};

/**
 * Build a new draft instance + its snapshot fields from a template and its
 * fields. `jobId` is the job we're attaching to (null = standalone). Answers
 * (checked/value/note/photoUrl) start empty; the def is copied verbatim.
 */
export function snapshotTemplate(
  template: FormTemplate,
  templateFields: FormTemplateField[],
  jobId: string | null,
  now: string = new Date().toISOString()
): SnapshotResult {
  const instanceId = newId();
  const instance: FormInstance = {
    id: instanceId,
    templateId: template.id,
    jobId,
    title: template.name,
    phase: template.phase, // snapshot the phase tag
    status: "draft",
    signoffPath: null,
    completedAt: null,
    completedBy: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  const ordered = [...templateFields].sort((a, b) => a.sortOrder - b.sortOrder);

  // Allocate the new instance-field id for each template field UP FRONT, so a
  // conditional field's `config.showWhen.fieldId` — which points at a sibling
  // TEMPLATE field id — can be remapped onto the new instance id. Without this
  // the trigger is unfindable post-snapshot and `isFieldVisible` falls back to
  // "visible", so conditional fields would never hide on a job. (issue #66)
  const instanceIdByTemplateFieldId = new Map<string, string>();
  for (const tf of ordered) instanceIdByTemplateFieldId.set(tf.id, newId());

  const fields: FormInstanceField[] = ordered.map((tf, idx) => {
    // Frozen copy of the def — never a live reference to the master.
    const config: Record<string, unknown> = { ...tf.config };
    const showWhen = config.showWhen as { fieldId?: string } | undefined;
    if (showWhen?.fieldId && instanceIdByTemplateFieldId.has(showWhen.fieldId)) {
      // Deep-copy the condition (don't mutate the template) with the remapped id.
      config.showWhen = { ...showWhen, fieldId: instanceIdByTemplateFieldId.get(showWhen.fieldId) };
    }
    return {
      id: instanceIdByTemplateFieldId.get(tf.id)!,
      instanceId,
      label: tf.label,
      type: tf.type,
      config,
      value: null,
      checked: null,
      note: null,
      photoUrl: null,
      sortOrder: idx,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { instance, fields };
}
