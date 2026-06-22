// Canonical cost-code catalog (ADR 0012 — the unified Job template references
// these codes). A cost code is a labour operation nested under one of the 6
// phases (labour_categories). Codes are the thread: template → estimate budget
// → shop-floor card → timer → actuals.
//
// This file is the *source* of the canonical set. The same codes are seeded
// into `labour_operations` (migration 20260622130000_seed_cost_codes.sql) so
// `job_cost_budgets.code_id` FKs resolve. Keep the two in lockstep — `code` is
// the stable key that links them (the seed upserts by `code`).

import type { CabinetTypeId, LabourRates } from "@features/estimator/lib/types";
import type { DriverUnit } from "./types";

// Phase ids match `labour_categories.id` (design · cnc · assembly · finishing
// · delivery · install). Per ADR 0012 the "cnc" phase reads as "Cut" for this
// shop (table-saw, no in-house CNC); the id stays `cnc` for stability.
export type PhaseId =
  | "design"
  | "cnc"
  | "assembly"
  | "finishing"
  | "delivery"
  | "install";

export type CostCodeDef = {
  code: string; // stable key, e.g. "ASM-BASE"
  name: string; // human label
  phaseId: PhaseId;
  cabinetType?: CabinetTypeId; // when set, qty comes from the cabinet summary count
  driver: DriverUnit | null; // null = a flat, time-only code (minutes are the total)
  defaultMinutes: number; // per-unit minutes (driven) or total minutes (flat)
};

// The canonical codes. Per-type minutes mirror the estimator's
// DEFAULT_ASSEMBLY/INSTALL_MINUTES so a fresh shop budgets identically to the
// quote until the learning loop sharpens a code.
export const CANONICAL_COST_CODES: CostCodeDef[] = [
  // ── Assembly (shop) ──
  { code: "ASM-BASE", name: "Assemble base cabinet", phaseId: "assembly", cabinetType: "base", driver: "ea", defaultMinutes: 60 },
  { code: "ASM-WALL", name: "Assemble wall cabinet", phaseId: "assembly", cabinetType: "wall", driver: "ea", defaultMinutes: 45 },
  { code: "ASM-TALL", name: "Assemble tall cabinet", phaseId: "assembly", cabinetType: "tall", driver: "ea", defaultMinutes: 90 },
  { code: "ASM-ISLAND", name: "Assemble island cabinet", phaseId: "assembly", cabinetType: "island", driver: "ea", defaultMinutes: 90 },
  // ── Cut (table saw, in-house — ADR 0012; CNC = Toolpath sub, not here) ──
  { code: "CUT-SHEET", name: "Cut + edgeband sheet (table saw)", phaseId: "cnc", driver: "sheet", defaultMinutes: 15 },
  // ── Finishing (spray) ──
  { code: "FIN-SPRAY", name: "Spray finishing", phaseId: "finishing", driver: "sqft", defaultMinutes: 2 },
  // ── Delivery (loading) ──
  { code: "DEL-LOAD", name: "Load / deliver cabinet", phaseId: "delivery", driver: "ea", defaultMinutes: 5 },
  // ── Install (on-site) ──
  { code: "INST-BASE", name: "Install base cabinet", phaseId: "install", cabinetType: "base", driver: "ea", defaultMinutes: 30 },
  { code: "INST-WALL", name: "Install wall cabinet", phaseId: "install", cabinetType: "wall", driver: "ea", defaultMinutes: 20 },
  { code: "INST-TALL", name: "Install tall cabinet", phaseId: "install", cabinetType: "tall", driver: "ea", defaultMinutes: 45 },
  { code: "INST-ISLAND", name: "Install island cabinet", phaseId: "install", cabinetType: "island", driver: "ea", defaultMinutes: 45 },
  // ── Design (flat) ──
  { code: "DSN", name: "Design / drafting", phaseId: "design", driver: null, defaultMinutes: 0 },
];

export const PHASE_LABELS: Record<PhaseId, string> = {
  design: "Design",
  cnc: "Cut", // ADR 0012 — table saw, not CNC
  assembly: "Assembly",
  finishing: "Finishing",
  delivery: "Delivery",
  install: "Install",
};

export const PHASE_ORDER: PhaseId[] = [
  "design",
  "cnc",
  "assembly",
  "finishing",
  "delivery",
  "install",
];

export function findCostCode(code: string): CostCodeDef | undefined {
  return CANONICAL_COST_CODES.find((c) => c.code === code);
}

// Which labour rate a phase bills at — mirrors the estimator's rate usage
// (design = designRate; shop work = shopRate; on-site = installRate).
export function rateForPhase(phaseId: PhaseId, rates: LabourRates): number {
  switch (phaseId) {
    case "design":
      return rates.designRate;
    case "install":
      return rates.installRate;
    case "cnc":
    case "assembly":
    case "finishing":
    case "delivery":
    default:
      return rates.shopRate;
  }
}
