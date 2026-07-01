"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Pencil } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatCAD } from "@shared/lib/format";
import { useJobs } from "@features/jobs/lib/jobsStore";
import type { Subtrade } from "../lib/types";
import { useTrades } from "../lib/tradesStore";
import { useJobTrades } from "../lib/jobTradesStore";
import { TradePill } from "./TradePill";
import { PeopleSection } from "./PeopleSection";

const STATUS_LABEL: Record<string, string> = {
  needed: "Needed",
  booked: "Booked",
  done: "Done",
};

export function SubtradeDetail({ subtrade }: { subtrade: Subtrade }) {
  const { trades } = useTrades();
  const { jobs } = useJobs();
  const { jobTrades } = useJobTrades();

  const trade = subtrade.tradeId ? trades.find((t) => t.id === subtrade.tradeId) : undefined;
  const tradeById = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const lines = useMemo(
    () =>
      jobTrades
        .filter((l) => l.subtradeId === subtrade.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobTrades, subtrade.id]
  );

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl">
      <Link
        href="/partners"
        className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to Partners
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-7">
        <div className="min-w-0">
          <h1 className="font-serif text-headline font-medium text-text-primary truncate">
            {subtrade.name || "Untitled subtrade"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {trade ? (
              <TradePill trade={trade} />
            ) : (
              <span className="text-xs text-text-tertiary">No trade set</span>
            )}
            {!subtrade.active && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-text-tertiary">
                Archived
              </span>
            )}
          </div>
          {subtrade.description && (
            <p className="mt-3 max-w-xl text-sm text-text-secondary leading-relaxed">
              {subtrade.description}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <Link
            href={`/subtrades/${subtrade.id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink-pill text-white px-5 min-h-[40px] text-sm font-medium hover:bg-accent-active transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            Edit
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero: jobs worked (the trade-lines this subtrade fills). */}
        <div className="lg:col-span-2 space-y-6">
          <Section title={`Jobs worked (${lines.length})`}>
            {lines.length === 0 ? (
              <p className="text-sm text-text-tertiary px-5 pb-5">
                No jobs yet. Assign this subtrade to a project from its Trades card and it will show
                up here.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-muted">
                    <Th>Project</Th>
                    <Th>Trade</Th>
                    <Th>Status</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const job = jobById.get(l.jobId);
                    const lineTrade = tradeById.get(l.tradeId);
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          "hover:bg-surface-muted/40 transition-colors duration-fast",
                          idx > 0 && "border-t border-hairline"
                        )}
                      >
                        <td className="px-4 py-3">
                          {job ? (
                            <Link
                              href={`/jobs/${job.id}`}
                              className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                            >
                              {job.name}
                            </Link>
                          ) : (
                            <span className="text-text-tertiary">Unknown project</span>
                          )}
                          {job && (
                            <div className="text-xs text-text-tertiary font-mono">{job.code}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lineTrade ? <TradePill trade={lineTrade} size="sm" /> : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {STATUS_LABEL[l.status] ?? l.status}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                          {l.cost != null ? (
                            formatCAD(l.cost)
                          ) : (
                            <span className="text-text-disabled">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Quiet sidebar: people, company details, notes. */}
        <aside className="space-y-6">
          <PeopleSection kind="subtrade" companyId={subtrade.id} />

          {(subtrade.address || subtrade.typicalRateNote) && (
            <Section title="Details">
              <dl className="px-5 py-4 space-y-3 text-sm">
                {subtrade.address && (
                  <Fact
                    label="Address"
                    value={
                      <span className="inline-flex items-start gap-1.5 text-text-primary">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={1.75} />
                        {subtrade.address}
                      </span>
                    }
                  />
                )}
                {subtrade.typicalRateNote && (
                  <Fact label="Typical rate" value={subtrade.typicalRateNote} />
                )}
              </dl>
            </Section>
          )}

          {subtrade.notes && (
            <Section title="Notes">
              <p className="px-5 py-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                {subtrade.notes}
              </p>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-2xl shadow-resting overflow-hidden">
      <div className="px-5 py-3 bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium pt-0.5 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-text-primary text-right min-w-0">{value}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-label uppercase text-text-tertiary font-medium",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}
