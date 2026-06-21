"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useSubtrades } from "../lib/subtradesStore";
import { useTrades } from "../lib/tradesStore";
import { TradePill } from "./TradePill";

export function SubtradesList({ query }: { query: string }) {
  const { subtrades } = useSubtrades();
  const { trades } = useTrades();

  const tradeById = useMemo(
    () => new Map(trades.map((t) => [t.id, t])),
    [trades]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subtrades
      .filter((s) => s.active)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subtrades, query]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-resting p-10 text-center">
        <Wrench className="h-7 w-7 text-text-tertiary mx-auto mb-4" strokeWidth={1.5} />
        <h2 className="font-serif text-title font-medium text-text-primary">
          {query.trim() ? "No subtrades match" : "No subtrades yet"}
        </h2>
        <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
          {query.trim()
            ? "Try a different name."
            : "Add the install crews, finishers, and other trades you hire, then assign them to a project from its Trades card."}
        </p>
        {!query.trim() && (
          <Link
            href="/subtrades/new"
            className="inline-flex items-center gap-1.5 mt-6 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add subtrade
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-resting overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-muted">
            <Th>Name</Th>
            <Th>Trade</Th>
            <Th>Contact</Th>
            <Th>Phone</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, idx) => {
            const trade = s.tradeId ? tradeById.get(s.tradeId) : undefined;
            return (
              <tr
                key={s.id}
                className={cn(
                  "transition-colors duration-fast hover:bg-surface-muted/40",
                  idx > 0 && "border-t border-[rgba(26,25,22,0.05)]"
                )}
              >
                <td className="px-4 py-3.5">
                  <Link
                    href={`/subtrades/${s.id}`}
                    className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                  >
                    {s.name || "Untitled"}
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  {trade ? (
                    <TradePill trade={trade} size="sm" />
                  ) : (
                    <span className="text-text-disabled text-xs">No trade</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-text-secondary">
                  {s.contactName || <span className="text-text-disabled">—</span>}
                </td>
                <td className="px-4 py-3.5 text-text-secondary tabular-nums">
                  {s.phone || <span className="text-text-disabled">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-label uppercase text-text-tertiary font-medium text-left">
      {children}
    </th>
  );
}
