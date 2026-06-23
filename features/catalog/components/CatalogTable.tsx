"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FolderInput, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import {
  useCatalog,
  type CatalogItemView,
  type CatalogKind,
} from "@features/catalog/lib/catalogStore";
import { PROCURED_KINDS } from "@features/catalog/lib/catalogRowMap";
import type { PriceDelta } from "@features/catalog/lib/priceHistory";
import type { ColumnDef } from "@features/catalog/lib/useResizableColumns";
import { UNITS, UNIT_LABELS, type Unit } from "@features/estimator/lib/types";
import {
  AutoText,
  BestBadge,
  DeltaChip,
  LinkCell,
  NumCell,
  PreferredBadge,
  StaleChip,
} from "./cells";
import { OffersEditor } from "./OffersSubRow";
import { AttributesEditor } from "./AttributesEditor";

const PROCURED = new Set<string>(PROCURED_KINDS);
const isProcured = (kind: CatalogKind) => PROCURED.has(kind);

// The shared column model — one width set drives every table on the page, so a
// width set once follows everywhere. No "Kind" column: the category header says
// what these are. Kept here so the page can build the resize hook from one source.
export const CATALOG_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: 230, min: 130 },
  { key: "detail", label: "Suppliers", width: 220, min: 130 },
  { key: "unit", label: "Unit", width: 76, min: 60, align: "center" },
  { key: "price", label: "Price", width: 120, min: 92, align: "right" },
  { key: "waste", label: "Waste %", width: 80, min: 60, align: "right" },
  { key: "markup", label: "Markup %", width: 90, min: 60, align: "right" },
  { key: "link", label: "Link", width: 100, min: 64 },
  { key: "notes", label: "Notes", width: 170, min: 96 },
  { key: "actions", label: "", width: 72, min: 64, align: "center" },
];

const CATALOG_TABLE_WIDTH = CATALOG_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// A sensible default unit for a new item of a given kind (editable inline).
export function unitForKind(kind: CatalogKind): Unit {
  switch (kind) {
    case "door":
    case "finish":
      return "sqft";
    case "labour":
      return "hr";
    default:
      return "ea";
  }
}

type RowPatch = Partial<
  Pick<CatalogItemView, "name" | "unit" | "defaultWastePct" | "defaultMarkupPct" | "notes" | "link">
> & { attributes?: Record<string, unknown> };

const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

/**
 * Kebab → fixed-position menu to move an item into another category / sub-category.
 * Rendered in a portal so the table's horizontal-scroll clip can't hide it.
 */
