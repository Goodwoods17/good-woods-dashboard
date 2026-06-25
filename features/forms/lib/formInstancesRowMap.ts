import type {
  FieldConfig,
  FieldType,
  FormInstance,
  FormInstanceField,
  FormPhase,
  FormStatus,
} from "@shared/lib/types";

export type FormInstanceRow = {
  id: string;
  template_id: string | null;
  job_id: string | null;
  title: string;
  phase: string | null;
  status: string;
  signoff_path: string | null;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FormInstanceFieldRow = {
  id: string;
  instance_id: string;
  label: string;
  type: string;
  config: FieldConfig | null;
  value: unknown | null;
  checked: boolean | null;
  note: string | null;
  photo_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function rowToFormInstance(row: FormInstanceRow): FormInstance {
  return {
    id: row.id,
    templateId: row.template_id,
    jobId: row.job_id,
    title: row.title,
    phase: (row.phase as FormPhase | null) ?? null,
    status: row.status as FormStatus,
    signoffPath: row.signoff_path,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formInstanceToRow(i: FormInstance): FormInstanceRow {
  return {
    id: i.id,
    template_id: i.templateId ?? null,
    job_id: i.jobId ?? null,
    title: i.title,
    phase: i.phase ?? null,
    status: i.status,
    signoff_path: i.signoffPath ?? null,
    completed_at: i.completedAt ?? null,
    completed_by: i.completedBy ?? null,
    sort_order: i.sortOrder,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

export function rowToFormInstanceField(row: FormInstanceFieldRow): FormInstanceField {
  return {
    id: row.id,
    instanceId: row.instance_id,
    label: row.label,
    type: row.type as FieldType,
    config: (row.config ?? {}) as FieldConfig,
    value: row.value ?? null,
    checked: row.checked ?? null,
    note: row.note,
    photoUrl: row.photo_url,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formInstanceFieldToRow(f: FormInstanceField): FormInstanceFieldRow {
  return {
    id: f.id,
    instance_id: f.instanceId,
    label: f.label,
    type: f.type,
    config: f.config ?? {},
    value: f.value ?? null,
    checked: f.checked ?? null,
    note: f.note ?? null,
    photo_url: f.photoUrl ?? null,
    sort_order: f.sortOrder,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}
