"use client";

// Shop Labour store — time-and-motion tracking, separate from the price-book
// Catalog. Live start/stop timers write rows into labour_sessions tagged by
// operation × category × worker (optionally a job). Aggregated into per-
// operation / per-category / per-worker averages for the bottleneck finder, and
// compared against the estimator's catalog_cabinet_types minute defaults to
// surface approve-to-apply suggestions. See features/labour/CLAUDE.md.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { CabinetTypeId } from "@features/estimator/lib/types";
import type { DriverUnit } from "@features/job-costing/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────

export type LabourCategory = { id: string; label: string; sort: number; active: boolean };
export type LabourOperation = {
  id: string;
  name: string;
  categoryId: string | null;
  cabinetType: CabinetTypeId | null;
  defaultMinutes: number | null;
  // Cost-code fields (P1 schema): `code` is the marker tying estimate <-> timer
  // <-> actuals; `driverUnit` set = time scales per unit (minutes ÷ unit).
  code: string | null;
  driverUnit: DriverUnit | null;
  active: boolean;
};
export type LabourWorker = { id: string; name: string; active: boolean };
export type LabourSession = {
  id: string;
  operationId: string | null;
  categoryId: string | null;
  workerId: string | null;
  jobId: string | null;
  cardId: string | null;     // the work_card this session is clocked against (Slice B)
  startedAt: string; // wall-clock anchor (when work first began) — for sort/Recent
  endedAt: string | null; // set = stopped
  // Pause/resume (ADR 0011): a Session measures ACTIVE time, pauses excluded.
  // running = endedAt null & resumedAt set; paused = endedAt null & resumedAt null.
  accumulatedMs: number; // active time banked from completed segments
  resumedAt: string | null; // start of the current live segment; null = paused/stopped
  targetQuantity: number | null; // driven code: target units entered on Start (suggested time)
  quantity: number | null; // units done this run for a driven code (captured on Stop)
  note: string | null;
};

// A cabinet-type minute default mirror (read from catalog_cabinet_types) so the
// auto-suggest can compare and write back.
type CabinetType = { id: CabinetTypeId; assemblyMinutes: number };

// ─── Derived analytics ──────────────────────────────────────────────────

export type OperationStat = {
  operation: LabourOperation;
  category: LabourCategory | null;
  count: number; // completed sessions
  totalMs: number;
  avgMs: number;
  running: number; // currently-running sessions
  totalQuantity: number; // Σ session quantity (driven codes)
  avgMinutesPerUnit: number | null; // minutes ÷ unit for driven codes (else null)
};
export type CategoryStat = {
  category: LabourCategory;
  count: number;
  totalMs: number;
  avgMs: number;
};
export type MinuteSuggestion = {
  cabinetType: CabinetTypeId;
  operationName: string;
  actualMinutes: number;
  currentMinutes: number;
  sampleSize: number;
};

// Active duration (pauses excluded): banked time + the current live segment.
// Stopped rows carry the full active total in accumulatedMs (banked on Stop).
// Legacy fallback: pre-pause completed rows (accumulatedMs 0, never resumed)
// keep their old wall-clock start→end duration so historical averages survive.
export function durationMs(s: LabourSession, now = Date.now()): number {
  if (s.accumulatedMs === 0 && s.resumedAt == null && s.endedAt) {
    return Math.max(0, new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime());
  }
  const live = s.resumedAt && !s.endedAt ? now - new Date(s.resumedAt).getTime() : 0;
  return Math.max(0, s.accumulatedMs + Math.max(0, live));
}

// A Session is paused when it is open (not stopped) but has no live segment.
export function isPaused(s: LabourSession): boolean {
  return s.endedAt == null && s.resumedAt == null;
}

// ─── Seed (localStorage fallback parity with the SQL seed) ──────────────

const SEED_CATEGORIES: LabourCategory[] = [
  { id: "design", label: "Design", sort: 10, active: true },
  { id: "cnc", label: "CNC / Cut", sort: 20, active: true },
  { id: "assembly", label: "Assembly", sort: 30, active: true },
  { id: "finishing", label: "Finishing", sort: 40, active: true },
  { id: "delivery", label: "Delivery", sort: 50, active: true },
  { id: "install", label: "Install", sort: 60, active: true },
];

