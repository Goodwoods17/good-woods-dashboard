"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { useCatalog, type CatalogItemView } from "@features/catalog/lib/catalogStore";
import { PROCURED_KINDS } from "@features/catalog/lib/catalogRowMap";
import { fetchDeltas, type PriceDelta } from "@features/catalog/lib/priceHistory";
import { QUOTE_SECTIONS, type SectionId } from "@features/estimator/lib/sections";
import { UNITS, UNIT_LABELS, type Unit } from "@features/estimator/lib/types";
import { AutoText, BestBadge, DeltaChip, NumCell, PreferredBadge, StaleChip } from "./cells";
import { OffersEditor } from "./OffersSubRow";

const LINE_SECTIONS = QUOTE_SECTIONS.filter((s) => s.layout === "lines");
const PROCURED = new Set<string>(PROCURED_KINDS);

export function MaterialsTable() {
  const { itemsWithOffers, addItem, updateItem, removeItem, updateOffer } = useCatalog();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deltas, setDeltas] = useState<Map<string, PriceDelta>>(new Map());

  // The procured, section-bound items the Materials tab shows.
  const rowsAll = useMemo(
    () => itemsWithOffers.filter((v) => PROCURED.has(v.kind) && v.section),
    [itemsWithOffers]
  );

  // One batched price-history read for every visible offer (no N+1).
  const offerIdsKey = useMemo(
    () =>
      rowsAll
        .flatMap((v) => v.offers.map((o) => o.id))
        .sort()
        .join(","),
    [rowsAll]
  );
  useEffect(() => {
    const ids = offerIdsKey ? offerIdsKey.split(",") : [];
    if (ids.length === 0) {
      setDeltas(new Map());
      return;
    }
    let cancelled = false;
    void fetchDeltas(ids).then((m) => {
      if (!cancelled) setDeltas(m);
    });
    return () => {
      cancelled = true;
    };
  }, [offerIdsKey]);

  const grouped = useMemo(() => {
    const out: Partial<Record<SectionId, CatalogItemView[]>> = {};
    for (const v of rowsAll) (out[v.section as SectionId] ??= []).push(v);
    return out;
  }, [rowsAll]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The inline price cell edits the surfaced offer (single-supplier items stay
  // one-click); with no offers it edits the item's own inline price.
  const setSurfacedPrice = (v: CatalogItemView, price: number) => {
    if (v.surfacedOffer) updateOffer(v.surfacedOffer.id, { unitPrice: price });
    else updateItem(v.id, { unitPrice: price });
  };

  return (
    <div className="space-y-4">
      {LINE_SECTIONS.map((section) => {
        const rows = grouped[section.id] ?? [];
        return (
          <section
            key={section.id}
            className="overflow-hidden rounded-2xl bg-surface shadow-resting"
          >
            <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
              <div className="min-w-0">
                <h3 className="font-serif text-title font-medium text-text-primary">
                  {section.label}
                </h3>
                {section.description && (
                  <p className="mt-0.5 text-xs text-text-tertiary">{section.description}</p>
                )}
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
                {rows.length}
              </span>
            </header>

            {rows.length > 0 &&
              (isMobile ? (
                <div className="space-y-2 px-3 pb-2">
                  {rows.map((v) => (
                    <MaterialCard
                      key={v.id}
                      view={v}
                      deltas={deltas}
                      expanded={expanded.has(v.id)}
                      onToggle={() => toggle(v.id)}
                      onChange={(p) => updateItem(v.id, p)}
                      onPrice={(price) => setSurfacedPrice(v, price)}
                      onRemove={() => removeItem(v.id)}
                    />
                  ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left align-bottom text-label uppercase text-text-tertiary">
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Suppliers</th>
                      <th className="px-3 py-1.5 text-center font-medium">Unit</th>
                      <th className="px-3 py-1.5 text-right font-medium">Price</th>
                      <th className="px-3 py-1.5 text-right font-medium">Waste%</th>
                      <th className="px-3 py-1.5 text-right font-medium">Markup%</th>
                      <th className="px-3 py-1.5 font-medium">Notes</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => (
                      <MaterialRow
                        key={v.id}
                        view={v}
                        deltas={deltas}
                        expanded={expanded.has(v.id)}
                        onToggle={() => toggle(v.id)}
                        onChange={(p) => updateItem(v.id, p)}
                        onPrice={(price) => setSurfacedPrice(v, price)}
                        onRemove={() => removeItem(v.id)}
                      />
                    ))}
                  </tbody>
                </table>
              ))}

            <button
              type="button"
              onClick={() =>
                addItem({
                  kind: "material",
                  name: "",
                  section: section.id,
                  unit: section.id === "casework" ? "ea" : "sqft",
                  unitPrice: 0,
                  attributes: {},
                  defaultWastePct: 0,
                  defaultMarkupPct: 35,
                })
              }
              className="flex w-full items-center gap-2 border-t border-border-faint px-4 py-2.5 text-xs text-text-tertiary transition-colors duration-fast hover:bg-accent-soft/30 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add to {section.label}
            </button>
          </section>
        );
      })}
    </div>
  );
}

/** Compact, cheapest-first "all suppliers at once" strip for the collapsed row. */
function SuppliersStrip({
  view,
  deltas,
  expanded,
  onToggle,
}: {
  view: CatalogItemView;
  deltas: Map<string, PriceDelta>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { suppliers } = useCatalog();
  const nameOf = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const count = view.offers.length;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="group/strip flex w-full flex-wrap items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors duration-fast hover:bg-surface-muted/50"
    >
      {count === 0 ? (
        <span className="text-xs text-text-tertiary group-hover/strip:text-accent">
          + Add suppliers
        </span>
      ) : (
        view.offers.slice(0, 3).map((o) => {
          const isSurfaced = view.surfacedOffer?.id === o.id;
          return (
            <span
              key={o.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums",
                isSurfaced ? "bg-ink-pill/10 font-medium text-text-primary" : "text-text-secondary"
              )}
            >
              <span className="truncate max-w-[7rem]">{nameOf(o.supplierId)}</span>
              <span className="font-mono">{formatCAD(o.unitPrice)}</span>
              {o.isPreferred && <span className="text-accent">★</span>}
              {view.bestOffer?.id === o.id && !o.isPreferred && (
                <span className="text-status-on-track">←</span>
              )}
              <DeltaChip delta={deltas.get(o.id)} />
            </span>
          );
        })
      )}
      {count > 3 && <span className="text-xs text-text-tertiary">+{count - 3} more</span>}
      {count > 0 && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 text-micro text-text-tertiary">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-fast",
              expanded && "rotate-180"
            )}
            strokeWidth={2}
          />
        </span>
      )}
    </button>
  );
}

