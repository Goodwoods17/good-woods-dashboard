"use client";

import Link from "next/link";
import { Building2, User } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatCAD } from "@shared/lib/format";
import type { ContactRollup } from "../lib/aggregate";
import { RoleTagPills } from "./RoleTagPills";
import { WarmthChip } from "./WarmthChip";

function formatLastTouched(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ContactsList({ rollups }: { rollups: ContactRollup[] }) {
  return (
    <div data-testid="contacts-list" className="bg-white rounded-xl shadow-resting overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-muted">
            <Th>Name</Th>
            <Th>Roles</Th>
            <Th align="right">Lifetime revenue</Th>
            <Th align="right">Jobs</Th>
            <Th>Last touched</Th>
            <Th>Warmth</Th>
          </tr>
        </thead>
        <tbody>
          {rollups.map((r, idx) => {
            const c = r.contact;
            const Icon = c.kind === "org" ? Building2 : User;
            return (
              <tr
                key={c.id}
                className={cn(
                  "transition-colors duration-fast hover:bg-surface-muted/40",
                  idx > 0 && "border-t border-hairline"
                )}
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      aria-label={c.isAnchor ? "Anchor relationship" : undefined}
                      className={cn(
                        "inline-block h-2 w-2 rounded-full shrink-0",
                        c.isAnchor ? "bg-accent" : "bg-transparent"
                      )}
                    />
                    <Icon
                      className="h-4 w-4 text-text-tertiary shrink-0"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/crm/${c.id}`}
                        className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                      >
                        {c.name}
                      </Link>
                      {c.parentId && <ParentLine parentId={c.parentId} rollups={rollups} />}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <RoleTagPills tags={c.roleTags} />
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-text-primary">
                  {r.lifetimeRevenue > 0 ? (
                    formatCAD(r.lifetimeRevenue)
                  ) : (
                    <span className="text-text-disabled">$0</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-text-secondary">
                  {r.payerJobs.length}
                </td>
                <td className="px-4 py-3.5 text-text-secondary tabular-nums">
                  {formatLastTouched(c.lastTouchedAt)}
                </td>
                <td className="px-4 py-3.5">
                  <WarmthChip isAnchor={c.isAnchor} daysSinceTouch={r.daysSinceTouch} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ParentLine({ parentId, rollups }: { parentId: string; rollups: ContactRollup[] }) {
  const parent = rollups.find((r) => r.contact.id === parentId)?.contact;
  if (!parent) return null;
  return <div className="text-xs text-text-tertiary truncate">at {parent.name}</div>;
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