function MoveMenu({ item }: { item: CatalogItemView }) {
  const { categories, setItemCategory } = useCatalog();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 224) });
    setOpen((o) => !o);
  };

  const tops = categories.filter((c) => c.parentId === null).sort(bySort);
  const move = (categoryId: string | null, subcategoryId: string | null) => {
    setItemCategory(item.id, categoryId, subcategoryId);
    setOpen(false);
  };
  const isHere = (catId: string | null, subId: string | null) =>
    (item.categoryId ?? null) === catId && (item.subcategoryId ?? null) === subId;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Move to category"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-surface-muted hover:text-text-primary group-hover:opacity-100"
      >
        <FolderInput className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 max-h-80 w-56 overflow-y-auto rounded-xl bg-surface p-1 shadow-modal ring-1 ring-border-faint"
          >
            <p className="px-2 py-1 text-micro uppercase tracking-wide text-text-tertiary">
              Move to
            </p>
            {tops.map((cat) => {
              const subs = categories.filter((c) => c.parentId === cat.id).sort(bySort);
              return (
                <div key={cat.id} className="mb-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => move(cat.id, null)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-fast hover:bg-surface-muted",
                      isHere(cat.id, null) ? "font-medium text-accent" : "text-text-primary"
                    )}
                  >
                    {cat.name}
                  </button>
                  {subs.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      onClick={() => move(cat.id, s.id)}
                      className={cn(
                        "flex w-full items-center gap-1 rounded-md py-1.5 pl-5 pr-2 text-left text-sm transition-colors duration-fast hover:bg-surface-muted",
                        isHere(cat.id, s.id) ? "font-medium text-accent" : "text-text-secondary"
                      )}
                    >
                      <span className="text-text-tertiary">↳</span>
                      {s.name}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

export function CatalogTable({
  items,
  deltas,
  widths,
  onResizeStart,
  expanded,
  onToggle,
}: {
  items: CatalogItemView[];
  deltas: Map<string, PriceDelta>;
  widths: Record<string, number>;
  onResizeStart: (key: string, e: React.PointerEvent) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { updateItem, removeItem, updateOffer } = useCatalog();
  const isMobile = useIsMobile();

  const setSurfacedPrice = (v: CatalogItemView, price: number) => {
    if (v.surfacedOffer) updateOffer(v.surfacedOffer.id, { unitPrice: price });
    else updateItem(v.id, { unitPrice: price });
  };

  if (items.length === 0) return null;

  if (isMobile) {
    return (
      <div className="space-y-2 px-3 pb-1">
        {items.map((v) => (
          <CatalogItemCard
            key={v.id}
            view={v}
            deltas={deltas}
            expanded={expanded.has(v.id)}
            onToggle={() => onToggle(v.id)}
            onChange={(p) => updateItem(v.id, p)}
            onPrice={(price) => setSurfacedPrice(v, price)}
            onRemove={() => removeItem(v.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm" style={{ width: CATALOG_TABLE_WIDTH, tableLayout: "fixed" }}>
        <colgroup>
          {CATALOG_COLUMNS.map((c) => (
            <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="text-left align-bottom text-label uppercase text-text-tertiary">
            {CATALOG_COLUMNS.map((c, i) => (
              <th
                key={c.key}
                className={cn(
                  "relative px-3 py-1.5 font-medium",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center"
                )}
              >
                {c.label}
                {i < CATALOG_COLUMNS.length - 1 && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${c.label || "column"}`}
                    onPointerDown={(e) => onResizeStart(c.key, e)}
                    className="group absolute -right-1 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-stretch justify-center"
                  >
                    <span className="my-1 w-px bg-border-faint transition-colors duration-fast group-hover:bg-accent" />
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((v) => (
            <CatalogRow
              key={v.id}
              view={v}
              deltas={deltas}
              expanded={expanded.has(v.id)}
              onToggle={() => onToggle(v.id)}
              onChange={(p) => updateItem(v.id, p)}
              onPrice={(price) => setSurfacedPrice(v, price)}
              onRemove={() => removeItem(v.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cheapest-first "all suppliers at once" strip; only procured kinds carry offers. */
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
              <span className="max-w-[7rem] truncate">{nameOf(o.supplierId)}</span>
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

/** In-house "source" cell: coats stepper for finishes, a flat label otherwise. */
function InHouseDetail({
  view,
  expanded,
  onToggle,
  onChange,
}: {
  view: CatalogItemView;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: RowPatch) => void;
}) {
  if (view.kind === "finish") {
    const coats = Number(view.attributes?.coats ?? 2);
    return (
      <div className="flex items-center gap-1.5 px-1 text-xs text-text-tertiary">
        <span>In-house</span>
        <span aria-hidden>·</span>
        <input
          type="number"
          min={1}
          step={1}
          value={coats}
          onChange={(e) =>
            onChange({ attributes: { ...view.attributes, coats: parseInt(e.target.value) || 1 } })
          }
          aria-label="Coats"
          className="w-9 rounded-md bg-transparent px-1 py-0.5 text-right tabular-nums text-text-secondary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        <span>coats</span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label="Attributes"
          className="ml-0.5 inline-flex items-center gap-0.5 text-micro text-text-tertiary transition-colors duration-fast hover:text-accent"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-fast",
              expanded && "rotate-180"
            )}
            strokeWidth={2}
          />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1 text-xs text-text-tertiary">
      <span>{view.kind === "labour" ? "In-house · labour" : "In-house"}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label="Attributes"
        className="inline-flex items-center gap-0.5 text-micro text-text-tertiary transition-colors duration-fast hover:text-accent"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-fast",
            expanded && "rotate-180"
          )}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

function CatalogRow({
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
  onChange: (patch: RowPatch) => void;
  onPrice: (price: number) => void;
  onRemove: () => void;
}) {
  const procured = isProcured(view.kind);
  const multi = view.offers.length > 1;
  return (
    <>
      <tr className="group border-t border-border-faint align-top even:bg-surface-muted/20 hover:bg-surface-muted/40">
        <td className="px-3 py-1.5">
          <AutoText
            value={view.name}
            onChange={(v) => onChange({ name: v })}
            placeholder="Item name"
          />
        </td>
        <td className="px-3 py-1.5">
          {procured ? (
            <SuppliersStrip view={view} deltas={deltas} expanded={expanded} onToggle={onToggle} />
          ) : (
            <InHouseDetail view={view} expanded={expanded} onToggle={onToggle} onChange={onChange} />
          )}
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
            {procured && (view.preferredOffer ? <PreferredBadge /> : multi ? <BestBadge /> : null)}
            <StaleChip iso={view.priceUpdatedAt} />
          </div>
        </td>
        <td className="px-3 py-1.5 text-right">
          {procured ? (
            <NumCell
              value={view.defaultWastePct ?? 0}
              step="1"
              onChange={(v) => onChange({ defaultWastePct: v })}
            />
          ) : (
            <span className="block pr-2 text-right text-text-tertiary">—</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right">
          {procured ? (
            <NumCell
              value={view.defaultMarkupPct ?? 35}
              step="1"
              onChange={(v) => onChange({ defaultMarkupPct: v })}
            />
          ) : (
            <span className="block pr-2 text-right text-text-tertiary">—</span>
          )}
        </td>
        <td className="px-2 py-1.5">
          <LinkCell value={view.link ?? ""} onChange={(v) => onChange({ link: v })} />
        </td>
        <td className="px-3 py-1.5">
          <AutoText
            value={view.notes ?? ""}
            onChange={(v) => onChange({ notes: v })}
            placeholder="Optional"
            className="text-text-secondary"
          />
        </td>
        <td className="px-2 py-1.5 align-middle">
          <div className="flex items-center justify-center gap-0.5">
            <MoveMenu item={view} />
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${view.name || "item"}`}
              className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-status-blocked-soft hover:text-status-blocked group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-muted/10">
          <td colSpan={CATALOG_COLUMNS.length} className="px-3 pb-2.5 pt-0.5">
            <div className="space-y-2">
              {procured && <OffersEditor view={view} deltas={deltas} />}
              <AttributesEditor
                attributes={view.attributes}
                kind={view.kind}
                onChange={(next) => onChange({ attributes: next })}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CatalogItemCard({
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
  onChange: (patch: RowPatch) => void;
  onPrice: (price: number) => void;
  onRemove: () => void;
}) {
  const procured = isProcured(view.kind);
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
        <MoveMenu item={view} />
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
        {procured ? (
          <SuppliersStrip view={view} deltas={deltas} expanded={expanded} onToggle={onToggle} />
        ) : (
          <InHouseDetail view={view} expanded={expanded} onToggle={onToggle} onChange={onChange} />
        )}
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
        <Labeled label="Price">
          <NumCell
            value={view.surfacedPrice}
            onChange={onPrice}
            fmt={(v) => formatCAD(v)}
            className="text-left"
          />
        </Labeled>
        {procured && (
          <>
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
          </>
        )}
      </div>

      <div className="mt-2">
        <Labeled label="Link">
          <LinkCell value={view.link ?? ""} onChange={(v) => onChange({ link: v })} />
        </Labeled>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {procured &&
          (view.preferredOffer ? (
            <PreferredBadge />
          ) : view.offers.length > 1 ? (
            <BestBadge />
          ) : null)}
        <StaleChip iso={view.priceUpdatedAt} />
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {procured && <OffersEditor view={view} deltas={deltas} />}
          <AttributesEditor
            attributes={view.attributes}
            kind={view.kind}
            onChange={(next) => onChange({ attributes: next })}
          />
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
