"use client";

import { ChevronRight, Hammer, Paintbrush, Truck, FileText, type LucideIcon } from "lucide-react";
import { type SOP } from "@features/sops/lib/sops";
import { cn } from "@shared/lib/utils";

export const CATEGORY_ICON: Record<SOP["category"], LucideIcon> = {
  shop: Hammer,
  finishing: Paintbrush,
  install: Truck,
  office: FileText,
};

export const CATEGORY_LABEL: Record<SOP["category"], string> = {
  shop: "Shop",
  finishing: "Finishing",
  install: "Install",
  office: "Office",
};

/** A coloured status dot per category, so the list reads at a glance. */
const CATEGORY_DOT: Record<SOP["category"], string> = {
  shop: "bg-status-on-track",
  finishing: "bg-status-paused",
  install: "bg-status-at-risk",
  office: "bg-status-complete",
};

type Props = {
  sops: SOP[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** When true (phone), rows act as drilldown links with a chevron affordance. */
  drilldown?: boolean;
};

export function SopLibrary({ sops, selectedId, onSelect, drilldown = false }: Props) {
  return (
    <nav aria-label="Procedures" className="overflow-hidden rounded-2xl bg-surface shadow-resting">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-label font-medium uppercase text-text-tertiary">Library</span>
        <span className="font-mono text-caption tabular-nums text-text-tertiary">
          {sops.length}
        </span>
      </div>
      <ul className="divide-y divide-border-faint">
        {sops.map((sop) => {
          const active = !drilldown && sop.id === selectedId;
          return (
            <li key={sop.id}>
              <button
                type="button"
                onClick={() => onSelect(sop.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-[40px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
                  active ? "bg-accent-soft" : "hover:bg-surface-muted/40"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 self-start rounded-full",
                    CATEGORY_DOT[sop.category]
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-body",
                      active ? "font-medium text-accent" : "text-text-primary"
                    )}
                  >
                    {sop.title}
                  </span>
                  <span className="mt-0.5 block text-label uppercase text-text-tertiary">
                    {CATEGORY_LABEL[sop.category]}
                  </span>
                </span>
                {drilldown && (
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-text-tertiary"
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
