"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Star, Trash2, X } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useCatalog, type CatalogItemView } from "@features/catalog/lib/catalogStore";
import type { PriceDelta } from "@features/catalog/lib/priceHistory";
import { AutoText, BestBadge, DeltaChip, NumCell, StaleChip } from "./cells";

/**
 * Expanded editor for one item's supplier offers — the all-at-once comparison
 * Andrew works from: every supplier's price on screen together, cheapest-first,
 * pin a preferred, see the per-supplier market delta, no screen-flipping.
 */
export function OffersEditor({
  view,
  deltas,
}: {
  view: CatalogItemView;
  deltas: Map<string, PriceDelta>;
}) {
  const { suppliers, addSupplier, addOffer, updateOffer, removeOffer, setPreferredOffer } =
    useCatalog();

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const firstSupplierId = suppliers[0]?.id ?? "";

  return (
    <div className="space-y-1.5 rounded-xl bg-surface-muted/40 p-2.5">
      {view.offers.length === 0 && (
        <p className="px-1 py-1 text-xs text-text-tertiary">
          No suppliers yet — this item prices from its base {formatCAD(view.unitPrice)}. Add a
          supplier offer to compare prices.
        </p>
      )}

      {view.offers.map((offer) => {
        const isBest = view.bestOffer?.id === offer.id;
        const isPreferred = offer.isPreferred;
        return (
          <div
            key={offer.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5",
              isPreferred ? "bg-accent-soft/40" : "bg-surface"
            )}
          >
            {/* Supplier */}
            <div className="min-w-[10rem] flex-1">
              <SupplierPicker
                value={offer.supplierId}
                suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                onChange={(id) => updateOffer(offer.id, { supplierId: id })}
                onCreate={async (name) => {
                  const id = await addSupplier(name);
                  if (id) updateOffer(offer.id, { supplierId: id });
                }}
              />
            </div>

            {/* Price + movement */}
            <div className="flex items-center gap-1.5">
              <div className="w-24">
                <NumCell
                  value={offer.unitPrice}
                  onChange={(v) => updateOffer(offer.id, { unitPrice: v })}
                  fmt={(v) => formatCAD(v)}
                />
              </div>
              <DeltaChip delta={deltas.get(offer.id)} />
              <StaleChip iso={offer.priceUpdatedAt} />
            </div>

            {/* Badges */}
            <div className="flex items-center gap-1">{isBest && <BestBadge />}</div>

            {/* Buy URL + SKU */}
            <div className="min-w-[8rem] flex-1">
              <AutoText
                value={offer.productUrl ?? ""}
                onChange={(v) => updateOffer(offer.id, { productUrl: v })}
                placeholder="Buy URL"
                className="text-text-secondary"
              />
            </div>
            <div className="w-24">
              <AutoText
                value={offer.sku ?? ""}
                onChange={(v) => updateOffer(offer.id, { sku: v })}
                placeholder="SKU"
                className="text-text-secondary"
              />
            </div>

            {/* Pin preferred */}
            <button
              type="button"
              onClick={() => setPreferredOffer(view.id, isPreferred ? null : offer.id)}
              aria-pressed={isPreferred}
              aria-label={isPreferred ? "Unpin preferred" : "Pin as preferred"}
              title={isPreferred ? "Preferred — click to unpin" : "Pin as preferred supplier"}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md transition-colors duration-fast",
                isPreferred
                  ? "text-accent"
                  : "text-text-tertiary hover:bg-accent-soft/40 hover:text-accent"
              )}
            >
              <Star
                className="h-3.5 w-3.5"
                strokeWidth={2}
                fill={isPreferred ? "currentColor" : "none"}
              />
            </button>

            {/* Remove offer */}
            <button
              type="button"
              onClick={() => removeOffer(offer.id)}
              aria-label={`Remove ${supplierName.get(offer.supplierId) ?? "supplier"} offer`}
              className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-status-blocked-soft hover:text-status-blocked"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={async () => {
          const id = firstSupplierId || (await addSupplier("New supplier"));
          if (id) addOffer(view.id, id, view.surfacedPrice || view.unitPrice);
        }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-tertiary transition-colors duration-fast hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add supplier offer
      </button>
    </div>
  );
}

/**
 * Supplier <select> with an inline "+ new" affordance so a supplier can be
 * created without leaving the row (find-or-create on the store side).
 */
function SupplierPicker({
  value,
  suppliers,
  onChange,
  onCreate,
}: {
  value: string;
  suppliers: { id: string; name: string }[];
  onChange: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  if (adding) {
    const commit = () => {
      const name = draft.trim();
      if (name) onCreate(name);
      setDraft("");
      setAdding(false);
    };
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          placeholder="New supplier name"
          className="w-full rounded-md bg-surface px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        <button
          type="button"
          onClick={commit}
          aria-label="Save supplier"
          className="grid h-7 w-7 place-items-center rounded-md text-status-on-track hover:bg-status-on-track-soft"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setAdding(false);
          }}
          aria-label="Cancel"
          className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__add__") setAdding(true);
          else onChange(e.target.value);
        }}
        className="w-full rounded-md bg-transparent px-1 py-1 text-sm text-text-primary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
      >
        {suppliers.length === 0 && <option value="">No suppliers</option>}
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || "Unnamed supplier"}
          </option>
        ))}
        <option value="__add__">+ Add supplier…</option>
      </select>
    </div>
  );
}
