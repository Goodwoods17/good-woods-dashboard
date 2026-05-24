"use client";

// Price-history log. Append-only record of every observed price for a
// catalog material — every manual edit + every estimate that uses the
// material. Powers the stale-chip, "vs 90-day avg" indicator, and the
// "last bid was $X on Job #N" tooltip.
//
// Backed by localStorage today (key `gw_price_history_v1`). Designed to
// swap to Supabase trivially when the project's unpaused: the storage
// driver below is the only thing that needs to change.

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
    const trimmed =
      rows.length > MAX_ROWS ? rows.slice(rows.length - MAX_ROWS) : rows;
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* silent */
  }
}

function newId(): string {
  return `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
}

export function getHistoryFor(materialId: string): PriceHistoryRow[] {
  return loadAll()
    .filter((r) => r.materialId === materialId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function getLast90DaysAvg(materialId: string): number | null {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = getHistoryFor(materialId).filter(
    (r) => new Date(r.recordedAt).getTime() >= cutoff,
  );
  if (recent.length === 0) return null;
  const sum = recent.reduce((acc, r) => acc + r.unitPrice, 0);
  return sum / recent.length;
}

export function getLastQuotedPrice(
  materialId: string,
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
  jobId: string,
): void {
  const rows = loadAll();
  const now = new Date().toISOString();
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
  }
  saveAll(rows);
}
