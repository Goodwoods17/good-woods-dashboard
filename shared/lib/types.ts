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

export type PetType = "dog" | "cat" | "other";

export type SiteContactRole =
  | "homeowner"
  | "property_manager"
  | "super"
  | "neighbour"
  | "other";

/**
 * Install-day intel for the crew. Mostly optional; the form leaves
 * blanks for fields Andrew doesn't know yet. Lives as a jsonb column on
 * public.jobs (added 2026-05-25). InstallCard surfaces a conditional
 * pill strip from this shape so the highest-stakes items read at a
 * glance on the install day.
 */
export type SiteAccess = {
  installAddress?: string | null;
  buzzerCode?: string | null;
  doorCode?: string | null;
  lockboxCode?: string | null;
  parkingNotes?: string | null;
  buildingAccessNotes?: string | null;
  elevatorRequired?: boolean;
  elevatorWindow?: string | null;
  floorProtection?: string | null;
  demoRequired?: boolean;
  demoScope?: string | null;
  pet?: {
    type?: PetType | null;
    name?: string | null;
    note?: string | null;
  };
  siteContact?: {
    name?: string | null;
    phone?: string | null;
    role?: SiteContactRole | null;
  };
  bestContactWindow?: string | null;
  photosUrl?: string | null;
};

export const SITE_CONTACT_ROLE_LABELS: Record<SiteContactRole, string> = {
  homeowner: "Homeowner",
  property_manager: "Property manager",
  super: "Super",
  neighbour: "Neighbour",
  other: "Other",
};

export const PET_TYPE_LABELS: Record<PetType, string> = {
  dog: "Dog",
  cat: "Cat",
  other: "Other",
};

export type ContactKind = "person" | "org";

export type RoleTag = "designer" | "architect" | "gc" | "homeowner";

export const ROLE_TAGS: RoleTag[] = ["designer", "architect", "gc", "homeowner"];

export const ROLE_TAG_LABELS: Record<RoleTag, string> = {
  designer: "Designer",
  architect: "Architect",
  gc: "GC",
  homeowner: "Homeowner",
};

export type EmailEntry = { label: string; value: string };
export type PhoneEntry = { label: string; value: string };

export type Contact = {
  id: string;
  kind: ContactKind;
  parentId?: string | null;
  name: string;
  roleTags: RoleTag[];
  emails: EmailEntry[];
  phones: PhoneEntry[];
  address?: string | null;
  website?: string | null;
  notes?: string | null;
  introducedById?: string | null;
  isAnchor: boolean;
  lastTouchedAt?: string | null;
  followUpAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
};

export type Job = {
  id: string;
  code: string;
  name: string;
  /**
   * Legacy display fallback. Kept for one release while UI migrates to
   * payerId-based rendering via the contacts store. Drop in a follow-up
   * migration once every read path uses payer/designer/etc. lookups.
   */
  client: string;
  /**
   * Billable party. NOT NULL in the DB after the 2026-05-25 backfill, but
   * typed optional here until commit #2 updates jobsRowMap + /jobs/new to
   * write it. Tighten to required once the UI path is complete.
   */
  payerId?: string | null;
  designerId?: string | null;
  architectId?: string | null;
  gcId?: string | null;
  homeownerId?: string | null;
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
  /** Install-day intel. See SiteAccess type. */
  siteAccess?: SiteAccess;
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