const op = (
  id: string,
  name: string,
  categoryId: string,
  cabinetType: CabinetTypeId | null = null,
  defaultMinutes: number | null = null,
  code: string | null = null,
  driverUnit: DriverUnit | null = null
): LabourOperation => ({
  id,
  name,
  categoryId,
  cabinetType,
  defaultMinutes,
  code,
  driverUnit,
  active: true,
});

const SEED_OPERATIONS: LabourOperation[] = [
  op("o-base", "Assemble base cabinet", "assembly", "base", 60, "ASM-BASE"),
  op("o-wall", "Assemble wall cabinet", "assembly", "wall", 45, "ASM-WALL"),
  op("o-tall", "Assemble tall / pantry", "assembly", "tall", 90, "ASM-TALL"),
  op("o-island", "Assemble island", "assembly", "island", 90, "ASM-ISL"),
  op("o-cnc", "CNC cut sheet goods", "cnc", null, null, "CNC-CUT", "sheet"),
  op("o-edge", "Edgeband + prep", "cnc", null, null, "CNC-EDGE"),
  op("o-spray", "Spray finish (per batch)", "finishing", null, null, "FIN-SPRAY"),
  op("o-load", "Load truck", "delivery", null, null, "DEL-LOAD"),
  op("o-inst-up", "Install — uppers", "install", null, null, "INST-UP"),
  op("o-inst-base", "Install — bases", "install", null, null, "INST-BASE"),
  op("o-design", "Design / measure", "design", null, null, "DSGN"),
];

const SEED_WORKERS: LabourWorker[] = [{ id: "w-andrew", name: "Andrew", active: true }];

const newUuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

const NOW = () => new Date().toISOString();
const LS_KEY = "gw_labour_v1";

// ─── Row shapes ─────────────────────────────────────────────────────────

type CategoryRow = { id: string; label: string; sort: number; active: boolean };
type OperationRow = {
  id: string;
  name: string;
  category_id: string | null;
  cabinet_type: CabinetTypeId | null;
  default_minutes: number | string | null;
  code: string | null;
  driver_unit: DriverUnit | null;
  active: boolean;
};
type WorkerRow = { id: string; name: string; active: boolean };
type SessionRow = {
  id: string;
  operation_id: string | null;
  category_id: string | null;
  worker_id: string | null;
  job_id: string | null;
  card_id: string | null;
  started_at: string;
  ended_at: string | null;
  accumulated_ms: number | string | null;
  resumed_at: string | null;
  target_quantity: number | string | null;
  quantity: number | string | null;
  note: string | null;
};
type CabinetTypeRow = { id: CabinetTypeId; assembly_minutes: number | string };

const numOrNull = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

const rowToCategory = (r: CategoryRow): LabourCategory => ({
  id: r.id,
  label: r.label,
  sort: r.sort,
  active: r.active,
});
const rowToOperation = (r: OperationRow): LabourOperation => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  cabinetType: r.cabinet_type,
  defaultMinutes: numOrNull(r.default_minutes),
  code: r.code ?? null,
  driverUnit: r.driver_unit ?? null,
  active: r.active,
});
const rowToWorker = (r: WorkerRow): LabourWorker => ({ id: r.id, name: r.name, active: r.active });
const rowToSession = (r: SessionRow): LabourSession => ({
  id: r.id,
  operationId: r.operation_id,
  categoryId: r.category_id,
  workerId: r.worker_id,
  jobId: r.job_id,
  cardId: r.card_id ?? null,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  accumulatedMs: r.accumulated_ms == null || r.accumulated_ms === "" ? 0 : Number(r.accumulated_ms),
  resumedAt: r.resumed_at,
  targetQuantity: numOrNull(r.target_quantity),
  quantity: numOrNull(r.quantity),
  note: r.note,
});

// ─── Context ────────────────────────────────────────────────────────────

