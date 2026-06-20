"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { useSubtrades } from "../lib/subtradesStore";
import { useTrades } from "../lib/tradesStore";
import { SuppliersList } from "./SuppliersList";
import { SubtradesList } from "./SubtradesList";

type Tab = "suppliers" | "subtrades";

export function PartnersView() {
  const { suppliers, loading: catalogLoading } = useCatalog();
  const { subtrades, loading: subtradesLoading } = useSubtrades();
  const { loading: tradesLoading } = useTrades();

  const [tab, setTab] = useState<Tab>("suppliers");
  const [query, setQuery] = useState("");

  const loading = catalogLoading || subtradesLoading || tradesLoading;
  const supplierCount = useMemo(
    () => suppliers.filter((s) => s.active !== false).length,
    [suppliers]
  );
  const subtradeCount = useMemo(() => subtrades.filter((s) => s.active).length, [subtrades]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "suppliers", label: "Suppliers", count: supplierCount },
    { id: "subtrades", label: "Subtrades", count: subtradeCount },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Partners"
        subtitle={`${supplierCount} supplier${supplierCount === 1 ? "" : "s"} . ${subtradeCount} subtrade${subtradeCount === 1 ? "" : "s"}`}
        actions={
          tab === "subtrades" ? (
            <Link
              href="/subtrades/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add subtrade
            </Link>
          ) : undefined
        }
      />

      <div className="px-8 py-6 max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-1 rounded-full bg-surface-muted p-1">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 min-h-[36px] text-xs font-medium transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
                    active
                      ? "bg-ink-pill text-white"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "font-mono text-micro tabular-nums",
                      active ? "text-white/70" : "text-text-tertiary"
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              strokeWidth={1.75}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${tab}`}
              className="w-full min-h-[40px] rounded-md border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-resting h-48 animate-pulse" />
        ) : tab === "suppliers" ? (
          <SuppliersList query={query} />
        ) : (
          <SubtradesList query={query} />
        )}
      </div>
    </>
  );
}
