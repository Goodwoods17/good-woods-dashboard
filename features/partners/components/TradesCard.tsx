"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { JobTrade, JobTradeStatus } from "../lib/types";
import { useTrades } from "../lib/tradesStore";
import { useSubtrades } from "../lib/subtradesStore";
import { usePartnerPeople } from "../lib/partnerPeopleStore";
import { useJobTrades } from "../lib/jobTradesStore";
import { TradePill } from "./TradePill";
import { schedulingEnabled } from "@features/scheduling/lib/featureFlag";
import { TradeDatePanel } from "./TradeDatePanel";

const STATUSES: { value: JobTradeStatus; label: string }[] = [
  { value: "needed", label: "Needed" },
  { value: "booked", label: "Booked" },
  { value: "done", label: "Done" },
];

/**
 * The Trades card on a project (/jobs/[id]). Lists the trades the job needs,
 * each optionally filled by a subtrade and a specific person, with a tap-to-add
 * suggestion strip and an add-trade picker. See features/partners/CLAUDE.md.
 */
export function TradesCard({ jobId }: { jobId: string }) {
  const { tradesForJob, addJobTrade, updateJobTrade, removeJobTrade } = useJobTrades();
  const { trades } = useTrades();

  const lines = tradesForJob(jobId);
  const activeTrades = useMemo(
    () => trades.filter((t) => t.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [trades]
  );
  const onJob = useMemo(() => new Set(lines.map((l) => l.tradeId)), [lines]);
  const suggestions = activeTrades.filter((t) => t.isSuggestedDefault && !onJob.has(t.id));

  function addLine(tradeId: string) {
    const now = new Date().toISOString();
    void addJobTrade({
      id: crypto.randomUUID(),
      jobId,
      tradeId,
      subtradeId: null,
      personId: null,
      status: "needed",
      cost: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      requestedDate: null,
      subCommittedDate: null,
      confirmedAt: null,
      confirmationToken: null,
      tokenExpiresAt: null,
    });
  }

  return (
    <section className="bg-surface rounded-xl shadow-resting p-6">
      <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
        Trades {lines.length > 0 && <span className="text-text-disabled">({lines.length})</span>}
      </h3>

      {lines.length === 0 && (
        <p className="text-sm text-text-tertiary mb-3">
          No trades on this project yet. Add the disciplines it needs, then assign who does each.
        </p>
      )}

      {lines.length > 0 && (
        <ul className="divide-y divide-hairline mb-3">
          {lines.map((line) => (
            <TradeLineRow
              key={line.id}
              line={line}
              onUpdate={(patch) => updateJobTrade(line.id, patch)}
              onRemove={() => removeJobTrade(line.id)}
            />
          ))}
        </ul>
      )}

      {/* Tap-to-add suggestion strip (registry defaults not yet on the job). */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.04em] text-text-tertiary">Suggested</span>
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => addLine(t.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--trade-${t.color})` }}
                aria-hidden
              />
              + {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Add-trade picker (any active trade). */}
      <AddTradeMenu
        trades={activeTrades}
        onPick={addLine}
        className={suggestions.length > 0 ? "mt-3" : ""}
      />
    </section>
  );
}

function TradeLineRow({
  line,
  onUpdate,
  onRemove,
}: {
  line: JobTrade;
  onUpdate: (patch: Partial<JobTrade>) => void;
  onRemove: () => void;
}) {
  const { trades } = useTrades();
  const { subtrades } = useSubtrades();
  const { peopleFor } = usePartnerPeople();

  const trade = trades.find((t) => t.id === line.tradeId);
  const subtradeOptions = useMemo(
    () => subtrades.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name)),
    [subtrades]
  );
  const people = line.subtradeId ? peopleFor("subtrade", line.subtradeId) : [];

  const [cost, setCost] = useState(line.cost != null ? String(line.cost) : "");

  function commitCost() {
    const trimmed = cost.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    const value = next != null && Number.isFinite(next) ? next : null;
    if (value !== line.cost) onUpdate({ cost: value });
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        {trade ? (
          <TradePill trade={trade} size="sm" />
        ) : (
          <span className="text-xs text-text-tertiary">Unknown trade</span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={line.status}
            onChange={(v) => onUpdate({ status: v as JobTradeStatus })}
            ariaLabel="Status"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={onRemove}
            title="Remove trade"
            className="p-1.5 rounded-md text-text-tertiary hover:text-status-blocked hover:bg-surface-muted transition-colors duration-fast"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-0.5">
        <Labelled label="Company">
          <Select
            value={line.subtradeId ?? ""}
            onChange={(v) => onUpdate({ subtradeId: v || null, personId: null })}
            ariaLabel="Subtrade"
            placeholderTone={!line.subtradeId}
          >
            <option value="">TBD</option>
            {subtradeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || "Untitled"}
              </option>
            ))}
          </Select>
        </Labelled>

        {line.subtradeId && (
          <Labelled label="Person">
            <Select
              value={line.personId ?? ""}
              onChange={(v) => onUpdate({ personId: v || null })}
              ariaLabel="Person"
              placeholderTone={!line.personId}
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.role ? ` (${p.role})` : ""}
                </option>
              ))}
            </Select>
          </Labelled>
        )}

        <Labelled label="Cost">
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            onBlur={commitCost}
            inputMode="decimal"
            placeholder="—"
            className="w-24 min-h-[32px] rounded-md border border-border bg-surface px-2.5 py-1 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          />
        </Labelled>
      </div>

      {/* S11: date wiring, behind scheduling flag */}
      {schedulingEnabled() && line.subtradeId && <TradeDatePanel line={line} onUpdate={onUpdate} />}
    </li>
  );
}

function AddTradeMenu({
  trades,
  onPick,
  className,
}: {
  trades: { id: string; label: string; color: string }[];
  onPick: (id: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <div className={cn("flex items-center", className)}>
      <label className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          Add trade
        </span>
        <Select
          value={value}
          onChange={(v) => {
            if (v) {
              onPick(v);
              setValue("");
            }
          }}
          ariaLabel="Add a trade"
          placeholderTone
        >
          <option value="">Choose…</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs uppercase tracking-[0.04em] text-text-tertiary">{label}</span>
      {children}
    </span>
  );
}

function Select({
  value,
  onChange,
  children,
  ariaLabel,
  placeholderTone,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
  placeholderTone?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={cn(
        "min-h-[32px] rounded-md border border-border bg-surface px-2.5 py-1 text-sm focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast",
        placeholderTone ? "text-text-tertiary" : "text-text-primary"
      )}
    >
      {children}
    </select>
  );
}
