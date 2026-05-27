"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Inbox,
  Search,
} from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useContacts } from "@features/contacts/lib/contactsStore";
import {
  computeMargin,
  PIPELINE_LABELS,
  type PipelineStatus,
} from "@shared/lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { MarginCell } from "@shared/components/ui/MarginCell";
import { cn } from "@shared/lib/utils";

type StatusFilter = "all" | "active" | "complete" | PipelineStatus;
type SortKey = "install" | "revenue" | "code";
type SortDir = "asc" | "desc";

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "complete", label: "Complete" },
  { key: "sold", label: PIPELINE_LABELS.sold },
  { key: "in_design", label: PIPELINE_LABELS.in_design },
  { key: "in_production", label: PIPELINE_LABELS.in_production },
  { key: "in_finishing", label: PIPELINE_LABELS.in_finishing },
  { key: "installing", label: PIPELINE_LABELS.installing },
];

export function ProjectsView() {
  const { jobs, loading: jobsLoading } = useJobs();
  const { contacts } = useContacts();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("install");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const payerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) map.set(c.id, c.name);
    return map;
  }, [contacts]);

  function payerName(payerId: string | null | undefined, fallback: string) {
    if (payerId && payerNameById.has(payerId)) return payerNameById.get(payerId)!;
    return fallback;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = jobs;
    if (statusFilter === "active") {
      out = out.filter((j) => j.pipelineStatus !== "complete");
    } else if (statusFilter === "complete") {
      out = out.filter((j) => j.pipelineStatus === "complete");
    } else if (statusFilter !== "all") {
      out = out.filter((j) => j.pipelineStatus === statusFilter);
    }
    if (q.length > 0) {
      out = out.filter((j) => {
        const payer = payerName(j.payerId, j.client).toLowerCase();
        const source = (j.source ?? "").toLowerCase();
        return (
          j.code.toLowerCase().includes(q) ||
          j.name.toLowerCase().includes(q) ||
          payer.includes(q) ||
          source.includes(q)
        );
      });
    }
    return [...out].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "install") cmp = a.installDate.localeCompare(b.installDate);
      else if (sortKey === "revenue") cmp = a.revenue - b.revenue;
      else cmp = a.code.localeCompare(b.code);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [jobs, statusFilter, query, sortKey, sortDir, payerNameById]);

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
    } else {
      setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    }
  }

  const counts = useMemo(() => {
    let active = 0;
    let complete = 0;
    for (const j of jobs) {
      if (j.pipelineStatus === "complete") complete += 1;
      else active += 1;
    }
    return { all: jobs.length, active, complete };
  }, [jobs]);

  const totalRevenue = filtered.reduce((s, j) => s + j.revenue, 0);

  return (
    <>
      <PageHeader
        eyebrow="Sell & Plan"
        title="Projects"
        subtitle={
          jobsLoading
            ? "Loading"
            : `${counts.all} total . ${counts.active} active . ${counts.complete} complete . ${formatCAD(totalRevenue)} shown`
        }
      />

      <div className="px-8 py-6 max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setStatusFilter(c.key)}
              aria-pressed={statusFilter === c.key}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast",
                statusFilter === c.key
                  ? "bg-ink-pill text-white"
                  : "bg-white text-text-secondary hover:text-text-primary shadow-resting"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, or payer"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-md placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState query={query} statusFilter={statusFilter} />
        ) : (
          <div className="bg-white rounded-xl shadow-resting overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted">
                  <Th>
                    <SortButton
                      label="Code"
                      onClick={() => toggleSort("code")}
                      dir={sortKey === "code" ? sortDir : null}
                    />
                  </Th>
                  <Th>Project</Th>
                  <Th>Payer</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th align="right">
                    <SortButton
                      label="Revenue"
                      onClick={() => toggleSort("revenue")}
                      dir={sortKey === "revenue" ? sortDir : null}
                    />
                  </Th>
                  <Th align="right">GM%</Th>
                  <Th>
                    <SortButton
                      label="Install"
                      onClick={() => toggleSort("install")}
                      dir={sortKey === "install" ? sortDir : null}
                    />
                  </Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((j, idx) => {
                  const margin = computeMargin(j);
                  return (
                    <tr
                      key={j.id}
                      className={cn(
                        "hover:bg-surface-muted/40 transition-colors duration-fast",
                        idx > 0 && "border-t border-[rgba(26,25,22,0.05)]"
                      )}
                    >
                      <td className="px-4 py-3 text-xs text-text-tertiary font-mono tabular-nums">
                        {j.code}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                        >
                          {j.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {payerName(j.payerId, j.client)}
                      </td>
                      <td className="px-4 py-3 text-text-tertiary text-xs">
                        {j.source ?? ""}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={j.pipelineStatus} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatCAD(j.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MarginCell margin={margin} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary tabular-nums">
                        {formatDate(j.installDate)}
                      </td>
                      <td className="px-2 py-3 text-text-tertiary">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="block hover:text-text-primary transition-colors duration-fast"
                          aria-label={`Open ${j.name}`}
                        >
                          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Th({
  children,
  align,
}: {
  children?: React.ReactNode;
  align?: "right";
}) {
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

function SortButton({
  label,
  onClick,
  dir,
}: {
  label: string;
  onClick: () => void;
  dir: SortDir | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-text-secondary transition-colors duration-fast"
    >
      {label}
      {dir === "asc" && <ChevronUp className="h-3 w-3" strokeWidth={2} />}
      {dir === "desc" && <ChevronDown className="h-3 w-3" strokeWidth={2} />}
      {dir === null && <ArrowDownUp className="h-3 w-3 opacity-40" strokeWidth={2} />}
    </button>
  );
}

function EmptyState({
  query,
  statusFilter,
}: {
  query: string;
  statusFilter: StatusFilter;
}) {
  const filtered = query.length > 0 || statusFilter !== "all";
  return (
    <div className="bg-white rounded-xl shadow-resting p-12 text-center">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface-muted mb-4">
        <Inbox className="h-5 w-5 text-text-tertiary" strokeWidth={1.75} />
      </div>
      <div className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em] mb-1">
        {filtered ? "No projects match the filter" : "No projects yet"}
      </div>
      <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
        {filtered
          ? "Try clearing filters or searching by a different code, name, or payer."
          : "When you create a project from Pipeline, it shows up here."}
      </p>
    </div>
  );
}
