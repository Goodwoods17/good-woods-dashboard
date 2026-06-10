"use client";

// Price-history log. Append-only record of every observed price for a
// catalog item — every manual edit + every estimate that uses the item.
// Powers the stale-chip, "vs 90-day avg" indicator, and the "last bid was
// $X on Job #N" tooltip.
//
// Writes go to the Supabase `catalog_price_history` table (shared across
// devices) AND a localStorage mirror (key `gw_price_history_v1`). The sync
// read helpers below read the localStorage mirror; surfacing the shared
// Supabase history in the UI is a Phase-2 item (it needs an async read
// path). `materialId` here is the catalog item id.

import { hasSupabase, getSupabase } from "@shared/lib/supabase";

export type PriceHistoryRow = {
  id: string;
  materialId: string;
  supplier: string;
  unitPrice: number;
  recordedAt: string; // ISO timestamp
  source: "manual" | "estimate" | "import";
  jobId?: string;
};

const KEY = "gw_price_history_v1";
const MAX_ROWS = 5_000; // cap so localStorage never explodes

function loadAll(): PriceHistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PriceHistoryRow[];
  } catch {
    return [];
  }
}

function saveAll(rows: PriceHistoryRow[]) {
  if (typeof window === "undefined") return;
  try {
    // Trim oldest if we're over the cap.
    const trimmed = rows.length > MAX_ROWS ? rows.slice(rows.length - MAX_ROWS) : rows;
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* silent */
  }
}

function newId(): string {
  return `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Fire-and-forget mirror to the shared Supabase log. Failures (e.g. a line
// whose catalog item no longer exists → FK violation) are swallowed; the
// localStorage mirror is the durable record either way.
function mirrorToSupabase(
  rows: { itemId: string; supplier: string; unitPrice: number; source: string; jobId?: string }[]
): void {
  if (!hasSupabase() || rows.length === 0) return;
  try {
    const sb = getSupabase();
    void sb
      .from("catalog_price_history")
      .insert(
        rows.map((r) => ({
          item_id: r.itemId,
          supplier: r.supplier,
          unit_price: r.unitPrice,
          source: r.source,
          job_id: r.jobId ?? null,
        }))
      )
      .then(() => {});
  } catch {
    /* silent */
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

export function logPrice(input: {
  materialId: string;
  supplier: string;
  unitPrice: number;
  source: PriceHistoryRow["source"];
  jobId?: string;
}): void {
  const rows = loadAll();
  rows.push({
    id: newId(),
    materialId: input.materialId,
    supplier: input.supplier,
    unitPrice: input.unitPrice,
    recordedAt: new Date().toISOString(),
    source: input.source,
    jobId: input.jobId,
  });
  saveAll(rows);
  mirrorToSupabase([
    {
      itemId: input.materialId,
      supplier: input.supplier,
      unitPrice: input.unitPrice,
      source: input.source,
      jobId: input.jobId,
    },
  ]);
}

export function getHistoryFor(materialId: string): PriceHistoryRow[] {
  return loadAll()
    .filter((r) => r.materialId === materialId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function getLast90DaysAvg(materialId: string): number | null {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = getHistoryFor(materialId).filter(
    (r) => new Date(r.recordedAt).getTime() >= cutoff
  );
  if (recent.length === 0) return null;
  const sum = recent.reduce((acc, r) => acc + r.unitPrice, 0);
  return sum / recent.length;
}

export function getLastQuotedPrice(
  materialId: string
): { price: number; jobId?: string; recordedAt: string } | null {
  const rows = getHistoryFor(materialId).filter((r) => r.source === "estimate");
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return {
    price: last.unitPrice,
    jobId: last.jobId,
    recordedAt: last.recordedAt,
  };
}

export type StaleChip = {
  ageDays: number;
  level: "fresh" | "ageing" | "stale";
  label: string; // "Updated 3d" / "Updated 32d" / "Updated 4mo"
};

export function getStaleness(priceUpdatedAt: string): StaleChip {
  const ms = Date.now() - new Date(priceUpdatedAt).getTime();
  const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  let level: StaleChip["level"];
  if (days < 14) level = "fresh";
  else if (days < 60) level = "ageing";
  else level = "stale";

  let label: string;
  if (days < 1) label = "Updated today";
  else if (days < 30) label = `Updated ${days}d`;
  else if (days < 365) label = `Updated ${Math.floor(days / 30)}mo`;
  else label = `Updated ${Math.floor(days / 365)}y`;

  return { ageDays: days, level, label };
}

// ─── Bulk operations ────────────────────────────────────────────────────

export function logPricesFromEstimate(
  lines: { catalogId?: string; supplier?: string; unitPrice: number }[],
  jobId: string
): void {
  const rows = loadAll();
  const now = new Date().toISOString();
  const mirror: Parameters<typeof mirrorToSupabase>[0] = [];
  for (const l of lines) {
    if (!l.catalogId) continue;
    rows.push({
      id: newId(),
      materialId: l.catalogId,
      supplier: l.supplier ?? "(unknown)",
      unitPrice: l.unitPrice,
      recordedAt: now,
      source: "estimate",
      jobId,
    });
    mirror.push({
      itemId: l.catalogId,
      supplier: l.supplier ?? "(unknown)",
      unitPrice: l.unitPrice,
      source: "estimate",
      jobId,
    });
  }
  saveAll(rows);
  mirrorToSupabase(mirror);
}
