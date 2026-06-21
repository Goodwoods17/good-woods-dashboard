"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { cn } from "@shared/lib/utils";
import {
  useCatalog,
  type CatalogCategory,
  type CatalogItemView,
} from "@features/catalog/lib/catalogStore";
import { fetchDeltas, type PriceDelta } from "@features/catalog/lib/priceHistory";
import { useResizableColumns } from "@features/catalog/lib/useResizableColumns";
import { CatalogCategoryCard } from "./CatalogCategoryCard";
import { CATALOG_COLUMNS } from "./CatalogTable";

// A catch-all home for items not tied to a category, so nothing is invisible.
const OTHER_CATEGORY: CatalogCategory = {
  id: "other",
  name: "Uncategorized",
  parentId: null,
  defaultKind: "material",
  sortOrder: 9999,
};

const bySort = (a: CatalogCategory, b: CatalogCategory) => a.sortOrder - b.sortOrder;

export function CatalogView() {
  const { itemsWithOffers, categories, loading, error, addCategory } = useCatalog();
  const { widths, onResizeStart } = useResizableColumns("gw_catalog_colwidths_v1", CATALOG_COLUMNS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deltas, setDeltas] = useState<Map<string, PriceDelta>>(new Map());
  const [current, setCurrent] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState("");

  const topCategories = useMemo(
    () => categories.filter((c) => c.parentId === null).sort(bySort),
    [categories]
  );

  const subsByParent = useMemo(() => {
    const map = new Map<string, CatalogCategory[]>();
    for (const c of categories) {
      if (!c.parentId) continue;
      const list = map.get(c.parentId);
      if (list) list.push(c);
      else map.set(c.parentId, [c]);
    }
    map.forEach((list) => list.sort(bySort));
    return map;
  }, [categories]);

  // Group every item under its top-level category; the rest fall to "Uncategorized".
  const { byCat, other } = useMemo(() => {
    const knownTop = new Set(topCategories.map((c) => c.id));
    const map = new Map<string, CatalogItemView[]>();
    const loose: CatalogItemView[] = [];
    for (const v of itemsWithOffers) {
      if (v.categoryId && knownTop.has(v.categoryId)) {
        const list = map.get(v.categoryId);
        if (list) list.push(v);
        else map.set(v.categoryId, [v]);
      } else loose.push(v);
    }
    return { byCat: map, other: loose };
  }, [itemsWithOffers, topCategories]);

  const navCategories = useMemo(() => {
    const list = [...topCategories];
    if (other.length > 0) list.push(OTHER_CATEGORY);
    return list;
  }, [topCategories, other]);

  // One batched price-history read across every visible offer (no N+1).
  const offerIdsKey = useMemo(
    () =>
      itemsWithOffers
        .flatMap((v) => v.offers.map((o) => o.id))
        .sort()
        .join(","),
    [itemsWithOffers]
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

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jump = (id: string) => {
    setCurrent(id);
    document
      .getElementById(`category-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const commitCat = () => {
    const name = catName.trim();
    if (name) void addCategory(name);
    setCatName("");
    setAddingCat(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Catalog"
        subtitle="The shop's one price book — organized your way, by what things are."
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
        {/* Category jump-nav: tap a category to scroll straight to it. */}
        <nav className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border-faint bg-background/85 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
            {navCategories.map((c) => {
              const count = c.id === "other" ? other.length : (byCat.get(c.id)?.length ?? 0);
              const active = current === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => jump(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors duration-fast",
                    active
                      ? "bg-ink-pill text-white"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  )}
                >
                  {c.name}
                  <span
                    className={cn(
                      "font-mono text-micro tabular-nums",
                      active ? "text-white/70" : "text-text-tertiary"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {addingCat ? (
              <span className="ml-1 inline-flex shrink-0 items-center gap-1">
                <input
                  autoFocus
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitCat();
                    if (e.key === "Escape") {
                      setCatName("");
                      setAddingCat(false);
                    }
                  }}
                  placeholder="Category name"
                  className="w-40 rounded-full bg-surface-muted px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-soft"
                />
                <button
                  type="button"
                  onClick={commitCat}
                  aria-label="Add category"
                  className="grid h-7 w-7 place-items-center rounded-full text-accent hover:bg-accent-soft/40"
                >
                  <Check className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatName("");
                    setAddingCat(false);
                  }}
                  aria-label="Cancel"
                  className="grid h-7 w-7 place-items-center rounded-full text-text-tertiary hover:bg-surface-muted"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCat(true)}
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-text-tertiary transition-colors duration-fast hover:bg-surface-muted hover:text-accent"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Category
              </button>
            )}
          </div>
        </nav>

        {error && (
          <p className="mb-4 rounded-lg bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-4" aria-hidden>
            <div className="h-48 rounded-2xl bg-surface shadow-resting" />
            <div className="h-32 rounded-2xl bg-surface shadow-resting" />
          </div>
        ) : (
          <div className="space-y-4">
            {topCategories.map((c) => (
              <CatalogCategoryCard
                key={c.id}
                category={c}
                subcategories={subsByParent.get(c.id) ?? []}
                items={byCat.get(c.id) ?? []}
                deltas={deltas}
                widths={widths}
                onResizeStart={onResizeStart}
                expanded={expanded}
                onToggle={toggle}
              />
            ))}
            {other.length > 0 && (
              <CatalogCategoryCard
                category={OTHER_CATEGORY}
                subcategories={[]}
                items={other}
                deltas={deltas}
                widths={widths}
                onResizeStart={onResizeStart}
                expanded={expanded}
                onToggle={toggle}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
