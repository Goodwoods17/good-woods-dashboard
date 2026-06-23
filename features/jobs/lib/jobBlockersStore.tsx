"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import { rowToBlocker, blockerToRow } from "@features/jobs/lib/jobBlockerRowMap";
import type { JobBlocker } from "@shared/lib/types";

export type NewJobBlocker = Omit<JobBlocker, "id" | "raisedAt" | "resolvedAt">;

const TABLE = "job_blockers";
const LS_KEY = "gw_job_blockers_v1";

type Ctx = {
  blockers: JobBlocker[];
  loading: boolean;
  error: string | null;
  activeByJob: Map<string, JobBlocker[]>;
  activeForJob: (jobId: string) => JobBlocker[];
  addBlocker: (b: NewJobBlocker) => Promise<string>;
  resolveBlocker: (id: string) => void;
  reopenBlocker: (id: string) => void;
  refresh: () => Promise<void>;
};
const JobBlockersContext = createContext<Ctx | null>(null);

function localLoad(): JobBlocker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as JobBlocker[]) : [];
  } catch {
    return [];
  }
}
function localSave(blockers: JobBlocker[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(blockers));
  } catch {
    /* silent */
  }
}
function newId(): string {
  return crypto.randomUUID();
}

export function JobBlockersProvider({ children }: { children: ReactNode }) {
  const isSb = hasSupabase();
  const [blockers, setBlockers] = useState<JobBlocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSb) {
      setBlockers(localLoad());
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await getSupabase()
        .from(TABLE)
        .select("*")
        .order("raised_at", { ascending: false });
      if (error) throw error;
      setBlockers((data ?? []).map(rowToBlocker));
      setError(null);
    } catch (e) {
      setError(formatError(e));
      setBlockers(localLoad());
    } finally {
      setLoading(false);
    }
  }, [isSb]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!loading && !isSb) localSave(blockers);
  }, [blockers, loading, isSb]);

  const addBlocker = useCallback(
    async (b: NewJobBlocker) => {
      const blocker: JobBlocker = {
        ...b,
        id: newId(),
        raisedAt: new Date().toISOString(),
        resolvedAt: null,
      };
      setBlockers((prev) => [blocker, ...prev]);
      if (isSb) {
        try {
          const { error } = await getSupabase().from(TABLE).insert(blockerToRow(blocker));
          if (error) throw error;
          setError(null);
        } catch (e) {
          setError(formatError(e));
          setBlockers((prev) => prev.filter((x) => x.id !== blocker.id));
        }
      }
      return blocker.id;
    },
    [isSb]
  );

  const resolveBlocker = useCallback(
    (id: string) => {
      const resolvedAt = new Date().toISOString();
      setBlockers((prev) => prev.map((b) => (b.id === id ? { ...b, resolvedAt } : b)));
      if (isSb) {
        void getSupabase()
          .from(TABLE)
          .update({ resolved_at: resolvedAt, updated_at: resolvedAt })
          .eq("id", id)
          .then(({ error }) => {
            if (error) setError(formatError(error));
          });
      }
    },
    [isSb]
  );

  const reopenBlocker = useCallback(
    (id: string) => {
      const updatedAt = new Date().toISOString();
      setBlockers((prev) => prev.map((b) => (b.id === id ? { ...b, resolvedAt: null } : b)));
      if (isSb) {
        void getSupabase()
          .from(TABLE)
          .update({ resolved_at: null, updated_at: updatedAt })
          .eq("id", id)
          .then(({ error }) => {
            if (error) setError(formatError(error));
          });
      }
    },
    [isSb]
  );

  const activeByJob = useMemo(() => {
    const m = new Map<string, JobBlocker[]>();
    for (const b of blockers) {
      if (b.resolvedAt) continue;
      const arr = m.get(b.jobId) ?? [];
      arr.push(b);
      m.set(b.jobId, arr);
    }
    for (const arr of Array.from(m.values())) {
      arr.sort((a, b) => (a.raisedAt < b.raisedAt ? -1 : a.raisedAt > b.raisedAt ? 1 : 0));
    }
    return m;
  }, [blockers]);

  const activeForJob = useCallback((jobId: string) => activeByJob.get(jobId) ?? [], [activeByJob]);

  return (
    <JobBlockersContext.Provider
      value={{
        blockers,
        loading,
        error,
        activeByJob,
        activeForJob,
        addBlocker,
        resolveBlocker,
        reopenBlocker,
        refresh,
      }}
    >
      {children}
    </JobBlockersContext.Provider>
  );
}
export function useJobBlockers(): Ctx {
  const ctx = useContext(JobBlockersContext);
  if (!ctx) throw new Error("useJobBlockers must be used inside <JobBlockersProvider>");
  return ctx;
}
