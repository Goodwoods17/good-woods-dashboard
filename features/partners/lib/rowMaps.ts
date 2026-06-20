/**
 * Supabase row <-> domain conversion for the Partners feature. Row shapes are
 * snake_case and mirror supabase/migrations/20260620000000_partners.sql.
 * Mirrors the pattern in features/contacts/lib/contactsRowMap.ts.
 */
import type { JobTrade, JobTradeStatus, PartnerPerson, Subtrade, Trade } from "./types";

export const TRADES_TABLE = "trades";
export const SUBTRADES_TABLE = "subtrades";
export const JOB_TRADES_TABLE = "job_trades";
export const PARTNER_PEOPLE_TABLE = "partner_people";

// Postgres `numeric` can arrive as a string; normalize to number | null.
function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------

export type TradeRow = {
  id: string;
  key: string;
  label: string;
  color: string;
  icon: string;
  is_suggested_default: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function rowToTrade(r: TradeRow): Trade {
  return {
    id: r.id,
    key: r.key,
    label: r.label ?? "",
    color: r.color ?? "other",
    icon: r.icon ?? "shapes",
    isSuggestedDefault: r.is_suggested_default ?? false,
    sortOrder: r.sort_order ?? 0,
    active: r.active ?? true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function tradeToRow(t: Trade): TradeRow {
  return {
    id: t.id,
    key: t.key,
    label: t.label,
    color: t.color,
    icon: t.icon,
    is_suggested_default: t.isSuggestedDefault,
    sort_order: t.sortOrder,
    active: t.active,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Subtrade
// ---------------------------------------------------------------------------

export type SubtradeRow = {
  id: string;
  name: string;
  trade_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  typical_rate_note: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function rowToSubtrade(r: SubtradeRow): Subtrade {
  return {
    id: r.id,
    name: r.name ?? "",
    tradeId: r.trade_id,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    typicalRateNote: r.typical_rate_note,
    notes: r.notes,
    active: r.active ?? true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function subtradeToRow(s: Subtrade): SubtradeRow {
  return {
    id: s.id,
    name: s.name,
    trade_id: s.tradeId ?? null,
    contact_name: s.contactName ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    address: s.address ?? null,
    typical_rate_note: s.typicalRateNote ?? null,
    notes: s.notes ?? null,
    active: s.active,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// JobTrade (trade-line)
// ---------------------------------------------------------------------------

export type JobTradeRow = {
  id: string;
  job_id: string;
  trade_id: string;
  subtrade_id: string | null;
  person_id: string | null;
  status: JobTradeStatus;
  cost: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToJobTrade(r: JobTradeRow): JobTrade {
  return {
    id: r.id,
    jobId: r.job_id,
    tradeId: r.trade_id,
    subtradeId: r.subtrade_id,
    personId: r.person_id ?? null,
    status: r.status ?? "needed",
    cost: toNumOrNull(r.cost),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function jobTradeToRow(j: JobTrade): JobTradeRow {
  return {
    id: j.id,
    job_id: j.jobId,
    trade_id: j.tradeId,
    subtrade_id: j.subtradeId ?? null,
    person_id: j.personId ?? null,
    status: j.status,
    cost: j.cost,
    notes: j.notes ?? null,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// PartnerPerson
// ---------------------------------------------------------------------------

export type PartnerPersonRow = {
  id: string;
  supplier_id: string | null;
  subtrade_id: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function rowToPartnerPerson(r: PartnerPersonRow): PartnerPerson {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    subtradeId: r.subtrade_id,
    name: r.name ?? "",
    role: r.role,
    phone: r.phone,
    email: r.email,
    isPrimary: r.is_primary ?? false,
    notes: r.notes,
    active: r.active ?? true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function partnerPersonToRow(p: PartnerPerson): PartnerPersonRow {
  return {
    id: p.id,
    supplier_id: p.supplierId ?? null,
    subtrade_id: p.subtradeId ?? null,
    name: p.name,
    role: p.role ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    is_primary: p.isPrimary,
    notes: p.notes ?? null,
    active: p.active,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}
