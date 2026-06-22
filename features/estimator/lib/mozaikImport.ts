// Mozaik CSV import (ADR 0012 Slice 2). Parses the co-designed "Good Woods Job
// Costing" export shape (docs/samples/mozaik-import-target-csv.md) into a
// structured draft: per-room cabinets (both count + linear ft), finishing /
// cut metrics, and a BOM of everything else. Reads QUANTITIES + STRUCTURE only
// — Mozaik's Amount/Total columns are discarded; the app re-prices (ADR 0012).
//
// Robust to the messy default export too: room boundaries are detected
// structurally (a label row with no qty/units), not by an exact header string.

import type { CabinetSummary, CabinetTypeId } from "./types";
import { emptyCabinetSummary } from "./types";

// ─── Parsed shape ───────────────────────────────────────────────────────────

export type MozaikBomLine = { name: string; qty: number; unit: string };

// Singular keyed metrics per room. All optional — absent = not in the export.
export type MozaikMetrics = {
  finishedAreaSqft?: number;
  toeSkinFt?: number;
  finishedEndsBase?: number;
  finishedEndsWall?: number;
  finishedEndsTall?: number;
  openings?: number;
  baseDoors?: number;
  wallDoors?: number;
  drawerFronts?: number;
  drawerBoxes?: number;
  shelves?: number;
  appliances?: number;
  pulls?: number;
  hinges?: number;
  guides?: number;
  rolloutShelves?: number;
  trayBoxes?: number;
  closetRods?: number;
  countertopSqft?: number;
  countertopLf?: number;
  counterJoints?: number;
  counterRadius?: number;
  counterCutouts?: number;
  moldingFt?: number;
  weightLb?: number;
  storageCft?: number;
  sheets?: number;
  parts?: number;
};

export type MozaikRoom = {
  name: string;
  cabinets: Record<CabinetTypeId, { count: number; linearFt: number }>;
  metrics: MozaikMetrics;
  bom: MozaikBomLine[]; // materials / hardware / buyout / inserts — match to catalog
};

export type MozaikImport = {
  rooms: MozaikRoom[];
  warnings: string[];
};

// ─── CSV line parser ─────────────────────────────────────────────────────────
// RFC4180-ish: a field that *starts* with `"` is quoted (commas allowed inside,
// `""` → `"`). A bare `"` mid-field (e.g. the inch mark in `3/4"`) is literal.

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i <= n) {
    if (i === n) {
      out.push("");
      break;
    }
    let field = "";
    if (line[i] === '"') {
      // quoted field
      i++;
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += line[i++];
        }
      }
      // consume up to the next comma
      while (i < n && line[i] !== ",") i++;
    } else {
      while (i < n && line[i] !== ",") field += line[i++];
    }
    out.push(field);
    if (i < n && line[i] === ",") {
      i++;
      if (i === n) {
        out.push(""); // trailing comma → empty final field
        break;
      }
    } else {
      break;
    }
  }
  return out;
}

// ─── Key dictionary ──────────────────────────────────────────────────────────

function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

const CABINET_KEYS: Record<string, CabinetTypeId> = {
  "base cabinets": "base",
  "wall cabinets": "wall",
  "tall cabinets": "tall",
  "island cabinets": "island",
};

// Normalized label → metric field. Cabinet rows handled separately (count vs ft).
const METRIC_KEYS: Record<string, keyof MozaikMetrics> = {
  "finished area": "finishedAreaSqft",
  "toe skin": "toeSkinFt",
  "# base finished ends": "finishedEndsBase",
  "# wall finished ends": "finishedEndsWall",
  "# tall finished ends": "finishedEndsTall",
  "# openings": "openings",
  "# base doors": "baseDoors",
  "# wall doors": "wallDoors",
  "# drawer fronts": "drawerFronts",
  "# drawer boxes": "drawerBoxes",
  "# shelves": "shelves",
  "# appliances": "appliances",
  "# pulls": "pulls",
  "# hinges": "hinges",
  "# guides": "guides",
  "# rollout shelves": "rolloutShelves",
  "# tray boxes": "trayBoxes",
  "# closet rods": "closetRods",
  "# counter joints": "counterJoints",
  "# counter radius": "counterRadius",
  "counter cutouts": "counterCutouts",
  molding: "moldingFt",
  weight: "weightLb",
  storage: "storageCft",
  "# sheets": "sheets",
  "# parts": "parts",
};