type LabourContextValue = {
  categories: LabourCategory[];
  operations: LabourOperation[];
  workers: LabourWorker[];
  sessions: LabourSession[];
  running: LabourSession[];
  loading: boolean;
  error: string | null;
  // Timers
  startTimer: (input: {
    operationId: string;
    workerId: string | null;
    jobId?: string | null;
    cardId?: string | null;
    targetQuantity?: number | null;
  }) => void;
  pauseTimer: (sessionId: string) => void;
  resumeTimer: (sessionId: string) => void;
  stopTimer: (sessionId: string, quantity?: number | null) => void;
  deleteSession: (sessionId: string) => void;
  // Operations
  addOperation: (name: string, categoryId: string | null) => void;
  updateOperation: (id: string, patch: Partial<LabourOperation>) => void;
  removeOperation: (id: string) => void;
  // Categories
  addCategory: (label: string) => void;
  updateCategory: (id: string, patch: Partial<LabourCategory>) => void;
  removeCategory: (id: string) => void;
  // Workers
  addWorker: (name: string) => void;
  updateWorker: (id: string, patch: Partial<LabourWorker>) => void;
  removeWorker: (id: string) => void;
  // Analytics
  operationStats: OperationStat[];
  categoryStats: CategoryStat[];
  suggestions: MinuteSuggestion[];
  applySuggestion: (s: MinuteSuggestion) => void;
  // Lookups
  categoryById: Map<string, LabourCategory>;
  operationById: Map<string, LabourOperation>;
  workerById: Map<string, LabourWorker>;
};

const LabourContext = createContext<LabourContextValue | null>(null);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `cat-${newUuid().slice(0, 8)}`;

