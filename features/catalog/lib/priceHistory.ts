"use client";

// Price-history log. Append-only record of every observed price for a catalog
// item — every manual edit + every estimate that uses the item. Phase 2 keys
// each row to the *offer* it came from (offer_id) so deltas are per-supplier:
// "did Reimer's walnut MDF go up?" tracks market movement on one supplier's
// price, independent of which offer the item currently surfaces.
//
// Writes go to the Supabase `catalog_price_history` table (shared across
// devices) AND a localStorage mirror (key `gw_price_history_v1`). Sync helpers
// read the mirror (offline-friendly); the async helpers read shared Supabase
// history and batch by offer to avoid N+1.

import { hasSupabase, getSupabase } from "@shared/lib/supabase";

export type PriceSource = "manual" | "estimate" | "import";

export type PriceHistoryRow = {
  id: string;
  itemId: string;
  offerId?: string; // the offer this price belongs to (null for item-level / estimate rows)
  supplier: string; // supplier-name snapshot (survives offer/supplier deletion)
  unitPrice: number;
  recordedAt: string; // ISO timestamp
  source: PriceSource;
  jobId?: string;
};

// Tolerates the legacy mirror shape (Phase 1 wrote `materialId`, no `offerId`).
type StoredRow = PriceHistoryRow & { materialId?: string };

const KEY = "gw_price_history_v1";
const MAX_ROWS = 5_000; // cap so localStorage never explodes
const HISTORY_TABLE = "catalog_price_history";

function loadAll(): PriceHistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredRow[]).map((r) => ({
      ...r,
      itemId: r.itemId ?? r.materialId ?? "",
    }));
  } catch {
    return [];
  }
}

function saveAll(rows: PriceHistoryRow[]) {
  if (typeof window === "undefined") return;
  try {
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
  rows: {
    itemId: string;
    offerId?: string;
    supplier: string;
    unitPrice: number;
    source: string;
    jobId?: string;
  }[]
): void {
  if (!hasSupabase() || rows.length === 0) return;
  try {
    const sb = getSupabase();
    void sb
      .from(HISTORY_TABLE)
      .insert(
        rows.map((r) => ({
          item_id: r.itemId,
          offer_id: r.offerId ?? null,
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

// ─── Public API — logging ───────────────────────────────────────────────

export function logPrice(input: {
  itemId: string;
  offerId?: string;
  supplier: string;
  unitPrice: number;
  source: PriceSource;
  jobId?: string;
}): void {
  const rows = loadAll();
  rows.push({
    id: newId(),
    itemId: input.itemId,
    offerId: input.offerId,
    supplier: input.supplier,
    unitPrice: input.unitPrice,
    recordedAt: new Date().toISOString(),
    source: input.source,
    jobId: input.jobId,
  });
  saveAll(rows);
  mirrorToSupabase([
    {
      itemId: input.itemId,
      offerId: input.offerId,
      supplier: input.supplier,
      unitPrice: input.unitPrice,
      source: input.source,
      jobId: input.jobId,
    },
  ]);
}

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
      itemId: l.catalogId,
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

// ─── Sync reads (localStorage mirror) ───────────────────────────────────

export function getHistoryFor(itemId: string): PriceHistoryRow[] {
  return loadAll()
    .filter((r) => r.itemId === itemId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function getLast90DaysAvg(itemId: string): number | null {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = getHistoryFor(itemId).filter((r) => new Date(r.recordedAt).getTime() >= cutoff);
  if (recent.length === 0) return null;
  return recent.reduce((acc, r) => acc + r.unitPrice, 0) / recent.length;
}

export function getLastQuotedPrice(
  itemId: string
): { price: number; jobId?: string; recordedAt: string } | null {
  const rows = getHistoryFor(itemId).filter((r) => r.source === "estimate");
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { price: last.unitPrice, jobId: last.jobId, recordedAt: last.recordedAt };
}

// ─── Per-offer price delta ──────────────────────────────────────────────

export type PriceDelta = {
  current: number;
  previous: number | null;
  direction: "up" | "down" | "flat";
  pct: number | null; // signed % change vs previous; null when no prior price
  at: string; // recordedAt of the current price
};

function deltaFromRows(rows: PriceHistoryRow[]): PriceDelta | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const current = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  if (!previous) {
    return {
      current: current.unitPrice,
      previous: null,
      direction: "flat",
      pct: null,
      at: current.recordedAt,
    };
  }
  const diff = current.unitPrice - previous.unitPrice;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const pct = previous.unitPrice !== 0 ? (diff / previous.unitPrice) * 100 : null;
  return {
    current: current.unitPrice,
    previous: previous.unitPrice,
    direction,
    pct,
    at: current.recordedAt,
  };
}

/** Sync delta for one offer, from the localStorage mirror. */
export function getPriceDelta(offerId: string): PriceDelta | null {
  const rows = loadAll().filter((r) => r.offerId === offerId);
  return deltaFromRows(rows);
}

// ─── Async reads (shared Supabase history) ──────────────────────────────

type HistoryRowDb = {
  offer_id: string | null;
  unit_price: number | string;
  recorded_at: string;
  supplier: string | null;
};

function toRow(r: HistoryRowDb): PriceHistoryRow {
  return {
    id: "",
    itemId: "",
    offerId: r.offer_id ?? undefined,
    supplier: r.supplier ?? "",
    unitPrice: Number(r.unit_price),
    recordedAt: r.recorded_at,
    source: "manual",
  };
}

/** Full price history for one offer (most-recent first), from Supabase. */
export async function fetchOfferHistory(offerId: string): Promise<PriceHistoryRow[]> {
  if (!hasSupabase()) return getHistoryFor("").filter((r) => r.offerId === offerId);
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from(HISTORY_TABLE)
      .select("offer_id, unit_price, recorded_at, supplier")
      .eq("offer_id", offerId)
      .order("recorded_at", { ascending: false });
    if (error) throw error;
    return (data as HistoryRowDb[] | null)?.map(toRow) ?? [];
  } catch {
    return [];
  }
}

/**
 * Batched deltas for many offers in ONE query (offer_id=in.(…)), so loading the
 * Materials table doesn't fire an N+1 of per-offer history reads. Returns a map
 * keyed by offerId; offers with no history are absent.
 */
export async function fetchDeltas(offerIds: string[]): Promise<Map<string, PriceDelta>> {
  const out = new Map<string, PriceDelta>();
  const ids = offerIds.filter(Boolean);
  if (ids.length === 0) return out;
  if (!hasSupabase()) {
    for (const id of ids) {
      const d = getPriceDelta(id);
      if (d) out.set(id, d);
    }
    return out;
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from(HISTORY_TABLE)
      .select("offer_id, unit_price, recorded_at, supplier")
      .in("offer_id", ids)
      .order("recorded_at", { ascending: true });
    if (error) throw error;
    const byOffer = new Map<string, PriceHistoryRow[]>();
    for (const raw of (data as HistoryRowDb[] | null) ?? []) {
      const row = toRow(raw);
      if (!row.offerId) continue;
      const list = byOffer.get(row.offerId) ?? [];
      list.push(row);
      byOffer.set(row.offerId, list);
    }
    byOffer.forEach((rows, offerId) => {
      const d = deltaFromRows(rows);
      if (d) out.set(offerId, d);
    });
    return out;
  } catch {
    return out;
  }
}

// ─── Staleness chip (pure; unchanged) ───────────────────────────────────

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
