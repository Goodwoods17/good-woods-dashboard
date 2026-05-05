"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Job } from "./types";
import { SEED_JOBS } from "./jobs";
import { diffActivity } from "./activity";
import { hasSupabase, getSupabase, JOBS_TABLE } from "./supabase";
import { rowToJob, jobToRow, type JobRow } from "./jobsRowMap";

const STORAGE_KEY = "gw_jobs_v1";
const SCHEMA_VERSION = 1;

type Persisted = {
  schema: number;
  jobs: Job[];
};

export type StoreBackend = "supabase" | "localStorage";

type JobsContextValue = {
  jobs: Job[];
  loading: boolean;
  backend: StoreBackend;
  error: string | null;
  updateJob: (id: string, patch: Partial<Job> | ((j: Job) => Job)) => void;
  resetToSeed: () => Promise<void>;
  seedDatabase: () => Promise<{ inserted: number }>;
  refresh: () => Promise<void>;
};

const JobsContext = createContext<JobsContextValue | null>(null);

// ─── localStorage helpers ──────────────────────────────────────────────────

function localLoad(): Job[] {
  if (typeof window === "undefined") return SEED_JOBS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_JOBS;
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.jobs)) {
      return SEED_JOBS;
    }
    return parsed.jobs;
  } catch {
    return SEED_JOBS;
  }
}

function localSave(jobs: Job[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, jobs };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage full or denied — silent fail */
  }
}

// ─── Supabase helpers ──────────────────────────────────────────────────────

async function supabaseLoad(): Promise<Job[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(JOBS_TABLE)
    .select("*")
    .order("install_date", { ascending: true });
  if (error) throw error;
  return (data as JobRow[] | null)?.map(rowToJob) ?? [];
}

async function supabaseUpsertMany(jobs: Job[]): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(JOBS_TABLE).upsert(jobs.map(jobToRow));
  if (error) throw error;
}

async function supabaseDeleteAll(): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(JOBS_TABLE).delete().not("id", "is", null);
  if (error) throw error;
}

// ─── Provider ──────────────────────────────────────────────────────────────

export function JobsProvider({ children }: { children: ReactNode }) {
  const backend: StoreBackend = hasSupabase() ? "supabase" : "localStorage";
  const [jobs, setJobs] = useState<Job[]>(SEED_JOBS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pending activity log writes — debounced so quick edits coalesce.
  const pendingDiff = useRef<Map<string, { prev: Job; next: Job }>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending remote upserts — debounced separately so we don't fire one network
  // call per keystroke when editing a cost cell.
  const pendingUpserts = useRef<Set<string>>(new Set());
  const upsertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setJobs(remote);
        } else {
          if (!cancelled) setJobs(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setJobs(localLoad());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  // Persist to localStorage whenever jobs change (used as cache + fallback).
  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(jobs);
  }, [jobs, loading, backend]);

  // Apply pending diffs into the activity log.
  const flushActivity = useCallback(() => {
    if (pendingDiff.current.size === 0) return;
    const snapshots = pendingDiff.current;
    pendingDiff.current = new Map();
    setJobs((prev) =>
      prev.map((j) => {
        const snap = snapshots.get(j.id);
        if (!snap) return j;
        const events = diffActivity(snap.prev, snap.next);
        if (events.length === 0) return j;
        const next = { ...j, activity: [...(j.activity ?? []), ...events] };
        // Activity edits should also flow to remote.
        pendingUpserts.current.add(next.id);
        return next;
      })
    );
  }, []);

  // Push debounced upserts to Supabase.
  const flushUpserts = useCallback(async () => {
    if (backend !== "supabase") return;
    const ids = Array.from(pendingUpserts.current);
    pendingUpserts.current.clear();
    if (ids.length === 0) return;
    setJobs((prev) => {
      const targets = prev.filter((j) => ids.includes(j.id));
      // Fire-and-forget — failures show up in the error banner.
      supabaseUpsertMany(targets).catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
      return prev;
    });
  }, [backend]);

  const updateJob = useCallback(
    (id: string, patch: Partial<Job> | ((j: Job) => Job)) => {
      setJobs((prev) => {
        return prev.map((j) => {
          if (j.id !== id) return j;
          const updated = typeof patch === "function" ? patch(j) : { ...j, ...patch };
          const existing = pendingDiff.current.get(id);
          pendingDiff.current.set(id, {
            prev: existing?.prev ?? j,
            next: updated,
          });
          pendingUpserts.current.add(id);
          return updated;
        });
      });
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flushActivity, 1500);
      if (upsertTimer.current) clearTimeout(upsertTimer.current);
      upsertTimer.current = setTimeout(flushUpserts, 1800);
    },
    [flushActivity, flushUpserts]
  );

  // Flush before unmount.
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (upsertTimer.current) clearTimeout(upsertTimer.current);
      flushActivity();
      flushUpserts();
    };
  }, [flushActivity, flushUpserts]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      const remote = await supabaseLoad();
      setJobs(remote);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const resetToSeed = useCallback(async () => {
    if (backend === "supabase") {
      try {
        await supabaseDeleteAll();
        await supabaseUpsertMany(SEED_JOBS);
        setJobs(SEED_JOBS);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } else {
      setJobs(SEED_JOBS);
    }
    pendingDiff.current.clear();
    pendingUpserts.current.clear();
  }, [backend]);

  const seedDatabase = useCallback(async () => {
    if (backend !== "supabase") return { inserted: 0 };
    try {
      await supabaseUpsertMany(SEED_JOBS);
      setJobs(SEED_JOBS);
      setError(null);
      return { inserted: SEED_JOBS.length };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return { inserted: 0 };
    }
  }, [backend]);

  return (
    <JobsContext.Provider
      value={{
        jobs,
        loading,
        backend,
        error,
        updateJob,
        resetToSeed,
        seedDatabase,
        refresh,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext);
  if (!ctx) {
    throw new Error("useJobs must be used inside <JobsProvider>");
  }
  return ctx;
}

export function useJob(id: string): Job | undefined {
  const { jobs } = useJobs();
  return jobs.find((j) => j.id === id);
}
