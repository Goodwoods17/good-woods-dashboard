"use client";

import type { ReactNode } from "react";
import { QUOTE_SECTIONS } from "@features/estimator/lib/sections";
import type { SectionId } from "@features/estimator/lib/sections";
import type { LineItem, Room } from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { SectionBlock } from "./SectionBlock";
import { LINE_GRID_TEMPLATE } from "./LineItemRow";

export function LineItemsTable({
  lines,
  lineSubtotals,
  categorySuggestions,
  activeSectionIds,
  rooms,
  structuredContent,
  structuredSubtotals,
  onAdd,
  onUpdate,
  onRemove,
}: {
  lines: LineItem[];
  lineSubtotals: LineSubtotal[];
  categorySuggestions: string[];
  activeSectionIds: SectionId[];
  rooms: Room[];
  // For sections with bespoke layouts (prework/delivery/deficiencies), the
  // orchestrator passes pre-rendered content here. The Section header is
  // still rendered uniformly by this table.
  structuredContent: Partial<Record<SectionId, ReactNode>>;
  // For each structured section, the orchestrator passes the subtotal so
  // the header displays it consistently.
  structuredSubtotals: Partial<Record<SectionId, { cost: number; price: number }>>;
  onAdd: (sectionLabel: string) => void;
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
}) {
  // Pair each line with its subtotal — they share the same order from
  // computeTotals so a positional zip is safe.
  const indexed = lines.map((l, i) => ({ line: l, sub: lineSubtotals[i] }));

  // Lines whose category doesn't match a known section show in a fallback
  // "Other" group at the bottom (custom categories typed by the user).
  const knownLabels = new Set(QUOTE_SECTIONS.map((s) => s.label));
  const otherGroups: Record<string, typeof indexed> = {};
  for (const entry of indexed) {
    const cat = entry.line.category || "Other";
    if (!knownLabels.has(cat)) {
      if (!otherGroups[cat]) otherGroups[cat] = [];
      otherGroups[cat].push(entry);
    }
  }

  const activeSet = new Set(activeSectionIds);

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-muted flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Line items</h2>
        <span className="text-xs text-text-tertiary">
          {activeSectionIds.length} of {QUOTE_SECTIONS.length} sections active
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[68rem]">
          {/* Column header — shown once at the top, only for "lines" sections */}
          <div
            className="grid items-end gap-2 px-3 py-2 bg-surface-muted/40 text-[10px] uppercase tracking-wider text-text-tertiary font-semibold"
            style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}
          >
            <span>Category</span>
            <span>Item / description</span>
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

          {QUOTE_SECTIONS.filter((s) => activeSet.has(s.id)).map((section) => {
            const sectionLines = indexed.filter(
              (e) => e.line.category === section.label,
            );
            const subtotalCost = sectionLines.reduce(
              (a, e) => a + e.sub.cost,
              0,
            );
            const subtotalPrice = sectionLines.reduce(
              (a, e) => a + (e.sub.excludedFromQuote ? 0 : e.sub.price),
              0,
            );
            const structured = structuredContent[section.id];
            const isStructured = section.layout && section.layout !== "lines";
            // Structured sections often own their own subtotals; if the
            // orchestrator supplied them, prefer those over line-based math.
            const headerSubtotal = isStructured
              ? structuredSubtotals[section.id] ?? {
                  cost: subtotalCost,
                  price: subtotalPrice,
                }
              : { cost: subtotalCost, price: subtotalPrice };

            return (
              <SectionBlock
                key={section.id}
                section={section}
                lines={sectionLines.map((e) => e.line)}
                lineSubtotals={sectionLines.map((e) => e.sub)}
                subtotalCost={headerSubtotal.cost}
                subtotalPrice={headerSubtotal.price}
                rooms={rooms}
                categorySuggestions={categorySuggestions}
                categoryListId="estimator-categories"
                onAdd={
                  isStructured ? undefined : () => onAdd(section.label)
                }
                onUpdate={isStructured ? undefined : onUpdate}
                onRemove={isStructured ? undefined : onRemove}
              >
                {structured}
              </SectionBlock>
            );
          })}

          {/* Fallback "Other" sections for unrecognized categories */}
          {Object.entries(otherGroups).map(([label, entries]) => {
            const subtotalCost = entries.reduce((a, e) => a + e.sub.cost, 0);
            const subtotalPrice = entries.reduce(
              (a, e) => a + (e.sub.excludedFromQuote ? 0 : e.sub.price),
              0,
            );
            return (
              <SectionBlock
                key={`other-${label}`}
                section={{
                  id: "casework", // bucket fallback for other sections
                  label,
                  bucket: "materials",
                  description:
                    "Custom category — moves into a known section if renamed",
                  layout: "lines",
                }}
                lines={entries.map((e) => e.line)}
                lineSubtotals={entries.map((e) => e.sub)}
                subtotalCost={subtotalCost}
                subtotalPrice={subtotalPrice}
                rooms={rooms}
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
