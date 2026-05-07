"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Users, Briefcase, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { computeMargin, type Job } from "@shared/lib/types";
import { formatCAD, formatDate, formatPct } from "@shared/lib/format";

type ClientRow = {
  name: string;
  jobs: Job[];
  totalRevenue: number;
  totalMargin: number;
  latestInstall: string | null;
  activeCount: number;
};

export default function CrmPage() {
  const { jobs, loading } = useJobs();

  const clients: ClientRow[] = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      const list = map.get(j.client) ?? [];
      list.push(j);
      map.set(j.client, list);
    }
    return Array.from(map.entries())
      .map(([name, list]) => {
        const totalRevenue = list.reduce((s, j) => s + j.revenue, 0);
        const totalMargin = list.reduce(
          (s, j) => s + computeMargin(j).marginAmount,
          0
        );
        const installs = list
          .map((j) => j.installDate)
          .sort()
          .reverse();
        return {
          name,
          jobs: list,
          totalRevenue,
          totalMargin,
          latestInstall: installs[0] ?? null,
          activeCount: list.filter((j) => j.pipelineStatus !== "complete").length,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [jobs]);

  const totalRevenue = clients.reduce((s, c) => s + c.totalRevenue, 0);

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        subtitle={`${clients.length} unique client${clients.length === 1 ? "" : "s"} · ${formatCAD(totalRevenue)} total billed`}
      />
      <div className="px-8 py-6 max-w-6xl">
        {loading ? (
          <div className="bg-surface border border-border rounded-lg h-48 animate-pulse" />
        ) : clients.length === 0 ? (
          <Empty />
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted">
                  <Th>Client</Th>
                  <Th align="right">Jobs</Th>
                  <Th align="right">Active</Th>
                  <Th align="right">Lifetime revenue</Th>
                  <Th align="right">Lifetime margin</Th>
                  <Th align="right">Avg GM%</Th>
                  <Th>Latest install</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const avgPct =
                    c.totalRevenue > 0
                      ? (c.totalMargin / c.totalRevenue) * 100
                      : 0;
                  return (
                    <tr
                      key={c.name}
                      className="border-b border-border last:border-0 hover:bg-surface-muted/40 transition-colors duration-fast"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">
                            <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">
                              {c.name}
                            </div>
                            <div className="text-xs text-text-tertiary">
                              {c.jobs[0]?.address ?? ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                        {c.jobs.length}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                        {c.activeCount > 0 ? (
                          <span className="text-accent font-medium">
                            {c.activeCount}
                          </span>
                        ) : (
                          c.activeCount
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatCAD(c.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatCAD(c.totalMargin)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatPct(avgPct)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary tabular-nums">
                        {c.latestInstall ? formatDate(c.latestInstall) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-text-tertiary mt-4 px-1">
          Derived from job records. Standalone client / contact CRUD lands when
          the first business-development hire arrives.
        </p>
      </div>
    </>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary`}
    >
      {children}
    </th>
  );
}

function Empty() {
  return (
    <div className="bg-surface border border-border border-dashed rounded-lg p-10 text-center">
      <Briefcase
        className="h-6 w-6 text-text-tertiary mx-auto mb-3"
        strokeWidth={1.5}
      />
      <p className="text-sm text-text-secondary">
        No clients yet. Once you create jobs, they&apos;ll group here by client.
      </p>
      <Link
        href="/jobs/new"
        className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-accent hover:text-accent-hover"
      >
        Create your first job
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
