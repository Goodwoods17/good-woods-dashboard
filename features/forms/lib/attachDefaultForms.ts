import type { FormTemplate, FormTemplateField, FormInstance, Job, JobPiece } from "@shared/lib/types";

/**
 * Auto-attach every default (is_default=true, active=true) form template to a
 * newly-created job. Best-effort — never throws; a form failure must never
 * block job creation. Returns the instances created (may be empty on error).
 *
 * Pass `job` + `pieces` to pre-fill fields that have `config.prefillFrom` set
 * (Forms P3 Slice 3, issue #68). Omitting them leaves the fields blank.
 */
export async function attachDefaultForms(
  jobId: string,
  templates: FormTemplate[],
  fieldsForTemplate: (templateId: string) => FormTemplateField[],
  attachTemplate: (
    template: FormTemplate,
    fields: FormTemplateField[],
    jobId: string | null,
    job?: Job,
    pieces?: JobPiece[]
  ) => Promise<FormInstance>,
  job?: Job,
  pieces?: JobPiece[]
): Promise<FormInstance[]> {
  const defaults = templates.filter((t) => t.isDefault && t.active);
  const results: FormInstance[] = [];
  for (const template of defaults) {
    try {
      const fields = fieldsForTemplate(template.id);
      const instance = await attachTemplate(template, fields, jobId, job, pieces);
      results.push(instance);
    } catch {
      // Never propagate — job creation must not fail because of a form issue.
    }
  }
  return results;
}
