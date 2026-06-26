import {
  getSupabase,
  hasSupabase,
  JOB_ITEMS_TABLE,
  PHASE_STEP_TEMPLATES_TABLE,
} from "@shared/lib/supabase";

type TemplateRow = {
  id: string;
  phase: string;
  label: string;
  sort_order: number;
  default_visibility: string;
};

// Materialise phase_step_templates → job_items for a given job. Idempotent:
// templates already instantiated for this job (matched by template_id) are
// skipped, so re-running never creates duplicates. A no-op when Supabase is
// absent (localhost fallback mode).
export async function materialiseTemplates(jobId: string): Promise<void> {
  if (!hasSupabase()) return;
  const sb = getSupabase();

  const { data: templates, error: tErr } = await sb
    .from(PHASE_STEP_TEMPLATES_TABLE)
    .select("id, phase, label, sort_order, default_visibility")
    .eq("active", true)
    .order("phase")
    .order("sort_order");

  if (tErr || !templates?.length) return;

  // Which templates are already instantiated for this job?
  const { data: existing } = await sb
    .from(JOB_ITEMS_TABLE)
    .select("template_id")
    .eq("job_id", jobId)
    .not("template_id", "is", null);

  const alreadyDone = new Set(
    (existing ?? []).map((r: { template_id: string | null }) => r.template_id)
  );

  const toInsert = (templates as TemplateRow[])
    .filter((t) => !alreadyDone.has(t.id))
    .map((t) => ({
      job_id: jobId,
      phase: t.phase,
      label: t.label,
      source: "template",
      template_id: t.id,
      status: "not_started",
      visibility: t.default_visibility,
      sort_order: t.sort_order,
    }));

  if (toInsert.length > 0) {
    await sb.from(JOB_ITEMS_TABLE).insert(toInsert);
  }
}
