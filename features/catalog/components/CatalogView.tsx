"use client";

import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { cn } from "@shared/lib/utils";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { MaterialsTable } from "./MaterialsTable";
import { FinishesTable } from "./FinishesTable";

type Tab = "materials" | "finishes";

export function CatalogView() {
  const { materials, finishes, loading, error } = useCatalog();
  const [tab, setTab] = useState<Tab>("materials");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "materials", label: "Materials", count: materials.length },
    { key: "finishes", label: "Finishes", count: finishes.length },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Materials & finishes"
        subtitle="The price book the estimator and per-job pricing read from."
      />
      <div className="max-w-5xl px-4 py-6 md:px-8">
        <div className="mb-5 inline-flex gap-1 rounded-full bg-surface-muted/70 p-1 shadow-floating">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-fast",
                tab === t.key
                  ? "bg-ink-pill text-white"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  tab === t.key ? "text-white/70" : "text-text-tertiary"
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-4" aria-hidden>
            <div className="h-48 rounded-2xl bg-surface shadow-resting" />
            <div className="h-32 rounded-2xl bg-surface shadow-resting" />
          </div>
        ) : tab === "materials" ? (
          <MaterialsTable />
        ) : (
          <FinishesTable />
        )}
      </div>
    </>
  );
}
