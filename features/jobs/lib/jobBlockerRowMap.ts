import type { JobBlocker, MilestoneStage } from "@shared/lib/types";

export function rowToBlocker(r: Record<string, unknown>): JobBlocker {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    reason: (r.reason as string) ?? "",
    waitingOnContactId: (r.waiting_on_contact_id as string) ?? null,
    waitingOnLabel: (r.waiting_on_label as string) ?? null,
    gatedPhaseId: (r.gated_phase_id as MilestoneStage) ?? null,
    raisedAt: String(r.raised_at),
    resolvedAt: (r.resolved_at as string) ?? null,
  };
}
export function blockerToRow(b: JobBlocker): Record<string, unknown> {
  return {
    id: b.id,
    job_id: b.jobId,
    reason: b.reason,
    waiting_on_contact_id: b.waitingOnContactId,
    waiting_on_label: b.waitingOnLabel,
    gated_phase_id: b.gatedPhaseId,
    raised_at: b.raisedAt,
    resolved_at: b.resolvedAt,
  };
}