function parseNum(raw: string): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function emptyRoom(name: string): MozaikRoom {
  return {
    name,
    cabinets: {
      base: { count: 0, linearFt: 0 },
      wall: { count: 0, linearFt: 0 },
      tall: { count: 0, linearFt: 0 },
      island: { count: 0, linearFt: 0 },
    },
    metrics: {},
    bom: [],
  };
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export function parseMozaikCsv(text: string): MozaikImport {
  const lines = text.split(/\r?\n/);
  const rooms: MozaikRoom[] = [];
  const warnings: string[] = [];
  let current: MozaikRoom | null = null;
  let sawHeader = false;

  for (const rawLine of lines) {
    if (rawLine.trim() === "") continue;
    const cols = parseCsvLine(rawLine);
    const label = (cols[0] ?? "").trim();
    if (label === "") continue;

    const qtyRaw = (cols[1] ?? "").trim();
    const unitRaw = (cols[2] ?? "").trim();

    // Header row: "Description,QTY,Units,...". Skip once.
    if (!sawHeader && /^description$/i.test(label) && /^qty$/i.test(qtyRaw)) {
      sawHeader = true;
      continue;
    }

    // Room boundary: a label with NO qty AND NO units (the room name carrying
    // its grand total in a later column). Starts a new room group.
    if (qtyRaw === "" && unitRaw === "") {
      if (current) finalizeRoom(current, warnings);
      current = emptyRoom(label);
      rooms.push(current);
      continue;
    }

    // Detail row — needs a room. (A stray detail before any room → bucket it
    // into a synthetic "Job" room rather than dropping it.)
    if (!current) {
      current = emptyRoom("Job");
      rooms.push(current);
    }

    const qty = parseNum(qtyRaw);
    if (qty == null) continue; // a non-numeric detail row (e.g. a sub-header) — ignore

    const key = normalize(label);
    const unit = unitRaw;

    // Cabinet rows: same label emits a count (#) and a linear-ft (Ft) row.
    const cabType = CABINET_KEYS[key];
    if (cabType) {
      if (/^ft$/i.test(unit)) current.cabinets[cabType].linearFt = qty;
      else current.cabinets[cabType].count = qty;
      continue;
    }

    // Countertops: split by unit (SqFt vs Ft).
    if (key === "counter tops") {
      if (/^ft$/i.test(unit)) current.metrics.countertopLf = qty;
      else current.metrics.countertopSqft = qty;
      continue;
    }

    const metricKey = METRIC_KEYS[key];
    if (metricKey) {
      current.metrics[metricKey] = qty;
      continue;
    }

    // Anything else with a quantity is BOM (material / hardware / buyout /
    // insert) → matched to the catalog on the review screen.
    current.bom.push({ name: label, qty, unit });
  }

  if (current) finalizeRoom(current, warnings);
  return { rooms, warnings };
}

function finalizeRoom(room: MozaikRoom, warnings: string[]) {
  const hasCabinets = (Object.keys(room.cabinets) as CabinetTypeId[]).some(
    (t) => room.cabinets[t].count > 0 || room.cabinets[t].linearFt > 0,
  );
  const hasDetail =
    hasCabinets || Object.keys(room.metrics).length > 0 || room.bom.length > 0;
  if (!hasDetail) {
    warnings.push(
      `Room "${room.name}" exported no detail lines (collapsed?) — re-export with all rooms expanded.`,
    );
  }
}

// ─── Mapping → estimator draft ────────────────────────────────────────────────
// Rolls the parsed rooms into the estimator's job-level CabinetSummary + the
// cost-code quantity overrides (FIN-SPRAY = total finished sqft, CUT-SHEET =
// total sheets) + a flat BOM list for catalog matching. Per-room cabinet
// granularity beyond one-room-per-type isn't representable in CabinetSummary
// today, so the summary is the job total and rooms[] carry the breakdown for
// the review screen + Room tags. (Per-room budget lines are a follow-on.)

export type MozaikDraft = {
  cabinetSummary: CabinetSummary;
  qtyByCode: Record<string, number>; // FIN-SPRAY, CUT-SHEET
  bom: MozaikBomLine[]; // merged across rooms
  roomNames: string[];
  warnings: string[];
  totals: {
    cabinets: Record<CabinetTypeId, { count: number; linearFt: number }>;
    finishedAreaSqft: number;
    sheets: number;
  };
};

export function mozaikToEstimateDraft(imported: MozaikImport): MozaikDraft {
  const summary = emptyCabinetSummary();
  let finishedAreaSqft = 0;
  let sheets = 0;
  let pulls = 0;
  const bom: MozaikBomLine[] = [];

  for (const room of imported.rooms) {
    for (const t of ["base", "wall", "tall", "island"] as CabinetTypeId[]) {
      summary[t].count += room.cabinets[t].count;
      summary[t].linearFt += room.cabinets[t].linearFt;
    }
    finishedAreaSqft += room.metrics.finishedAreaSqft ?? 0;
    sheets += room.metrics.sheets ?? 0;
    pulls += room.metrics.pulls ?? 0;
    bom.push(...room.bom);
  }
  summary.pulls = pulls;

  const totalsCabinets = {
    base: { ...summary.base },
    wall: { ...summary.wall },
    tall: { ...summary.tall },
    island: { ...summary.island },
  };

  return {
    cabinetSummary: summary,
    qtyByCode: {
      "FIN-SPRAY": round2(finishedAreaSqft),
      "CUT-SHEET": sheets,
    },
    bom: mergeBom(bom),
    roomNames: imported.rooms.map((r) => r.name),
    warnings: imported.warnings,
    totals: {
      cabinets: totalsCabinets,
      finishedAreaSqft: round2(finishedAreaSqft),
      sheets,
    },
  };
}

// Merge identical BOM lines (same name + unit) across rooms by summing qty.
function mergeBom(lines: MozaikBomLine[]): MozaikBomLine[] {
  const map = new Map<string, MozaikBomLine>();
  for (const l of lines) {
    const k = `${l.name.toLowerCase()}__${l.unit.toLowerCase()}`;
    const existing = map.get(k);
    if (existing) existing.qty = round2(existing.qty + l.qty);
    else map.set(k, { ...l });
  }
  return Array.from(map.values());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
