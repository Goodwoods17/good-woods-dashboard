export type PipelineStatus =
  | "new"
  | "sold"
  | "in_design"
  | "in_production"
  | "in_finishing"
  | "installing"
  | "complete";

export type HealthStatus = "on_track" | "at_risk" | "blocked" | "complete" | "paused";

export type MilestoneStage = "design" | "cnc" | "assembly" | "finishing" | "delivery" | "install";

export const MILESTONE_STAGES: { key: MilestoneStage; label: string }[] = [
  { key: "design", label: "Design" },
  { key: "cnc", label: "CNC / Cut" },
  { key: "assembly", label: "Assembly" },
  { key: "finishing", label: "Finishing" },
  { key: "delivery", label: "Delivery" },
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

export type DocumentKind =
  | "designer"
  | "toolpath_cnc"
  | "shop"
  | "architect"
  | "appliance"
  | "permit"
  | "photo"
  | "other";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  designer: "Designer",
  toolpath_cnc: "Toolpath CNC",
  shop: "Shop",
  architect: "Architect",
  appliance: "Appliance",
  permit: "Permit",
  photo: "Photo",
  other: "Other",
};

export const DOCUMENT_KIND_ORDER: DocumentKind[] = [
  "designer",
  "shop",
  "toolpath_cnc",
  "architect",
  "appliance",
  "permit",
  "photo",
  "other",
];

export type DocumentSource = "upload" | "link" | "sketch";

export type ProjectDocument = {
  id: string;
  projectId: string;
  kind: DocumentKind;
  label: string;
  /** External/Drive URL when source='link'; null for uploads/sketches. */
  driveUrl: string | null;
  version?: string | null;
  isCurrent: boolean;
  notes?: string | null;
  uploadedBy?: string | null;
  createdAt: string;
  /** How the document is stored. Existing rows default to 'link'. */
  source: DocumentSource;
  /** Path in the private job-documents bucket when source='upload'. */
  storagePath?: string | null;
  /** MIME of the uploaded file. */
  mime?: string | null;
  /** PDF page count (1 for images); null until known. */
  pageCount?: number | null;
};

export type PieceKind = "cabinet" | "end_panel" | "scribe" | "toe_kick" | "filler";
export type CutMethod = "inhouse" | "cnc_sub";
export type PieceSource = "manual" | "mozaik";
/** A lifecycle position: "not_started" | one of the kind's stages | "done". */
export type PieceStatus = string;

export type JobPiece = {
  id: string;
  projectId: string;
  kind: PieceKind;
  subtype?: string | null;
  code?: string | null;
  room?: string | null;
  label: string;
  cutMethod?: CutMethod | null;
  status: PieceStatus;
  statusUpdatedAt?: string | null;
  statusUpdatedBy?: string | null;
  source: PieceSource;
  sourceRef?: string | null;
  pinDocumentId?: string | null;
  pinPage?: number | null;
  pinX?: number | null;
  pinY?: number | null;
  sortOrder: number;
  dimensions?: string | null;
  material?: string | null;
  edgeband?: string | null;
  parentRef?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

/**
 * Where the client came from. Used to attribute revenue to anchor
 * relationships and channels.
 */
export const JOB_SOURCE_PRESETS = [
  "Raubyn Design Studio",
  "SayWell Developments",
  "Repeat client",
  "Referral",
  "Google",
  "Walk-in",
  "Instagram",
  "Other",
] as const;
export type JobSourcePreset = (typeof JOB_SOURCE_PRESETS)[number];

export type PetType = "dog" | "cat" | "other";

export type SiteContactRole = "homeowner" | "property_manager" | "super" | "neighbour" | "other";

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
  /** How the client found us. Free-text but UI suggests from JOB_SOURCE_PRESETS. */
  source?: string | null;
  /** Original quote, kept separate from `revenue` (which trends toward final). */
  estimatedRevenue?: number | null;
};

export type JobBlocker = {
  id: string;
  jobId: string;
  reason: string;
  waitingOnContactId: string | null;
  waitingOnLabel: string | null;
  gatedPhaseId: MilestoneStage | null;
  raisedAt: string; // ISO
  resolvedAt: string | null;
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
