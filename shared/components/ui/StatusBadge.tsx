import { PIPELINE_LABELS, type PipelineStatus } from "@shared/lib/types";

export function StatusBadge({ status }: { status: PipelineStatus }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
      {PIPELINE_LABELS[status]}
    </span>
  );
}
