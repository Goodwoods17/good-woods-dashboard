"use client";

import { useState } from "react";
import { BookOpen, Hammer, Paintbrush, Truck, FileText } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { SOPS, type SOP } from "@features/sops/lib/sops";
import { cn } from "@shared/lib/utils";

const CATEGORY_ICON: Record<SOP["category"], typeof BookOpen> = {
  shop: Hammer,
  finishing: Paintbrush,
  install: Truck,
  office: FileText,
};

const CATEGORY_LABEL: Record<SOP["category"], string> = {
  shop: "Shop",
  finishing: "Finishing",
  install: "Install",
  office: "Office",
};

export default function SOPsPage() {
  const [selectedId, setSelectedId] = useState<string>(SOPS[0].id);
  const selected = SOPS.find((s) => s.id === selectedId) ?? SOPS[0];

  return (
    <>
      <PageHeader
        eyebrow="Standard Operating Procedures"
        title="SOPs"
        subtitle="Repeatable steps for the work the shop does most often."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 max-w-6xl">
        <aside className="bg-surface border border-border rounded-lg overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-border bg-surface-muted flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-text-primary">Library</span>
            <span className="ml-auto text-xs text-text-tertiary">{SOPS.length}</span>
          </div>
          <ul className="py-1">
            {SOPS.map((sop) => {
              const Icon = CATEGORY_ICON[sop.category];
              const active = sop.id === selectedId;
              return (
                <li key={sop.id}>
                  <button
                    onClick={() => setSelectedId(sop.id)}
                    className={cn(
                      "w-full text-left px-4 py-2 flex items-start gap-2 transition-colors duration-fast",
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 mt-0.5 shrink-0",
                        active ? "text-accent" : "text-text-tertiary"
                      )}
                      strokeWidth={1.75}
                    />
                    <div className="min-w-0">
                      <div className={cn("text-sm font-medium")}>{sop.title}</div>
                      <div className="text-[11px] text-text-tertiary uppercase tracking-wider mt-0.5">
                        {CATEGORY_LABEL[sop.category]}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <article className="bg-surface border border-border rounded-lg p-6 lg:p-8 max-w-3xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
              {CATEGORY_LABEL[selected.category]}
            </span>
            <span className="text-text-disabled">·</span>
            <span className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
              {selected.estTime}
            </span>
          </div>
          <h2 className="text-2xl font-semibold text-text-primary tracking-tight mb-2">
            {selected.title}
          </h2>
          <p className="text-text-secondary leading-relaxed mb-6">
            {selected.summary}
          </p>

          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
            Steps
          </h3>
          <ol className="space-y-2 mb-8">
            {selected.steps.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-sm text-text-primary leading-relaxed"
              >
                <span className="h-5 w-5 rounded-full bg-accent-soft text-accent grid place-items-center text-[11px] font-semibold tabular-nums shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
            Common pitfalls
          </h3>
          <ul className="space-y-2">
            {selected.pitfalls.map((p, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-sm text-text-secondary leading-relaxed"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-at-risk shrink-0 mt-2" />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-6 border-t border-border text-xs text-text-tertiary">
            Versioning, attachments, and per-job assignment land in M5.
          </div>
        </article>
      </div>
    </>
  );
}
