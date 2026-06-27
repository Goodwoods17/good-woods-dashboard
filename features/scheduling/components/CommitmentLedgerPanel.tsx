"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Circle, ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatDate } from "@shared/lib/format";
import { hasSupabase, getSupabase, COMMITMENT_LEDGER_TABLE } from "@shared/lib/supabase";
import type { Job } from "@shared/lib/types";
import {
  buildCommitmentLedger,
  computeOwnerReliability,
  ownerReliabilityBufferDays,
  type LedgerEntry,
  type CommitmentStatus,
  type OwnerReliabilityRecord,
} from "../lib/commitmentLedger";

// ─── DB row shape (subset we read) ────────────────────────────────────────────

type LedgerRow = {
  owner_kind: OwnerReliabilityRecord["ownerKind"];
  owner_id: string | null;
  owner_name: string;
  committed_date: string;
  actual_date: string | null;
  missed: boolean;
};

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<CommitmentStatus, { label: string; cls: string; Icon: typeof Circle }> =
  {
    kept: { label: "Kept", cls: "bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
    missed: {
      label: "Missed",
      cls: "bg-status-blocked-soft text-status-blocked",
      Icon: AlertCircle,
    },
    open: { label: "Open", cls: "bg-surface-muted text-text-secondary", Icon: Circle },
  };

function StatusPill({ status }: { status: CommitmentStatus }) {
  const { label, cls, Icon } = STATUS_STYLE[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        cls
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

const OWNER_KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  person: "Person",
  subtrade: "Subtrade",
};

function LedgerRowView({ entry }: { entry: LedgerEntry }) {
  const testid =
    entry.level === "client" ? "ledger-entry-client" : `ledger-entry-phase-${entry.phase}`;
  return (
    <li
      data-testid={testid}
      data-status={entry.status}
      data-owner-kind={entry.owner.kind}
      className="flex items-center gap-3 px-4 py-2.5"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{entry.label}</div>
        <div className="text-xs text-text-tertiary">
          owned by <span className="text-text-secondary">{entry.owner.name}</span>
          <span className="ml-1 rounded bg-surface-muted px-1 py-0 text-[10px] uppercase tracking-wide text-text-tertiary">
            {OWNER_KIND_LABEL[entry.owner.kind] ?? entry.owner.kind}
          </span>
        </div>
      </div>
      <span className="text-xs tabular-nums text-text-secondary">
        {formatDate(entry.committedDate)}
      </span>
      <StatusPill status={entry.status} />
    </li>
  );
}

/**
 * Commitment ledger panel for the Schedule tab (S13, issue #101).
 *
 * Two-level, dates-as-promises view:
 *   – the client-committed install (shop-owned), then
 *   – each phase's internal commitment with its named owner.
 * Below the ledger, a per-owner reliability roll-up (subtrades included) shows
 * who keeps their dates, and how many buffer days that history earns on the next
 * job (the buffer learns which owners to trust).
 *
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED; the parent only mounts it when the
 * flag is on, so it renders unconditionally once slotted in.
 */
export function CommitmentLedgerPanel({ job }: { job: Job }) {
  const [records, setRecords] = useState<OwnerReliabilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        let rows: LedgerRow[] = [];
        if (hasSupabase()) {
          const { data, error } = await getSupabase()
            .from(COMMITMENT_LEDGER_TABLE)
            .select("owner_kind, owner_id, owner_name, committed_date, actual_date, missed");
          if (!error && data) rows = data as LedgerRow[];
        }
        if (cancelled) return;
        setRecords(
          rows.map((r) => ({
            ownerKind: r.owner_kind,
            ownerId: r.owner_id,
            ownerName: r.owner_name,
            committedDate: r.committed_date,
            actualDate: r.actual_date,
            missed: r.missed,
          }))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ledger = buildCommitmentLedger(job, new Date());
  const clientEntries = ledger.filter((e) => e.level === "client");
  const phaseEntries = ledger.filter((e) => e.level === "phase");

  const reliability = computeOwnerReliability(records);
  const bufferDays = ownerReliabilityBufferDays(records);

  return (
    <section
      data-testid="commitment-ledger-panel"
      className="bg-surface rounded-xl shadow-resting p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Commitment ledger
        </h3>
        <span className="text-xs text-text-tertiary">Dates as promises</span>
      </div>
      <p className="mb-4 text-xs text-text-tertiary">
        Every date is an explicit promise with a named owner — two levels: the client-committed
        install (the shop&rsquo;s promise) and each phase&rsquo;s internal commitment.
      </p>

      {/* ── Client-level commitment ── */}
      <div className="mb-4">
        <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          Client commitment
        </h4>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {clientEntries.map((e) => (
            <LedgerRowView key="client" entry={e} />
          ))}
        </ul>
      </div>

      {/* ── Internal phase commitments ── */}
      <div className="mb-4">
        <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          Internal commitments
        </h4>
        {phaseEntries.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {phaseEntries.map((e) => (
              <LedgerRowView key={e.phase ?? "?"} entry={e} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-tertiary">No internal targets set yet.</p>
        )}
      </div>

      {/* ── Per-owner reliability ── */}
      <div
        data-testid="owner-reliability"
        className="rounded-lg border border-border bg-surface-muted p-4"
      >
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-text-tertiary" aria-hidden />
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            Owner reliability
          </h4>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading date-keeping history…
          </div>
        ) : reliability.length === 0 ? (
          <p className="text-xs text-text-tertiary">No date-keeping history yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {reliability.map((r) => {
              const pct = Math.round(r.missRate * 100);
              return (
                <li
                  key={r.ownerKey}
                  data-testid={`owner-reliability-${r.ownerKey.replace(/[^a-z0-9]+/gi, "-")}`}
                  data-owner-kind={r.ownerKind}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="flex-1 text-text-secondary">{r.ownerName}</span>
                  <span className="tabular-nums text-text-tertiary">
                    {r.kept}/{r.total} kept
                  </span>
                  <span
                    className={cn(
                      "tabular-nums rounded px-1.5 py-0.5 font-medium",
                      pct === 0
                        ? "bg-emerald-50 text-emerald-700"
                        : pct >= 50
                          ? "bg-status-blocked-soft text-status-blocked"
                          : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {pct}% missed
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p
          data-testid="owner-reliability-buffer-days"
          data-days={bufferDays}
          className="mt-3 border-t border-border pt-2 text-xs text-text-tertiary"
        >
          Earned buffer from owner reliability:{" "}
          <span className="font-medium text-text-secondary tabular-nums">{bufferDays}d</span> (feeds
          the risk-tiered buffer)
        </p>
      </div>
    </section>
  );
}
