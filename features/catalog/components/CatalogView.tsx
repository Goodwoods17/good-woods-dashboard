"use client";

import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { cn } from "@shared/lib/utils";
import { MaterialsTable } from "./MaterialsTable";
import { FinishesTable } from "./FinishesTable";

type Tab = "materials" | "finishes";

export function CatalogView() {
  const [tab, setTab] = useState<Tab>("materials");

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Materials & finishes"
        subtitle="Pricing source of truth for the estimator and per-job pricing."
      />
      <div className="px-8 py-6 max-w-5xl">
        <nav className="flex items-center gap-0 mb-5 border-b border-border">
          {(["materials", "finishes"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-fast capitalize",
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "materials" ? <MaterialsTable /> : <FinishesTable />}
      </div>
    </>
  );
}
