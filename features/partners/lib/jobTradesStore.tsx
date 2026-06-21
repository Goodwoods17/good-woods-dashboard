"use client";

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
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { JobTrade } from "./types";
import {
  jobTradeToRow,
  JOB_TRADES_TABLE,
  rowToJobTrade,
  type JobTradeRow,
} from "./rowMaps";

const STORAGE_KEY = "gw_job_trades_v1";
const SCHEMA_VERSION = 1;

type Persisted = { schema: number; jobTrades: JobTrade[] };

export type JobTradesBackend = "supabase" | "localStorage";

type JobTradesContextValue = {
  jobTrades: JobTrade[];
  loading: boolean;
  backend: JobTradesBackend;
  error: string | null;
  refresh: () => Promise<void>;
  /** Trade-lines for one project, oldest first. */
  tradesForJob: (jobId: string) => JobTrade[];
  addJobTrade: (line: JobTrade) => Promise<void>;
  updateJobTrade: (id: string, patch: Partial<JobTrade>) => Promise<void>;
  removeJobTrade: (id: string) => Promise<void>;
};

const JobTradesContext = createContext<JobTradesContextValue | null>(null);

function byCreated(a: JobTrade, b: JobTrade): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function localLoad(): JobTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.jobTrades)) {
      return [];
    }
    return parsed.jobTrades;
  } catch {
    return [];
  }
}

function localSave(jobTrades: JobTrade[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, jobTrades };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / denied — silent fail, matches contactsStore */
  }
}

async function supabaseLoad(): Promise<JobTrade[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(JOB_TRADES_TABLE)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as JobTradeRow[] | null)?.map(rowToJobTrade) ?? [];
}

export function JobTradesProvider({ children }: { children: ReactNode }) {
  const backend: JobTradesBackend = hasSupabase() ? "supabase" : "localStorage";
  const [jobTrades, setJobTrades] = useState<JobTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const jobTradesRef = useRef<JobTrade[]>([]);

  useEffect(() => {
    jobTradesRef.current = jobTrades;
  }, [jobTrades]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setJobTrades(remote);
        } else {
          if (!cancelled) setJobTrades(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setJobTrades(localLoad());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(jobTrades);
  }, [jobTrades, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      setJobTrades(await supabaseLoad());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const addJobTrade = useCallback(
    async (line: JobTrade) => {
      setJobTrades((prev) => [...prev, line].sort(byCreated));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(JOB_TRADES_TABLE)
          .insert(jobTradeToRow(line));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setJobTrades((prev) => prev.filter((l) => l.id !== line.id));
        throw e;
      }
    },
    [backend]
  );

  const updateJobTrade = useCallback(
    async (id: string, patch: Partial<JobTrade>) => {
      const previous = jobTradesRef.current;
      setJobTrades((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      if (backend !== "supabase") return;
      try {
        const prevRow = previous.find((l) => l.id === id);
        if (!prevRow) return;
        const merged = { ...prevRow, ...patch };
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(JOB_TRADES_TABLE)
          .update(jobTradeToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setJobTrades(previous);
        throw e;
      }
    },
    [backend]
  );

  const removeJobTrade = useCallback(
    async (id: string) => {
      const previous = jobTradesRef.current;
      setJobTrades((prev) => prev.filter((l) => l.id !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(JOB_TRADES_TABLE).delete().eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setJobTrades(previous);
        throw e;
      }
    },
    [backend]
  );

  const tradesForJob = useCallback(
    (jobId: string) => jobTrades.filter((l) => l.jobId === jobId).sort(byCreated),
    [jobTrades]
  );

  const value = useMemo(
    () => ({
      jobTrades,
      loading,
      backend,
      error,
      refresh,
      tradesForJob,
      addJobTrade,
      updateJobTrade,
      removeJobTrade,
    }),
    [jobTrades, loading, backend, error, refresh, tradesForJob, addJobTrade, updateJobTrade, removeJobTrade]
  );

  return <JobTradesContext.Provider value={value}>{children}</JobTradesContext.Provider>;
}

export function useJobTrades(): JobTradesContextValue {
  const ctx = useContext(JobTradesContext);
  if (!ctx) {
    throw new Error("useJobTrades must be used inside <JobTradesProvider>");
  }
  return ctx;
}