function MaterialRow({
  view,
  deltas,
  expanded,
  onToggle,
  onChange,
  onPrice,
  onRemove,
}: {
  view: CatalogItemView;
  deltas: Map<string, PriceDelta>;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: {
    name?: string;
    unit?: Unit;
    defaultWastePct?: number;
    defaultMarkupPct?: number;
    notes?: string;
  }) => void;
  onPrice: (price: number) => void;
  onRemove: () => void;
}) {
  const multi = view.offers.length > 1;
  return (
    <>
      <tr className="group border-t border-border-faint align-top even:bg-surface-muted/20 hover:bg-surface-muted/40">
        <td className="max-w-[16rem] px-3 py-1.5">
          <AutoText
            value={view.name}
            onChange={(v) => onChange({ name: v })}
            placeholder="Item name"
          />
        </td>
        <td className="max-w-[20rem] px-3 py-1.5">
          <SuppliersStrip view={view} deltas={deltas} expanded={expanded} onToggle={onToggle} />
        </td>
        <td className="px-3 py-1.5 text-center">
          <select
            value={view.unit}
            onChange={(e) => onChange({ unit: e.target.value as Unit })}
            className="rounded-md bg-transparent px-1 py-1 text-sm focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5 text-right">
          <NumCell value={view.surfacedPrice} onChange={onPrice} fmt={(v) => formatCAD(v)} />
          <div className="flex items-center justify-end gap-1 pr-2">
            {view.preferredOffer ? <PreferredBadge /> : multi ? <BestBadge /> : null}
            <StaleChip iso={view.priceUpdatedAt} />
          </div>
        </td>
        <td className="px-3 py-1.5 text-right">
          <NumCell
            value={view.defaultWastePct ?? 0}
            step="1"
            onChange={(v) => onChange({ defaultWastePct: v })}
          />
        </td>
        <td className="px-3 py-1.5 text-right">
          <NumCell
            value={view.defaultMarkupPct ?? 35}
            step="1"
            onChange={(v) => onChange({ defaultMarkupPct: v })}
          />
        </td>
        <td className="max-w-[14rem] px-3 py-1.5">
          <AutoText
            value={view.notes ?? ""}
            onChange={(v) => onChange({ notes: v })}
            placeholder="Optional"
            className="text-text-secondary"
          />
        </td>
        <td className="px-2 py-1.5 align-middle">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${view.name || "item"}`}
            className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-status-blocked-soft hover:text-status-blocked group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-muted/10">
          <td colSpan={8} className="px-3 pb-2.5 pt-0.5">
            <OffersEditor view={view} deltas={deltas} />
          </td>
        </tr>
      )}
    </>
  );
}

function MaterialCard({
  view,
  deltas,
  expanded,
  onToggle,
  onChange,
  onPrice,
  onRemove,
}: {
  view: CatalogItemView;
  deltas: Map<string, PriceDelta>;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: {
    name?: string;
    unit?: Unit;
    defaultWastePct?: number;
    defaultMarkupPct?: number;
    notes?: string;
  }) => void;
  onPrice: (price: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-muted/40 p-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <AutoText
            value={view.name}
            onChange={(v) => onChange({ name: v })}
            placeholder="Item name"
            className="font-medium"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove item"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-1.5">
        <SuppliersStrip view={view} deltas={deltas} expanded={expanded} onToggle={onToggle} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Labeled label="Unit">
          <select
            value={view.unit}
            onChange={(e) => onChange({ unit: e.target.value as Unit })}
            className="w-full bg-transparent text-sm focus:outline-none"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Price (surfaced)">
          <NumCell
            value={view.surfacedPrice}
            onChange={onPrice}
            fmt={(v) => formatCAD(v)}
            className="text-left"
          />
        </Labeled>
        <Labeled label="Waste %">
          <NumCell
            value={view.defaultWastePct ?? 0}
            step="1"
            onChange={(v) => onChange({ defaultWastePct: v })}
            className="text-left"
          />
        </Labeled>
        <Labeled label="Markup %">
          <NumCell
            value={view.defaultMarkupPct ?? 35}
            step="1"
            onChange={(v) => onChange({ defaultMarkupPct: v })}
            className="text-left"
          />
        </Labeled>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {view.preferredOffer ? <PreferredBadge /> : view.offers.length > 1 ? <BestBadge /> : null}
        <StaleChip iso={view.priceUpdatedAt} />
      </div>

      {expanded && (
        <div className="mt-2">
          <OffersEditor view={view} deltas={deltas} />
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rounded-lg bg-surface px-2.5 py-1.5">
      <span className="block text-micro uppercase tracking-wider text-text-tertiary">{label}</span>
      {children}
    </label>
  );
}
