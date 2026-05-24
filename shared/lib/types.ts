export type PipelineStatus =
  | "new"
  | "sold"
  | "in_design"
  | "in_production"
  | "in_finishing"
  | "installing"
  | "complete";

export type HealthStatus =
  | "on_track"
  | "at_risk"
  | "blocked"
  | "complete"
  | "paused";

export type MilestoneStage =
  | "sold"
  | "materials"
  | "cut"
  | "assemble"
  | "finish"
  | "install";

export const MILESTONE_STAGES: { key: MilestoneStage; label: string }[] = [
  { key: "sold", label: "Sold" },
  { key: "materials", label: "Materials" },
  { key: "cut", label: "Cut" },
  { key: "assemble", label: "Assemble" },
  { key: "finish", label: "Finish" },
  { key: "install", label: "Install" },
];

export type CostLine = {
  id: string;
  category: "materials" | "labour" | "overhead";
  label: string;
  amount: number;
};

export type ActivityKind =
  | "pipeline_changed"
  | "health_changed"
  | "milestone_advanced"
  | "cost_edited"
  | "revenue_edited"
  | "task_completed"
  | "note";


export type Activity = {
  id: string;
  timestamp: string;
  actor: string;
  kind: ActivityKind;
  message: string;
};

export type Job = {
  id: string;
  code: string;
  name: string;
  client: string;
  address: string;
  template: "refacing" | "spray_finishing" | "install_only" | "full_project";
  pipelineStatus: PipelineStatus;
  healthStatus: HealthStatus;
  currentMilestone: MilestoneStage;
  installDate: string;
  revenue: number;
  costs: CostLine[];
  notes?: string;
  /**
   * Free-text description of what's blocking this job today.
   * When set, the Hitlist + Schedule views render this exactly and
   * `isSyntheticBlocker(job)` returns false. When undefined, the
   * synthetic heuristic in `features/jobs/lib/blockers.ts` provides a
   * fallback chip with a "demo" tag.
   */
  blocker?: string;
  /**
   * Free-text description of the next concrete action for this job.
   * Like `blocker`: when set, used verbatim; when undefined, the
   * synthetic NEXT_STEP table provides a fallback.
   */
  nextStep?: string;
  activity?: Activity[];
  invoice: {
    number: string;
    issuedDate: string;
    dueDate: string;
    lineItems: { description: string; qty: number; unitPrice: number }[];
  };
};

export type Margin = {
  costsTotal: number;
  marginAmount: number;
  marginPct: number;
  band: "on_track" | "at_risk" | "blocked";
};

export function computeMargin(job: Job): Margin {
  const costsTotal = job.costs.reduce((s, c) => s + c.amount, 0);
  const marginAmount = job.revenue - costsTotal;
  const marginPct = job.revenue > 0 ? (marginAmount / job.revenue) * 100 : 0;
  const band: Margin["band"] =
    marginPct >= 30 ? "on_track" : marginPct >= 20 ? "at_risk" : "blocked";
  return { costsTotal, marginAmount, marginPct, band };
}

export const PIPELINE_LABELS: Record<PipelineStatus, string> = {
  new: "New",
  sold: "Sold",
  in_design: "In Design",
  in_production: "In Production",
  in_finishing: "In Finishing",
  installing: "Installing",
  complete: "Complete",
};

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  blocked: "Blocked",
  complete: "Complete",
  paused: "Paused",
};
