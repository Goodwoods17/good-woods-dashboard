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

// ─── Forms (form builder) ─────────────────────────────────────────────────
// Vocabulary (features/forms/CONTEXT.md): master = "Form template", filled copy
// = "Form instance". The field-registry model — every field is a row with a
// `type` + JSON `config`, so new field types never need a migration. Instances
// SNAPSHOT their template's field defs (frozen at attach time, never auto-update
// from the master). `type` is validated in TS (this union), not by a DB enum.

// v1 ships section + checkbox; the rest land in slice 2 (already typed so the
// registry's exhaustiveness check guides the build, but unknown DB types render
// via a safe read-only fallback so the app never crashes on a future type).
export type FieldType =
  | "section"
  | "checkbox"
  | "short_text"
  | "long_text"
  | "number"
  | "yes_no"
  | "dropdown"
  | "date"
  | "photo"
  | "signature";

// The 6-phase spine (ADR 0008). A form template may be tagged to a phase (or
// null = unphased); the instance snapshots the tag so the job Forms tab can
// group/sort by phase. Distinct from MilestoneStage ("cnc_cut" vs "cnc") because
// this is a form-domain tag (issue #32 locked decision), not the milestone key.
export type FormPhase = "design" | "cnc_cut" | "assembly" | "finishing" | "delivery" | "install";

export type FormStatus = "draft" | "in_progress" | "complete";

// Per-type knobs live here as loosely-typed JSON so adding a field type never
// touches the schema. Slice 1 only reads section/checkbox (neither needs config).
export type FieldConfig = Record<string, unknown>;

export type FormTemplate = {
  id: string;
  name: string;
  description: string | null;
  phase: FormPhase | null;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FormTemplateField = {
  id: string;
  templateId: string;
  label: string;
  type: FieldType;
  config: FieldConfig;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FormInstance = {
  id: string;
  templateId: string | null;
  jobId: string | null; // nullable = standalone (slice 2)
  title: string;
  phase: FormPhase | null; // snapshot of the template's phase at attach time
  status: FormStatus;
  signoffPath: string | null;
  completedAt: string | null;
  completedBy: string | null; // authenticated user (id/email)
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// A snapshot of a template field def (label/type/config) PLUS the filler's
// answer. Frozen at attach time — never auto-updated from the master.
export type FormInstanceField = {
  id: string;
  instanceId: string;
  label: string;
  type: FieldType;
  config: FieldConfig;
  value: unknown | null; // typed per field type at the renderer boundary
  checked: boolean | null; // checkbox answer
  note: string | null;
  photoUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// The recipient a share link is issued to. Validated in TS (not a DB enum) so
// the vocabulary can evolve without a migration — mirrors FieldType / FormPhase.
export type RecipientType = "designer" | "customer" | "other";

// The owner-private lifecycle of a single share link, derived from its *_at
// stamps. Strictly ordered: each later state implies all earlier ones reached.
// "created" = minted but not yet sent (no recipient has the URL).
export type RecipientStatus = "created" | "sent" | "opened" | "started" | "submitted";

// A no-login token link to one form instance, scoped to a single recipient.
// No expiry: reusable until manually revoked (revokedAt). The token is the only
// key. lockedFieldIds are read-only for this recipient (enforced server-side in
// the /f/<token> route, not just hidden). Many links per instance = multi-recipient.
export type FormShareLink = {
  id: string;
  instanceId: string;
  token: string;
  recipientName: string | null;
  recipientType: RecipientType;
  lockedFieldIds: string[];
  sentAt: string | null;
  viewedAt: string | null;
  // First answer change on /f/<token> (between opened and submitted).
  startedAt: string | null;
  submittedAt: string | null;
  // Owner-visible completion %, 0..100, recomputed on each public submit.
  progress: number | null;
  // Signature audit trail (quiet server-side capture; never shown to the client).
  signatureAffirmed: boolean | null;
  signedIp: string | null;
  signedUserAgent: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

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

export type AnnotationType = "ink" | "highlight" | "shape" | "text";

/** Ink/highlight payload: normalized input points [x, y, pressure]. */
export type StrokeData = { points: [number, number, number][] };

export type ShapeKind = "arrow" | "rect" | "line";
/** Shape payload: endpoints (arrow/line) or opposite corners (rect), normalized 0–1. */
export type ShapeData = { shape: ShapeKind; x1: number; y1: number; x2: number; y2: number };
/** Text note: top-left x/y (0–1) + the words + fontSize normalized to page height. */
export type TextData = { x: number; y: number; text: string; fontSize: number };

/** Discriminated by `Annotation.type`: ink/highlight→StrokeData, shape→ShapeData, text→TextData. */
export type AnnotationData = StrokeData | ShapeData | TextData;

export type Annotation = {
  id: string;
  documentId: string;
  projectId: string;
  page: number;
  type: AnnotationType;
  data: AnnotationData; // discriminated by `type`
  color: string;
  strokeWidth?: number | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
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
