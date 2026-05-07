import type { Job } from "@shared/lib/types";

// Database row shape (snake_case, mirrors public.jobs).
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
  };
}
