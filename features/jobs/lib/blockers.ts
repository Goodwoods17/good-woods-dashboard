// Synthetic "what's blocking this job" + "what's the next step" derived
// deterministically from job.id + pipelineStatus. Used as a FALLBACK
// when the job doesn't have real `blocker` / `nextStep` fields set.
// Jobs WITH real values render those verbatim; jobs WITHOUT render
// the synthetic value with a "demo" tag.

import type { Job, JobBlocker, PipelineStatus, HealthStatus } from "@shared/lib/types";
import { deriveHealth } from "@features/jobs/lib/health";

/**
 * True when this job's blocker/nextStep is synthetic (heuristic-derived,
 * not user-set). Hitlist + Schedule render a "demo" tag in this case.
 * When `job.blocker` is set, or active external blockers exist, returns false.
 */
export function isSyntheticBlocker(job: Job, activeBlockers?: JobBlocker[]): boolean {
  if (activeBlockers?.length) return false;
  return !job.blocker;
}

/**
 * Returns the user-facing blocker text. Prefers active external blockers'
 * reason first, then `job.blocker` (real, user-set), then the synthetic label.
 * Note: visible party text (requires contact name lookup) is composed in
 * BlockerChip — this stays pure (no contacts access).
 */
export function resolveBlockerText(
  job: Job,
  today: Date = new Date(),
  activeBlockers?: JobBlocker[]
): string {
  if (activeBlockers?.length) {
    return activeBlockers[0].reason.trim() || "Externally blocked";
  }
  if (job.blocker && job.blocker.trim().length > 0) return job.blocker.trim();
  const kind = getBlocker(job, today);
  return BLOCKER_META[kind].short;
}

/**
 * Returns the BlockerKind that drives the chip tone (blocked / at_risk /
 * neutral / on_track) when rendering a synthetic blocker. For real
 * blockers (user-set or external), the chip tone is always "blocked".
 */
export function resolveBlockerTone(
  job: Job,
  today: Date = new Date(),
  activeBlockers?: JobBlocker[]
): "blocked" | "at_risk" | "neutral" | "on_track" {
  // External blockers always drive a "blocked" tone.
  if (activeBlockers?.length) return "blocked";
  // Real blocker: tone follows the job's health.
  if (job.blocker && job.blocker.trim().length > 0) {
    const h = deriveHealth(job, today);
    if (h === "blocked") return "blocked";
    if (h === "at_risk") return "at_risk";
    if (h === "on_track" || h === "complete") return "on_track";
    return "neutral";
  }
  // Synthetic: tone comes from the BlockerKind table.
  return BLOCKER_META[getBlocker(job, today)].tone;
}

export type BlockerKind =
  | "subcontractor"
  | "toolpath_cnc"
  | "materials"
  | "customer"
  | "internal"
  | "none";

export const BLOCKER_META: Record<
  BlockerKind,
  { label: string; short: string; tone: "blocked" | "at_risk" | "neutral" | "on_track" }
> = {
  subcontractor: { label: "Waiting on subcontractor quote", short: "Sub quote", tone: "at_risk" },
  toolpath_cnc: { label: "Waiting on Toolpath CNC", short: "Toolpath", tone: "at_risk" },
  materials: { label: "Need to order materials", short: "Materials", tone: "blocked" },
  customer: { label: "Awaiting client decision", short: "Client", tone: "at_risk" },
  internal: { label: "Internal — needs shop/design time", short: "Internal", tone: "neutral" },
  none: { label: "Nothing blocking", short: "Clear", tone: "on_track" },
};

// Cheap deterministic hash so the same job always lands on the same synthetic blocker.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Plausible blocker candidates per stage. Reflects how Andrew actually thinks
// about what's stuck at each step of a cabinetry job.
const CANDIDATES_BY_STAGE: Record<PipelineStatus, BlockerKind[]> = {
  new: ["customer", "none"],
  sold: ["customer", "internal", "none"],
  in_design: ["subcontractor", "customer", "internal", "internal"],
  in_production: ["toolpath_cnc", "materials", "toolpath_cnc", "none"],
  in_finishing: ["materials", "internal", "none"],
  installing: ["customer", "none", "none"],
  complete: ["none"],
};

