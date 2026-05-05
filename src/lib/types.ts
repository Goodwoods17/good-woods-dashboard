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
