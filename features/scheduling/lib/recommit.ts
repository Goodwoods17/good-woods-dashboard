/**
 * S14 — Re-commit flow + revision history + reason codes + change-order
 * handling (issue #102). Pure + dependency-free (one internal scheduling import).
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * The client-committed install date is a PROMISE. When it must change it is
 * never silently overwritten — it is RE-COMMITTED: a deliberate decision that
 * picks a reason code, lands a concrete new date + fresh buffer, and logs a
 * versioned `commitment_revision` (old / new / reason / who / when). The owner
 * then sends the client an early, concrete draft email for approval.
 *
 * Two distinct kinds:
 *   – `recommit`     — the schedule slipped; the shop is moving the date. Only a
 *                      shop-attributable reason dings the reliability scorecard
 *                      (S25). Recovery-FIRST: only after the buffer is truly
 *                      blown (RED), never on a yellow wobble or at the last minute.
 *   – `change_order` — added scope re-evaluates the schedule and proposes a new
 *                      committed date bundled into the change-order approval. A
 *                      change order is a deliberate, client-approved scope
 *                      decision, so it NEVER dings reliability; small ones absorb
 *                      into the existing buffer with no date move at all.
 */

import type { FeverZone } from "./bufferBurn";
import { capacityAwareCommittedDate } from "./committedDate";

// ── Kinds + reason codes ─────────────────────────────────────────────────────

/** A re-commit (shop slip) vs. a change order (client-approved scope change). */
export type RevisionKind = "recommit" | "change_order";

/** Why the committed date moved. Feeds the PPC reliability scorecard (S25). */
export type RecommitReasonCode =
  | "sub_delay"
  | "material_delay"
  | "shop_capacity"
  | "rework"
  | "estimate_miss"
  | "client_delay"
  | "scope_change"
  | "force_majeure";

export type ReasonCodeMeta = {
  code: RecommitReasonCode;
  label: string;
  /**
   * True when the slip is the shop's own fault — an attributable reason dings
   * the shop's date-keeping reliability. Client-caused, scope, and force-majeure
   * reasons are external and do not.
   */
  attributable: boolean;
};

/** The reason-code catalogue, ordered shop-attributable first then external. */
export const RECOMMIT_REASON_CODES: readonly ReasonCodeMeta[] = [
  { code: "sub_delay", label: "Sub-trade delay", attributable: true },
  { code: "material_delay", label: "Material / supply delay", attributable: true },
  { code: "shop_capacity", label: "Shop capacity / overload", attributable: true },
  { code: "rework", label: "Rework / quality miss", attributable: true },
  { code: "estimate_miss", label: "Underestimated effort", attributable: true },
  { code: "client_delay", label: "Client-caused delay", attributable: false },
  { code: "scope_change", label: "Added scope (change order)", attributable: false },
  { code: "force_majeure", label: "Weather / force majeure", attributable: false },
] as const;

const REASON_META = new Map<RecommitReasonCode, ReasonCodeMeta>(
  RECOMMIT_REASON_CODES.map((r) => [r.code, r])
);

export function reasonCodeMeta(code: RecommitReasonCode): ReasonCodeMeta {
  return REASON_META.get(code) ?? { code, label: code, attributable: true };
}

/**
 * Whether this revision dings the shop's date-keeping reliability. A change
 * order never does (deliberate, client-approved scope decision); a plain
 * re-commit does only when the reason is shop-attributable.
 */
export function dingsReliability(kind: RevisionKind, reasonCode: RecommitReasonCode): boolean {
  if (kind === "change_order") return false;
  return reasonCodeMeta(reasonCode).attributable;
}

// ── Recovery-first gate ──────────────────────────────────────────────────────

export type RecoveryGate = {
  /** True once the date may be re-committed (the buffer is truly blown). */
  canRecommit: boolean;
  /** True when the job is in the RED recovery window. */
  inRecoveryWindow: boolean;
  /** Owner-facing guidance for the current state. */
  message: string;
};

/**
 * Recovery-first: the client's date should only move once the buffer is truly
 * blown (RED) and recovery within the buffer has failed. Before that the owner
 * recovers, not re-commits — so the client hears at the re-commit DECISION
 * (early, concrete), never at every yellow wobble, and never at the last minute.
 * (Change orders bypass this gate — they are deliberate scope decisions.)
 */
export function recommitRecoveryGate(zone: FeverZone): RecoveryGate {
  const inRecoveryWindow = zone === "red";
  return {
    canRecommit: inRecoveryWindow,
    inRecoveryWindow,
    message: inRecoveryWindow
      ? "Recovery window reached — re-commit now with a concrete new date the client can rely on."
      : "Recover within the buffer first. Don't move the client's date on a yellow wobble.",
  };
}

// ── Change-order impact ──────────────────────────────────────────────────────