export function getBlocker(job: Job, today: Date = new Date()): BlockerKind {
  const health = deriveHealth(job, today);
  if (health === "complete" || job.pipelineStatus === "complete") return "none";
  if (health === "paused") return "customer";
  const candidates = CANDIDATES_BY_STAGE[job.pipelineStatus] ?? ["none"];
  if (health === "blocked") {
    const hard = candidates.find((c) => c !== "none" && c !== "internal");
    if (hard) return hard;
  }
  return candidates[hash(job.id) % candidates.length];
}

// Human-facing next step. Stage × blocker product.
const NEXT_STEP: Record<PipelineStatus, Partial<Record<BlockerKind, string>>> = {
  new: {
    customer: "Confirm scope with client",
    none: "Send deposit invoice",
  },
  sold: {
    customer: "Awaiting signed deposit",
    internal: "Schedule site measure",
    none: "Schedule site measure",
  },
  in_design: {
    subcontractor: "Chase drawer/hardware quotes",
    customer: "Awaiting finish + door selection",
    internal: "Draft cabinet schedule",
    none: "Issue cut list to shop",
  },
  in_production: {
    toolpath_cnc: "Slot on Toolpath CNC queue",
    materials: "Order edgebanding + hardware",
    internal: "Cut + assemble in shop",
    none: "Cut + assemble in shop",
  },
  in_finishing: {
    materials: "Order spray top-up + sandpaper",
    internal: "Spray + cure",
    none: "Spray + cure",
  },
  installing: {
    customer: "Confirm site access window",
    internal: "Install crew on-site",
    none: "Install crew on-site",
  },
  complete: {
    none: "Collect final payment",
  },
};

export function getNextStep(job: Job, today: Date = new Date()): string {
  // Real next-step wins.
  if (job.nextStep && job.nextStep.trim().length > 0) return job.nextStep.trim();
  const stageMap = NEXT_STEP[job.pipelineStatus] ?? {};
  const blocker = getBlocker(job, today);
  return stageMap[blocker] ?? stageMap.none ?? "—";
}

// Priority ranking for the hitlist:
//   1. Blocked health  → top
//   2. At-risk health  → next
//   3. Closer install date → bumps within band
//   4. Pipeline stage ordinal as a tie-breaker
export type HitlistEntry = {
  job: Job;
  blocker: BlockerKind;
  nextStep: string;
  daysToInstall: number;
  priority: number; // lower = more urgent
};

const STAGE_ORDER: Record<PipelineStatus, number> = {
  new: 0,
  sold: 1,
  in_design: 2,
  in_production: 3,
  in_finishing: 4,
  installing: 5,
  complete: 6,
};

const HEALTH_WEIGHT: Record<HealthStatus, number> = {
  blocked: 0,
  at_risk: 100,
  on_track: 200,
  paused: 300,
  complete: 1000,
};

export function buildHitlist(
  jobs: Job[],
  today: Date = new Date(),
  activeByJob?: Map<string, JobBlocker[]>
): HitlistEntry[] {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return jobs
    .filter((j) => j.pipelineStatus !== "complete")
    .map((job) => {
      const blocker = getBlocker(job, t);
      const nextStep = getNextStep(job, t);
      const installMs = new Date(job.installDate + "T12:00:00").getTime();
      const daysToInstall = Math.round((installMs - t.getTime()) / (1000 * 60 * 60 * 24));
      const urgencyFromDate = Math.max(0, Math.min(60, daysToInstall));
      const priority =
        HEALTH_WEIGHT[deriveHealth(job, t, activeByJob?.get(job.id) ?? [])] +
        urgencyFromDate +
        STAGE_ORDER[job.pipelineStatus] * 0.01;
      return { job, blocker, nextStep, daysToInstall, priority };
    })
    .sort((a, b) => a.priority - b.priority);
}
