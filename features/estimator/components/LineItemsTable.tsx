"use client";

import { QUOTE_SECTIONS, type SectionToggles } from "@features/estimator/lib/sections";
import type { LineItem } from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { SectionBlock } from "./SectionBlock";
import { LINE_GRID_TEMPLATE } from "./LineItemRow";

export function LineItemsTable({
  lines,
  lineSubtotals,
  categorySuggestions,
  sectionToggles,
  onToggleSection,
  onAdd,
  onUpdate,
  onRemove,
}: {
  lines: LineItem[];
  lineSubtotals: LineSubtotal[];
  categorySuggestions: string[];
  sectionToggles: SectionToggles;
  onToggleSection: (id: keyof SectionToggles, next: boolean) => void;
  onAdd: (sectionLabel: string) => void;
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
}) {
  // Pair each line with its subtotal — they share the same order from
  // computeTotals so a positional zip is safe.
  const indexed = lines.map((l, i) => ({ line: l, sub: lineSubtotals[i] }));

  // Group lines by section label. Lines whose category doesn't match a
  // known section get grouped under that literal string and rendered as
  // a fallback "Other" section at the bottom.
  const knownLabels = new Set(QUOTE_SECTIONS.map((s) => s.label));
  const otherGroups: Record<string, typeof indexed> = {};
  for (const entry of indexed) {
    const cat = entry.line.category || "Other";
    if (!knownLabels.has(cat)) {
      if (!otherGroups[cat]) otherGroups[cat] = [];
      otherGroups[cat].push(entry);
    }
  }

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Card title */}
      <div className="px-5 py-3 border-b border-border bg-surface-muted flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Line items</h2>
        <span className="text-xs text-text-tertiary">
          {lines.length} item{lines.length === 1 ? "" : "s"} across{" "}
          {QUOTE_SECTIONS.length} sections
        </span>
      </div>

      {/* Horizontal scroll wrapper so the grid never breaks on narrow screens */}
      <div className="overflow-x-auto">
        <div className="min-w-[68rem]">
          {/* Column header — shown once at the top */}
          <div
            className="grid items-end gap-2 px-3 py-2 bg-surface-muted/40 text-[10px] uppercase tracking-wider text-text-tertiary font-semibold"
            style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}
          >
            <span>Category</span>
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-center">Unit</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Waste %</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Markup %</span>
            <span className="text-right">Markup $</span>
            <span className="text-right">Line $</span>
            <span />
          </div>

          {/* One SectionBlock per known section */}
          {QUOTE_SECTIONS.map((section) => {
            const sectionLines = indexed.filter(
              (e) => e.line.category === section.label
            );
            const subtotalCost = sectionLines.reduce(
              (acc, e) => acc + e.sub.cost,
              0
            );
            const subtotalPrice = sectionLines.reduce(
              (acc, e) => acc + e.sub.price,
              0
            );
            const enabled = section.toggleable
              ? Boolean(sectionToggles[section.id])
              : true;
            return (
              <SectionBlock
                key={section.id}
                section={section}
                lines={sectionLines.map((e) => e.line)}
                lineSubtotals={sectionLines.map((e) => e.sub)}
                subtotalCost={subtotalCost}
                subtotalPrice={subtotalPrice}
                enabled={enabled}
                onToggle={
                  section.toggleable
                    ? (next) => onToggleSection(section.id, next)
                    : undefined
                }
                categorySuggestions={categorySuggestions}
                categoryListId="estimator-categories"
                onAdd={() => onAdd(section.label)}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            );
          })}

          {/* Fallback "Other" section(s) for unrecognized categories */}
          {Object.entries(otherGroups).map(([label, entries]) => {
            const subtotalCost = entries.reduce((a, e) => a + e.sub.cost, 0);
            const subtotalPrice = entries.reduce((a, e) => a + e.sub.price, 0);
            return (
              <SectionBlock
                key={`other-${label}`}
                section={{
                  id: "materials", // bucket fallback for other sections
                  label,
                  bucket: "materials",
                  description: "Custom category — moves into a known section if renamed",
                }}
                lines={entries.map((e) => e.line)}
                lineSubtotals={entries.map((e) => e.sub)}
                subtotalCost={subtotalCost}
                subtotalPrice={subtotalPrice}
                enabled={true}
                categorySuggestions={categorySuggestions}
                categoryListId="estimator-categories"
                onAdd={() => onAdd(label)}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