export type ChangeOrderImpact = {
  /** Added scope fits inside the remaining buffer → committed date holds. */
  absorbs: boolean;
  /** Work days the committed date must move out (0 when it absorbs). */
  committedDateDeltaDays: number;
};

/**
 * How added scope affects the committed date. Small change orders absorb into
 * the remaining buffer (no date move); larger ones push the committed date out
 * by only the overflow beyond the buffer.
 */
export function changeOrderImpact(
  addedWorkDays: number,
  remainingBufferDays: number
): ChangeOrderImpact {
  const added = Math.max(0, addedWorkDays);
  const remaining = Math.max(0, remainingBufferDays);
  if (added <= remaining) return { absorbs: true, committedDateDeltaDays: 0 };
  return { absorbs: false, committedDateDeltaDays: added - remaining };
}

/** Advance a committed date by N work days (Mon–Fri), skipping weekends. */
export function pushCommittedDate(committedDate: string, deltaWorkDays: number): string {
  return capacityAwareCommittedDate(committedDate, deltaWorkDays);
}

// ── Commitment revision (versioned, never silently overwritten) ──────────────

export type CommitmentRevision = {
  id: string;
  jobId: string;
  kind: RevisionKind;
  reasonCode: RecommitReasonCode;
  oldCommittedDate: string | null;
  newCommittedDate: string;
  oldBufferDays: number | null;
  newBufferDays: number | null;
  /** Whether this revision dings the shop reliability scorecard (S25). */
  dingsReliability: boolean;
  note: string | null;
  revisedBy: string | null;
  /** ISO timestamp the revision was logged. */
  revisedAt: string;
};

export type BuildRevisionInput = {
  id?: string;
  jobId: string;
  kind: RevisionKind;
  reasonCode: RecommitReasonCode;
  oldCommittedDate: string | null;
  newCommittedDate: string;
  oldBufferDays?: number | null;
  newBufferDays?: number | null;
  note?: string | null;
  revisedBy?: string | null;
  revisedAt?: string;
};

function fallbackId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `rev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Assemble a versioned commitment revision, deriving the reliability-ding flag
 * from kind + reason. The committed date is captured as old → new so the history
 * is auditable; the date is never silently overwritten.
 */
export function buildCommitmentRevision(input: BuildRevisionInput): CommitmentRevision {
  return {
    id: input.id ?? fallbackId(),
    jobId: input.jobId,
    kind: input.kind,
    reasonCode: input.reasonCode,
    oldCommittedDate: input.oldCommittedDate,
    newCommittedDate: input.newCommittedDate,
    oldBufferDays: input.oldBufferDays ?? null,
    newBufferDays: input.newBufferDays ?? null,
    dingsReliability: dingsReliability(input.kind, input.reasonCode),
    note: input.note ?? null,
    revisedBy: input.revisedBy ?? null,
    revisedAt: input.revisedAt ?? new Date().toISOString(),
  };
}

// ── Client email draft (early + concrete) ────────────────────────────────────

export type ClientEmailDraft = { subject: string; body: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO date as "Dec 22, 2026" without locale/timezone surprises. */
export function friendlyDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  const day = Number(m[3]);
  return `${month} ${day}, ${year}`;
}

/**
 * Draft the client-facing approval email for a re-commit / change order. The
 * draft is concrete (names the new date plainly) and honest — exactly what the
 * owner should send the moment the re-commit decision is made.
 */
export function draftRecommitEmail(input: {
  clientName: string;
  jobName: string;
  oldCommittedDate: string | null;
  newCommittedDate: string;
  kind: RevisionKind;
  reasonLabel: string;
}): ClientEmailDraft {
  const { clientName, jobName, oldCommittedDate, newCommittedDate, kind, reasonLabel } = input;
  const newPretty = friendlyDate(newCommittedDate);
  const oldPretty = friendlyDate(oldCommittedDate);

  if (kind === "change_order") {
    return {
      subject: `${jobName} — updated install date with your change order`,
      body: [
        `Hi ${clientName},`,
        ``,
        `Thanks for the go-ahead on the added scope (${reasonLabel}). That extra work`,
        `shifts your install a little: the new target is ${newPretty} (was ${oldPretty}).`,
        ``,
        `This new date is bundled into the change-order approval — once you approve the`,
        `change order, this becomes your committed install date. Let me know if that works.`,
        ``,
        `Best,`,
        `Good Woods`,
      ].join("\n"),
    };
  }

  return {
    subject: `${jobName} — updated install date`,
    body: [
      `Hi ${clientName},`,
      ``,
      `I want to give you an honest, early heads-up on your install date. Because of`,
      `${reasonLabel.toLowerCase()}, we're moving your committed install to ${newPretty}`,
      `(it was ${oldPretty}).`,
      ``,
      `I'd rather tell you now, with a concrete new date you can plan around, than have`,
      `it slip quietly. Please reply to confirm this works for you.`,
      ``,
      `Best,`,
      `Good Woods`,
    ].join("\n"),
  };
}
