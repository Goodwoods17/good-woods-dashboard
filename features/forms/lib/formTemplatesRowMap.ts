import type {
  FieldConfig,
  FieldType,
  FormPhase,
  FormTemplate,
  FormTemplateField,
} from "@shared/lib/types";

export type FormTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  phase: string | null;
  is_default: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FormTemplateFieldRow = {
  id: string;
  template_id: string;
  label: string;
  type: string;
  config: FieldConfig | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function rowToFormTemplate(row: FormTemplateRow): FormTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    phase: (row.phase as FormPhase | null) ?? null,
    isDefault: row.is_default,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formTemplateToRow(t: FormTemplate): FormTemplateRow {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    phase: t.phase ?? null,
    is_default: t.isDefault,
    active: t.active,
    sort_order: t.sortOrder,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

export function rowToFormTemplateField(row: FormTemplateFieldRow): FormTemplateField {
  return {
    id: row.id,
    templateId: row.template_id,
    label: row.label,
    type: row.type as FieldType,
    config: (row.config ?? {}) as FieldConfig,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formTemplateFieldToRow(f: FormTemplateField): FormTemplateFieldRow {
  return {
    id: f.id,
    template_id: f.templateId,
    label: f.label,
    type: f.type,
    config: f.config ?? {},
    sort_order: f.sortOrder,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}
