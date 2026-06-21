"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Truck } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useCatalog } from "@features/catalog/lib/catalogStore";

export function SuppliersList({ query }: { query: string }) {
  const { suppliers, itemsWithOffers } = useCatalog();

  // Count active offers per supplier across the whole catalog.
  const offerCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of itemsWithOffers) {
      for (const o of item.offers) {
        if (o.active) counts.set(o.supplierId, (counts.get(o.supplierId) ?? 0) + 1);
      }
    }
    return counts;
  }, [itemsWithOffers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers
      .filter((s) => s.active !== false)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, query]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-resting p-10 text-center">
        <Truck className="h-7 w-7 text-text-tertiary mx-auto mb-4" strokeWidth={1.5} />
        <h2 className="font-serif text-title font-medium text-text-primary">
          {query.trim() ? "No suppliers match" : "No suppliers yet"}
        </h2>
        <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
          {query.trim()
            ? "Try a different name."
            : "Suppliers are added as you build the catalog. Add an offer to a material to create one."}
        </p>
        {!query.trim() && (
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1.5 mt-6 rounded-full bg-surface shadow-floating hover:shadow-hover px-4 py-2 text-sm font-medium text-text-secondary transition-shadow duration-fast"
          >
            Open the catalog
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
            <Th>Contact</Th>
            <Th>Website</Th>
            <Th align="right">Items priced</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, idx) => (
            <tr
              key={s.id}
              className={cn(
                "transition-colors duration-fast hover:bg-surface-muted/40",
                idx > 0 && "border-t border-[rgba(26,25,22,0.05)]"
              )}
            >
              <td className="px-4 py-3.5">
                <Link
                  href={`/suppliers/${s.id}`}
                  className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                >
                  {s.name || "Untitled"}
                </Link>
              </td>
              <td className="px-4 py-3.5 text-text-secondary">
                {s.contactName || <span className="text-text-disabled">—</span>}
              </td>
              <td className="px-4 py-3.5 text-text-secondary truncate max-w-[16rem]">
                {s.website || <span className="text-text-disabled">—</span>}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums text-text-secondary">
                {offerCount.get(s.id) ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
