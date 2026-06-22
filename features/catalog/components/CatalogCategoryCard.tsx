"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  useCatalog,
  type CatalogCategory,
  type CatalogItemView,
} from "@features/catalog/lib/catalogStore";
import type { PriceDelta } from "@features/catalog/lib/priceHistory";
import { CatalogTable, unitForKind } from "./CatalogTable";

const bySort = (a: CatalogCategory, b: CatalogCategory) => a.sortOrder - b.sortOrder;

export function CatalogCategoryCard({
  category,
  subcategories,
  items,
  deltas,
  widths,
  onResizeStart,
  expanded,
  onToggle,
}: {
  category: CatalogCategory;
  subcategories: CatalogCategory[];
  items: CatalogItemView[];
  deltas: Map<string, PriceDelta>;
  widths: Record<string, number>;
  onResizeStart: (key: string, e: React.PointerEvent) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { addItem, addCategory, renameCategory, removeCategory } = useCatalog();
  const [addingSub, setAddingSub] = useState(false);
  const [subName, setSubName] = useState("");

  const isOther = category.id === "other";

  const { ungrouped, bySubId } = useMemo(() => {
    const map = new Map<string, CatalogItemView[]>();
    const loose: CatalogItemView[] = [];
    for (const it of items) {
      if (it.subcategoryId) {
        const list = map.get(it.subcategoryId);
        if (list) list.push(it);
        else map.set(it.subcategoryId, [it]);
      } else loose.push(it);
    }
    return { ungrouped: loose, bySubId: map };
  }, [items]);

  const addItemTo = (subcategoryId: string | null) => {
    const kind = category.defaultKind;
    addItem({
      kind,
      name: "",
      section: null,
      categoryId: isOther ? null : category.id,
      subcategoryId,
      unit: unitForKind(kind),
      unitPrice: 0,
      attributes: kind === "finish" ? { coats: 2 } : {},
      defaultWastePct: 0,
      defaultMarkupPct: 35,
    });
  };

  const commitSub = () => {
    const name = subName.trim();
    if (name) void addCategory(name, category.id, category.defaultKind);
    setSubName("");
    setAddingSub(false);
  };

  const del = () => {
    if (items.length > 0) {
      const ok = window.confirm(
        `Delete "${category.name}"? Its ${items.length} item(s) move to Uncategorized — nothing is lost.`
      );
      if (!ok) return;
    }
    removeCategory(category.id);
  };

  const hasSubs = subcategories.length > 0;

  return (
    <section
      id={`category-${category.id}`}
      className="scroll-mt-28 overflow-hidden rounded-2xl bg-surface shadow-resting"
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isOther ? (
            <h3 className="font-serif text-title font-medium text-text-primary">{category.name}</h3>
          ) : (
            <input
              value={category.name}
              onChange={(e) => renameCategory(category.id, e.target.value)}
              aria-label="Category name"
              className="min-w-0 max-w-full rounded-md bg-transparent font-serif text-title font-medium text-text-primary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
              style={{ width: `${Math.max(category.name.length + 1, 6)}ch` }}
            />
          )}
          <span className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
            {items.length}
          </span>
        </div>
        {!isOther && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setAddingSub(true)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-text-tertiary transition-colors duration-fast hover:bg-surface-muted hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Sub-category
            </button>
            <button
              type="button"
              onClick={del}
              aria-label={`Delete ${category.name}`}
              className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-status-blocked-soft hover:text-status-blocked"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
      </header>

      {addingSub && (
        <div className="flex items-center gap-1.5 px-4 pb-2">
          <input
            autoFocus
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSub();
              if (e.key === "Escape") {
                setSubName("");
                setAddingSub(false);
              }
            }}
            placeholder="Sub-category name (e.g. Hinges)"
            className="w-56 rounded-md bg-surface-muted px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          <button
            type="button"
            onClick={commitSub}
            aria-label="Add sub-category"
            className="grid h-7 w-7 place-items-center rounded-md text-accent hover:bg-accent-soft/40"
          >
            <Check className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSubName("");
              setAddingSub(false);
            }}
            aria-label="Cancel"
            className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Sub-category groups */}
      {subcategories.map((sub) => (
        <SubGroup
          key={sub.id}
          sub={sub}
          items={bySubId.get(sub.id) ?? []}
          deltas={deltas}
          widths={widths}
          onResizeStart={onResizeStart}
          expanded={expanded}
          onToggle={onToggle}
          onAdd={() => addItemTo(sub.id)}
        />
      ))}

      {/* Loose items (no sub-category). Labelled only when sub-categories exist. */}
      {(ungrouped.length > 0 || !hasSubs) && (
        <div className={cn(hasSubs && "border-t border-border-faint")}>
          {hasSubs && (
            <p className="px-4 pb-0.5 pt-2 text-label uppercase text-text-tertiary">Ungrouped</p>
          )}
          {ungrouped.length === 0 ? (
            <p className="px-4 pb-1 pt-1 text-xs text-text-tertiary">Nothing here yet.</p>
          ) : (
            <CatalogTable
              items={ungrouped}
              deltas={deltas}
              widths={widths}
              onResizeStart={onResizeStart}
              expanded={expanded}
              onToggle={onToggle}
            />
          )}
          {!isOther && (
            <button
              type="button"
              onClick={() => addItemTo(null)}
              className="flex w-full items-center gap-2 border-t border-border-faint px-4 py-2.5 text-xs text-text-tertiary transition-colors duration-fast hover:bg-accent-soft/30 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add to {category.name}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function SubGroup({
  sub,
  items,
  deltas,
  widths,
  onResizeStart,
  expanded,
  onToggle,
  onAdd,
}: {
  sub: CatalogCategory;
  items: CatalogItemView[];
  deltas: Map<string, PriceDelta>;
  widths: Record<string, number>;
  onResizeStart: (key: string, e: React.PointerEvent) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAdd: () => void;
}) {
  const { renameCategory, removeCategory } = useCatalog();
  return (
    <div className="border-t border-border-faint">
      <div className="flex items-center justify-between gap-2 px-4 pb-0.5 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <input
            value={sub.name}
            onChange={(e) => renameCategory(sub.id, e.target.value)}
            aria-label="Sub-category name"
            className="min-w-0 rounded-md bg-transparent text-label uppercase tracking-wide text-text-secondary focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
            style={{ width: `${Math.max(sub.name.length + 1, 6)}ch` }}
          />
          <span className="font-mono text-micro tabular-nums text-text-tertiary">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => removeCategory(sub.id)}
          aria-label={`Delete ${sub.name}`}
          className="grid h-6 w-6 place-items-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-status-blocked-soft hover:text-status-blocked"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-1 text-xs text-text-tertiary">Nothing here yet.</p>
      ) : (
        <CatalogTable
          items={items}
          deltas={deltas}
          widths={widths}
          onResizeStart={onResizeStart}
          expanded={expanded}
          onToggle={onToggle}
        />
      )}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-text-tertiary transition-colors duration-fast hover:bg-accent-soft/30 hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add to {sub.name}
      </button>
    </div>
  );
}