export function LabourProvider({ children }: { children: ReactNode }) {
  const backend = hasSupabase() ? "supabase" : "localStorage";
  const [categories, setCategories] = useState<LabourCategory[]>(SEED_CATEGORIES);
  const [operations, setOperations] = useState<LabourOperation[]>(SEED_OPERATIONS);
  const [workers, setWorkers] = useState<LabourWorker[]>(SEED_WORKERS);
  const [sessions, setSessions] = useState<LabourSession[]>([]);
  const [cabinetTypes, setCabinetTypes] = useState<CabinetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // localStorage persistence (only when Supabase isn't configured).
  useEffect(() => {
    if (backend !== "localStorage" || loading) return;
    try {
      window.localStorage.setItem(
        LS_KEY,
        JSON.stringify({ categories, operations, workers, sessions })
      );
    } catch {
      /* silent */
    }
  }, [backend, loading, categories, operations, workers, sessions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend !== "supabase") {
        try {
          const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
          if (raw && !cancelled) {
            const p = JSON.parse(raw);
            setCategories(p.categories ?? SEED_CATEGORIES);
            setOperations(p.operations ?? SEED_OPERATIONS);
            setWorkers(p.workers ?? SEED_WORKERS);
            // Normalize pre-pause localStorage sessions to the new shape so
            // durationMs's legacy fallback engages (running rows resume-anchor
            // to startedAt; completed rows stay accumulatedMs 0 + resumedAt null).
            setSessions(
              ((p.sessions ?? []) as LabourSession[]).map((s) => ({
                ...s,
                accumulatedMs: s.accumulatedMs ?? 0,
                resumedAt: s.resumedAt ?? (s.endedAt ? null : s.startedAt),
                targetQuantity: s.targetQuantity ?? null,
              }))
            );
          }
        } catch {
          /* keep seed */
        }
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const sb = getSupabase();
        const [cats, ops, wks, sess, cabs] = await Promise.all([
          sb.from("labour_categories").select("*").order("sort"),
          sb.from("labour_operations").select("*"),
          sb.from("labour_workers").select("*"),
          sb.from("labour_sessions").select("*").order("started_at", { ascending: false }),
          sb.from("catalog_cabinet_types").select("id, assembly_minutes"),
        ]);
        if (cats.error) throw cats.error;
        if (ops.error) throw ops.error;
        if (wks.error) throw wks.error;
        if (sess.error) throw sess.error;
        if (!cancelled) {
          setCategories((cats.data as CategoryRow[]).map(rowToCategory));
          setOperations((ops.data as OperationRow[]).map(rowToOperation));
          setWorkers((wks.data as WorkerRow[]).map(rowToWorker));
          setSessions((sess.data as SessionRow[]).map(rowToSession));
          setCabinetTypes(
            ((cabs.data as CabinetTypeRow[] | null) ?? []).map((r) => ({
              id: r.id,
              assemblyMinutes: Number(r.assembly_minutes),
            }))
          );
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const sb = useCallback(() => getSupabase(), []);
  const isSb = backend === "supabase";

  // ─ Timers ─
  // One open Session per worker: starting auto-stops the worker's other open
  // Sessions (running or paused), banking each one's active time.
  const startTimer = useCallback(
    (input: {
      operationId: string;
      workerId: string | null;
      jobId?: string | null;
      cardId?: string | null;
      targetQuantity?: number | null;
    }) => {
      const opn = operations.find((o) => o.id === input.operationId);
      const startedAt = NOW();
      const now = Date.now();
      const closures = new Map<string, { endedAt: string; accumulatedMs: number }>();
      if (input.workerId) {
        for (const s of sessions) {
          if (s.workerId !== input.workerId || s.endedAt !== null) continue;
          const live = s.resumedAt ? Math.max(0, now - new Date(s.resumedAt).getTime()) : 0;
          closures.set(s.id, { endedAt: startedAt, accumulatedMs: s.accumulatedMs + live });
        }
      }
      const session: LabourSession = {
        id: newUuid(),
        operationId: input.operationId,
        categoryId: opn?.categoryId ?? null,
        workerId: input.workerId,
        jobId: input.jobId ?? null,
        cardId: input.cardId ?? null,
        startedAt,
        endedAt: null,
        accumulatedMs: 0,
        resumedAt: startedAt,
        targetQuantity: input.targetQuantity ?? null,
        quantity: null,
        note: null,
      };
      setSessions((prev) => [
        session,
        ...prev.map((s) => {
          const c = closures.get(s.id);
          return c
            ? { ...s, endedAt: c.endedAt, resumedAt: null, accumulatedMs: c.accumulatedMs }
            : s;
        }),
      ]);
      if (isSb) {
        closures.forEach((c, id) => {
          void sb()
            .from("labour_sessions")
            .update({ ended_at: c.endedAt, resumed_at: null, accumulated_ms: c.accumulatedMs })
            .eq("id", id)
            .then(({ error: e }) => e && setError(formatError(e)));
        });
        void sb()
          .from("labour_sessions")
          .insert({
            id: session.id,
            operation_id: session.operationId,
            category_id: session.categoryId,
            worker_id: session.workerId,
            job_id: session.jobId,
            card_id: session.cardId,
            started_at: session.startedAt,
            resumed_at: session.resumedAt,
            accumulated_ms: 0,
            target_quantity: session.targetQuantity,
          })
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [operations, sessions, isSb, sb]
  );

  // Pause = freeze the live segment (within-sitting break). Only acts on a
  // running Session; banks the live tail into accumulatedMs.
  const pauseTimer = useCallback(
    (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target || target.endedAt !== null || target.resumedAt == null) return; // not running
      const live = Math.max(0, Date.now() - new Date(target.resumedAt).getTime());
      const accumulatedMs = target.accumulatedMs + live;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, accumulatedMs, resumedAt: null } : s))
      );
      if (isSb) {
        void sb()
          .from("labour_sessions")
          .update({ accumulated_ms: accumulatedMs, resumed_at: null })
          .eq("id", sessionId)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [sessions, isSb, sb]
  );

  const resumeTimer = useCallback(
    (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target || target.endedAt !== null || target.resumedAt != null) return; // not paused
      const resumedAt = NOW();
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, resumedAt } : s)));
      if (isSb) {
        void sb()
          .from("labour_sessions")
          .update({ resumed_at: resumedAt })
          .eq("id", sessionId)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [sessions, isSb, sb]
  );

  const stopTimer = useCallback(
    (sessionId: string, quantity?: number | null) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target) return;
      // Already stopped: allow setting/correcting units (the Recent "set units" fix).
      if (target.endedAt !== null) {
        if (quantity === undefined) return;
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, quantity } : s)));
        if (isSb) {
          void sb()
            .from("labour_sessions")
            .update({ quantity })
            .eq("id", sessionId)
            .then(({ error: e }) => e && setError(formatError(e)));
        }
        return;
      }
      const endedAt = NOW();
      const live = target.resumedAt
        ? Math.max(0, Date.now() - new Date(target.resumedAt).getTime())
        : 0;
      const accumulatedMs = target.accumulatedMs + live; // full active total banked on stop
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                endedAt,
                resumedAt: null,
                accumulatedMs,
                quantity: quantity === undefined ? s.quantity : quantity,
              }
            : s
        )
      );
      if (isSb) {
        const update: Record<string, unknown> = {
          ended_at: endedAt,
          resumed_at: null,
          accumulated_ms: accumulatedMs,
        };
        if (quantity !== undefined) update.quantity = quantity;
        void sb()
          .from("labour_sessions")
          .update(update)
          .eq("id", sessionId)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [sessions, isSb, sb]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (isSb) {
        void sb()
          .from("labour_sessions")
          .delete()
          .eq("id", sessionId)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  // ─ Operations ─
  const addOperation = useCallback(
    (name: string, categoryId: string | null) => {
      const created: LabourOperation = {
        id: newUuid(),
        name,
        categoryId,
        cabinetType: null,
        defaultMinutes: null,
        code: null,
        driverUnit: null,
        active: true,
      };
      setOperations((prev) => [...prev, created]);
      if (isSb) {
        void sb()
          .from("labour_operations")
          .insert({ id: created.id, name, category_id: categoryId })
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const updateOperation = useCallback(
    (id: string, patch: Partial<LabourOperation>) => {
      setOperations((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      if (isSb) {
        const row: Record<string, unknown> = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
        if (patch.cabinetType !== undefined) row.cabinet_type = patch.cabinetType;
        if (patch.defaultMinutes !== undefined) row.default_minutes = patch.defaultMinutes;
        if (patch.code !== undefined) row.code = patch.code;
        if (patch.driverUnit !== undefined) row.driver_unit = patch.driverUnit;
        if (patch.active !== undefined) row.active = patch.active;
        void sb()
          .from("labour_operations")
          .update(row)
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const removeOperation = useCallback(
    (id: string) => updateOperation(id, { active: false }),
    [updateOperation]
  );

  // ─ Categories ─
  const addCategory = useCallback(
    (label: string) => {
      const id = slugify(label);
      const sort = (categories.reduce((m, c) => Math.max(m, c.sort), 0) || 0) + 10;
      const created: LabourCategory = { id, label, sort, active: true };
      setCategories((prev) => [...prev, created]);
      if (isSb) {
        void sb()
          .from("labour_categories")
          .insert({ id, label, sort })
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [categories, isSb, sb]
  );

  const updateCategory = useCallback(
    (id: string, patch: Partial<LabourCategory>) => {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      if (isSb) {
        void sb()
          .from("labour_categories")
          .update({ label: patch.label, sort: patch.sort, active: patch.active })
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const removeCategory = useCallback(
    (id: string) => updateCategory(id, { active: false }),
    [updateCategory]
  );

  // ─ Workers ─
  const addWorker = useCallback(
    (name: string) => {
      const created: LabourWorker = { id: newUuid(), name, active: true };
      setWorkers((prev) => [...prev, created]);
      if (isSb) {
        void sb()
          .from("labour_workers")
          .insert({ id: created.id, name })
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const updateWorker = useCallback(
    (id: string, patch: Partial<LabourWorker>) => {
      setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
      if (isSb) {
        void sb()
          .from("labour_workers")
          .update({ name: patch.name, active: patch.active })
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const removeWorker = useCallback(
    (id: string) => updateWorker(id, { active: false }),
    [updateWorker]
  );

  // ─ Lookups ─
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const operationById = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const running = useMemo(() => sessions.filter((s) => s.endedAt === null), [sessions]);

  // ─ Analytics (completed sessions only) ─
  const operationStats = useMemo<OperationStat[]>(() => {
    const byOp = new Map<string, { total: number; count: number; running: number; qty: number }>();
    for (const s of sessions) {
      if (!s.operationId) continue;
      const agg = byOp.get(s.operationId) ?? { total: 0, count: 0, running: 0, qty: 0 };
      if (s.endedAt === null) agg.running += 1;
      else {
        agg.total += durationMs(s);
        agg.count += 1;
        if (s.quantity != null) agg.qty += s.quantity;
      }
      byOp.set(s.operationId, agg);
    }
    return operations
      .filter((o) => o.active)
      .map((operation) => {
        const agg = byOp.get(operation.id) ?? { total: 0, count: 0, running: 0, qty: 0 };
        // Per-unit average only means something for a driven code with logged units.
        const avgMinutesPerUnit =
          operation.driverUnit && agg.qty > 0 ? agg.total / 60000 / agg.qty : null;
        return {
          operation,
          category: operation.categoryId ? (categoryById.get(operation.categoryId) ?? null) : null,
          count: agg.count,
          totalMs: agg.total,
          avgMs: agg.count > 0 ? agg.total / agg.count : 0,
          running: agg.running,
          totalQuantity: agg.qty,
          avgMinutesPerUnit,
        };
      })
      .sort((a, b) => b.totalMs - a.totalMs);
  }, [sessions, operations, categoryById]);

  const categoryStats = useMemo<CategoryStat[]>(() => {
    const byCat = new Map<string, { total: number; count: number }>();
    for (const s of sessions) {
      if (!s.categoryId || s.endedAt === null) continue;
      const agg = byCat.get(s.categoryId) ?? { total: 0, count: 0 };
      agg.total += durationMs(s);
      agg.count += 1;
      byCat.set(s.categoryId, agg);
    }
    return categories
      .filter((c) => c.active)
      .map((category) => {
        const agg = byCat.get(category.id) ?? { total: 0, count: 0 };
        return {
          category,
          count: agg.count,
          totalMs: agg.total,
          avgMs: agg.count > 0 ? agg.total / agg.count : 0,
        };
      })
      .sort((a, b) => b.totalMs - a.totalMs);
  }, [sessions, categories]);

  // ─ Estimator auto-suggest: actual assembly minutes vs catalog defaults ─
  const suggestions = useMemo<MinuteSuggestion[]>(() => {
    const out: MinuteSuggestion[] = [];
    for (const operation of operations) {
      if (!operation.active || !operation.cabinetType) continue;
      const completed = sessions.filter(
        (s) => s.operationId === operation.id && s.endedAt !== null
      );
      if (completed.length === 0) continue;
      const avgMin =
        completed.reduce((acc, s) => acc + durationMs(s), 0) / completed.length / 60000;
      const current = cabinetTypes.find((c) => c.id === operation.cabinetType)?.assemblyMinutes;
      if (current === undefined) continue;
      // Only nudge on a meaningful drift (>10% and >3 min) with ≥3 samples.
      const drift = Math.abs(avgMin - current);
      if (completed.length >= 3 && drift > 3 && drift / current > 0.1) {
        out.push({
          cabinetType: operation.cabinetType,
          operationName: operation.name,
          actualMinutes: Math.round(avgMin),
          currentMinutes: current,
          sampleSize: completed.length,
        });
      }
    }
    return out;
  }, [operations, sessions, cabinetTypes]);

  const applySuggestion = useCallback(
    (s: MinuteSuggestion) => {
      setCabinetTypes((prev) =>
        prev.map((c) => (c.id === s.cabinetType ? { ...c, assemblyMinutes: s.actualMinutes } : c))
      );
      if (isSb) {
        void sb()
          .from("catalog_cabinet_types")
          .update({ assembly_minutes: s.actualMinutes })
          .eq("id", s.cabinetType)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const value = useMemo<LabourContextValue>(
    () => ({
      categories,
      operations,
      workers,
      sessions,
      running,
      loading,
      error,
      startTimer,
      pauseTimer,
      resumeTimer,
      stopTimer,
      deleteSession,
      addOperation,
      updateOperation,
      removeOperation,
      addCategory,
      updateCategory,
      removeCategory,
      addWorker,
      updateWorker,
      removeWorker,
      operationStats,
      categoryStats,
      suggestions,
      applySuggestion,
      categoryById,
      operationById,
      workerById,
    }),
    [
      categories,
      operations,
      workers,
      sessions,
      running,
      loading,
      error,
      startTimer,
      pauseTimer,
      resumeTimer,
      stopTimer,
      deleteSession,
      addOperation,
      updateOperation,
      removeOperation,
      addCategory,
      updateCategory,
      removeCategory,
      addWorker,
      updateWorker,
      removeWorker,
      operationStats,
      categoryStats,
      suggestions,
      applySuggestion,
      categoryById,
      operationById,
      workerById,
    ]
  );

  return <LabourContext.Provider value={value}>{children}</LabourContext.Provider>;
}

export function useLabour(): LabourContextValue {
  const ctx = useContext(LabourContext);
  if (!ctx) throw new Error("useLabour must be used inside <LabourProvider>");
  return ctx;
}

// Ticking clock for live elapsed display (1s cadence).
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef(now);
  useEffect(() => {
    const t = setInterval(() => {
      ref.current = Date.now();
      setNow(ref.current);
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Format a ms duration as "1h 23m" / "12m 04s" / "45s".
export function formatDuration(ms: number, withSeconds = false): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return withSeconds ? `${m}m ${s.toString().padStart(2, "0")}s` : `${m}m`;
  return `${s}s`;
}

export function formatMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(min)}m`;
}
