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

const STORAGE_KEY = "gw_jobs_v1";
const SCHEMA_VERSION = 1;

type Persisted = {
  schema: number;
  jobs: Job[];
};

type JobsContextValue = {
  jobs: Job[];
  loading: boolean;
  updateJob: (id: string, patch: Partial<Job> | ((j: Job) => Job)) => void;
  resetToSeed: () => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

function load(): Job[] {
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

function save(jobs: Job[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, jobs };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full or denied — silent fail; in M3 we'll surface a toast
  }
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>(SEED_JOBS);
  const [loading, setLoading] = useState(true);
  // Pending activity log writes — debounced so quick edits coalesce.
  const pendingDiff = useRef<Map<string, { prev: Job; next: Job }>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setJobs(load());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) save(jobs);
  }, [jobs, loading]);

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
        return { ...j, activity: [...(j.activity ?? []), ...events] };
      })
    );
  }, []);

  const updateJob = useCallback(
    (id: string, patch: Partial<Job> | ((j: Job) => Job)) => {
      setJobs((prev) => {
        const next = prev.map((j) => {
          if (j.id !== id) return j;
          const updated = typeof patch === "function" ? patch(j) : { ...j, ...patch };
          // Track diff for activity log: keep earliest "prev" we've seen this debounce window.
          const existing = pendingDiff.current.get(id);
          pendingDiff.current.set(id, {
            prev: existing?.prev ?? j,
            next: updated,
          });
          return updated;
        });
        return next;
      });
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flushActivity, 1500);
    },
    [flushActivity]
  );

  // Flush any pending activity before unmount.
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushActivity();
    };
  }, [flushActivity]);

  const resetToSeed = useCallback(() => {
    setJobs(SEED_JOBS);
    pendingDiff.current.clear();
  }, []);

  return (
    <JobsContext.Provider value={{ jobs, loading, updateJob, resetToSeed }}>
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
