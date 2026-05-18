"use client";

import { Users } from "lucide-react";
import { formatCAD, formatDate, formatPct } from "@shared/lib/format";
import type { ClientRow } from "@features/crm/lib/aggregate";

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  return (
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
              c.totalRevenue > 0 ? (c.totalMargin / c.totalRevenue) * 100 : 0;
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
                    <span className="text-accent font-medium">{c.activeCount}</span>
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
