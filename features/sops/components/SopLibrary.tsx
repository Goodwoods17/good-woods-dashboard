"use client";

import { BookOpen, Hammer, Paintbrush, Truck, FileText } from "lucide-react";
import { type SOP } from "@features/sops/lib/sops";
import { cn } from "@shared/lib/utils";

export const CATEGORY_ICON: Record<SOP["category"], typeof BookOpen> = {
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

export function SopLibrary({
  sops,
  selectedId,
  onSelect,
}: {
  sops: SOP[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="bg-surface border border-border rounded-lg overflow-hidden self-start">
      <div className="px-4 py-3 border-b border-border bg-surface-muted flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        <span className="text-sm font-semibold text-text-primary">Library</span>
        <span className="ml-auto text-xs text-text-tertiary">{sops.length}</span>
      </div>
      <ul className="py-1">
        {sops.map((sop) => {
          const Icon = CATEGORY_ICON[sop.category];
          const active = sop.id === selectedId;
          return (
            <li key={sop.id}>
              <button
                onClick={() => onSelect(sop.id)}
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
                  <div className="text-sm font-medium">{sop.title}</div>
                  <div className="text-label text-text-tertiary uppercase mt-0.5">
                    {CATEGORY_LABEL[sop.category]}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
