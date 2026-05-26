import type { Job } from "@shared/lib/types";

// Database row shape (snake_case, mirrors public.jobs).
// 5 typed contact FK slots added 2026-05-25 — see
// supabase/migrations/20260525_contacts_and_job_slots.sql.
export type JobRow = {
  id: string;
  code: string;
  name: string;
  client: string;
  address: string;
  template: Job["template"];
  pipeline_status: Job["pipelineStatus"];
  health_status: Job["healthStatus"];
  current_milestone: Job["currentMilestone"];
  install_date: string;
  revenue: number;
  costs: Job["costs"];
  invoice: Job["invoice"];
  activity: NonNullable<Job["activity"]>;
  notes: string | null;
  blocker: string | null;
  next_step: string | null;
  payer_id: string | null;
  designer_id: string | null;
  architect_id: string | null;
  gc_id: string | null;
  homeowner_id: string | null;
};

export function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    client: row.client,
    address: row.address,
    template: row.template,
    pipelineStatus: row.pipeline_status,
    healthStatus: row.health_status,
    currentMilestone: row.current_milestone,
    installDate: row.install_date,
    revenue: Number(row.revenue),
    costs: row.costs ?? [],
    invoice: row.invoice,
    activity: row.activity ?? [],
    notes: row.notes ?? undefined,
    blocker: row.blocker ?? undefined,
    nextStep: row.next_step ?? undefined,
    payerId: row.payer_id,
    designerId: row.designer_id,
    architectId: row.architect_id,
    gcId: row.gc_id,
    homeownerId: row.homeowner_id,
  };
}

export function jobToRow(job: Job): JobRow {
  return {
    id: job.id,
    code: job.code,
    name: job.name,
    client: job.client,
    address: job.address,
    template: job.template,
    pipeline_status: job.pipelineStatus,
    health_status: job.healthStatus,
    current_milestone: job.currentMilestone,
    install_date: job.installDate,
    revenue: job.revenue,
    costs: job.costs,
    invoice: job.invoice,
    activity: job.activity ?? [],
    notes: job.notes ?? null,
    blocker: job.blocker ?? null,
    next_step: job.nextStep ?? null,
    payer_id: job.payerId ?? null,
    designer_id: job.designerId ?? null,
    architect_id: job.architectId ?? null,
    gc_id: job.gcId ?? null,
    homeowner_id: job.homeownerId ?? null,
  };
}
