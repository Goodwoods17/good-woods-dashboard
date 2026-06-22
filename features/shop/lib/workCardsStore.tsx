"use client";
import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";

export type WorkCardStatus = "todo" | "doing" | "stuck" | "done";
export type WorkCardSource = "budget" | "template" | "manual";

export type WorkCard = {
  id: string;
  jobId: string;
  phaseId: string;
  operationId: string | null;
  description: string;
  targetQuantity: number | null;
  assigneeId: string | null;
  status: WorkCardStatus;
  stuckReason: string | null;
  source: WorkCardSource;
  sort: number;
};
export type NewWorkCard = Omit<WorkCard, "id">;

const TABLE = "work_cards";
const LS_KEY = "gw_work_cards_v1";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function rowToCard(r: Record<string, unknown>): WorkCard {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    phaseId: String(r.phase_id),
    operationId: (r.operation_id as string) ?? null,
    description: (r.description as string) ?? "",
    targetQuantity: num(r.target_quantity),
    assigneeId: (r.assignee_id as string) ?? null,
    status: (r.status as WorkCardStatus) ?? "todo",
    stuckReason: (r.stuck_reason as string) ?? null,
    source: (r.source as WorkCardSource) ?? "manual",
    sort: num(r.sort) ?? 0,
  };
}
export function cardToRow(c: WorkCard): Record<string, unknown> {
  return {
    id: c.id, job_id: c.jobId, phase_id: c.phaseId, operation_id: c.operationId,
    description: c.description, target_quantity: c.targetQuantity, assignee_id: c.assigneeId,
    status: c.status, stuck_reason: c.stuckReason, source: c.source, sort: c.sort,
  };
}

type Ctx = {
  cards: WorkCard[]; loading: boolean; error: string | null;
  addCard: (c: NewWorkCard) => Promise<string>;
  updateCard: (id: string, patch: Partial<WorkCard>) => void;
  removeCard: (id: string) => void;
  cardsForJob: (jobId: string) => WorkCard[];
  refresh: () => Promise<void>;
};
const WorkCardsContext = createContext<Ctx | null>(null);

function localLoad(): WorkCard[] {
  if (typeof window === "undefined") return [];
  try { const raw = window.localStorage.getItem(LS_KEY); return raw ? (JSON.parse(raw) as WorkCard[]) : []; }
  catch { return []; }
}
function localSave(cards: WorkCard[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(cards)); } catch { /* silent */ }
}
function newId(): string { return `wc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

export function WorkCardsProvider({ children }: { children: ReactNode }) {
  const isSb = hasSupabase();
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSb) { setCards(localLoad()); setLoading(false); return; }
    try {
      const { data, error } = await getSupabase().from(TABLE).select("*").order("sort");
      if (error) throw error;
      setCards((data ?? []).map(rowToCard)); setError(null);
    } catch (e) { setError(formatError(e)); setCards(localLoad()); }
    finally { setLoading(false); }
  }, [isSb]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!loading && !isSb) localSave(cards); }, [cards, loading, isSb]);

  const addCard = useCallback(async (c: NewWorkCard) => {
    const card: WorkCard = { ...c, id: newId() };
    setCards((prev) => [...prev, card]);
    if (isSb) {
      try { const { error } = await getSupabase().from(TABLE).insert(cardToRow(card)); if (error) throw error; setError(null); }
      catch (e) { setError(formatError(e)); setCards((prev) => prev.filter((x) => x.id !== card.id)); }
    }
    return card.id;
  }, [isSb]);

  const updateCard = useCallback((id: string, patch: Partial<WorkCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (isSb) {
      const row: Record<string, unknown> = {};
      if ("status" in patch) row.status = patch.status;
      if ("stuckReason" in patch) row.stuck_reason = patch.stuckReason;
      if ("assigneeId" in patch) row.assignee_id = patch.assigneeId;
      if ("operationId" in patch) row.operation_id = patch.operationId;
      if ("phaseId" in patch) row.phase_id = patch.phaseId;
      if ("description" in patch) row.description = patch.description;
      if ("targetQuantity" in patch) row.target_quantity = patch.targetQuantity;
      if ("sort" in patch) row.sort = patch.sort;
      if (Object.keys(row).length > 0) {
        void getSupabase().from(TABLE).update(row).eq("id", id).then(({ error }) => { if (error) setError(formatError(error)); });
      }
    }
  }, [isSb]);

  const removeCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (isSb) void getSupabase().from(TABLE).delete().eq("id", id).then(({ error }) => { if (error) setError(formatError(error)); });
  }, [isSb]);

  const cardsForJob = useCallback((jobId: string) => cards.filter((c) => c.jobId === jobId), [cards]);

  return (
    <WorkCardsContext.Provider value={{ cards, loading, error, addCard, updateCard, removeCard, cardsForJob, refresh }}>
      {children}
    </WorkCardsContext.Provider>
  );
}
export function useWorkCards(): Ctx {
  const ctx = useContext(WorkCardsContext);
  if (!ctx) throw new Error("useWorkCards must be used inside <WorkCardsProvider>");
  return ctx;
}
