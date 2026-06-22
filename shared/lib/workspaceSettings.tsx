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
import {
  DEFAULT_LABOUR_RATES,
  DEFAULT_MARKUP_PCT,
  type LabourRates,
} from "@features/estimator/lib/types";
import {
  DEFAULT_COMPANY,
  DEFAULT_TAX_RATE,
  setInvoiceIdentity,
  type CompanyInfo,
} from "@features/jobs/lib/invoice";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { useAuth } from "@shared/lib/authStore";
import { formatError } from "@shared/lib/formatError";

// Workspace-wide editable settings used by the estimator, invoicing, and other
// features. Persists to Supabase (single-row public.workspace_settings) when
// configured, with a localStorage fallback otherwise. Company + tax live here
// too, and are pushed into the invoice module (setInvoiceIdentity) so the PDF,
// ICS export, and totals all read the edited values.

export type WorkspaceSettings = {
  schema: number;
  company: CompanyInfo;
  taxRate: number;
  labourRates: LabourRates;
  defaultOverheadPct: number;
  defaultMarkupPct: number;
  defaultGasRatePerMile: number;
  defaultLoadMinutesPerCabinet: number;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  schema: 2,
  company: { ...DEFAULT_COMPANY },
  taxRate: DEFAULT_TAX_RATE,
  labourRates: { ...DEFAULT_LABOUR_RATES },
  defaultOverheadPct: 8,
  defaultMarkupPct: DEFAULT_MARKUP_PCT,
  defaultGasRatePerMile: 0.55,
  defaultLoadMinutesPerCabinet: 5,
};

const KEY = "gw_workspace_settings_v1";
const TABLE = "workspace_settings";
const ROW_ID = "singleton";

type WorkspaceContextValue = {
  settings: WorkspaceSettings;
  loading: boolean;
  error: string | null;
  update: (patch: Partial<WorkspaceSettings>) => void;
  updateRates: (patch: Partial<LabourRates>) => void;
  updateCompany: (patch: Partial<CompanyInfo>) => void;
  reset: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// Merge persisted data over defaults so fields added in later versions are
// always present (resilient to partial/old rows).
function withDefaults(parsed: Partial<WorkspaceSettings>): WorkspaceSettings {
  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    ...parsed,
    company: { ...DEFAULT_WORKSPACE_SETTINGS.company, ...(parsed.company ?? {}) },
    labourRates: {
      ...DEFAULT_WORKSPACE_SETTINGS.labourRates,
      ...(parsed.labourRates ?? {}),
    },
    schema: DEFAULT_WORKSPACE_SETTINGS.schema,
  };
}

function localLoad(): WorkspaceSettings {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WORKSPACE_SETTINGS;
    return withDefaults(JSON.parse(raw) as Partial<WorkspaceSettings>);
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

function localSave(s: WorkspaceSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* silent */
  }
}

export function WorkspaceSettingsProvider({ children }: { children: ReactNode }) {
  const backend = hasSupabase() ? "supabase" : "localStorage";
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const settingsRef = useRef<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  useEffect(() => {
    settingsRef.current = settings;
    // Keep the invoice module's live identity in sync with every change.
    setInvoiceIdentity(settings.company, settings.taxRate);
  }, [settings]);

  // Debounced remote write so inline edits coalesce into one upsert.
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend !== "supabase") {
        if (!cancelled) {
          setSettings(localLoad());
          setLoading(false);
        }
        return;
      }
      // Supabase backend: wait for auth, then require a signed-in user. The
      // anon SELECT (and the first-run seed insert) hit RLS and 401 on the
      // unauthenticated /login page, where this provider still mounts.
      if (authLoading) return;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const sb = getSupabase();
        const { data, error } = await sb.from(TABLE).select("data").eq("id", ROW_ID).maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          if (data?.data) {
            setSettings(withDefaults(data.data as Partial<WorkspaceSettings>));
          } else {
            // Seed the singleton row from defaults on first run.
            await sb.from(TABLE).insert({ id: ROW_ID, data: DEFAULT_WORKSPACE_SETTINGS });
            setSettings(DEFAULT_WORKSPACE_SETTINGS);
          }
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setSettings(localLoad());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, userId, authLoading]);

  // Persist on change (debounced for Supabase, immediate for localStorage).
  const persist = useCallback(
    (next: WorkspaceSettings) => {
      if (backend !== "supabase") {
        localSave(next);
        return;
      }
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        const sb = getSupabase();
        void sb
          .from(TABLE)
          .upsert({ id: ROW_ID, data: settingsRef.current })
          .then(({ error }) => error && setError(formatError(error)));
      }, 600);
    },
    [backend]
  );

  const apply = useCallback(
    (producer: (prev: WorkspaceSettings) => WorkspaceSettings) => {
      setSettings((prev) => {
        const next = producer(prev);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const update = useCallback(
    (patch: Partial<WorkspaceSettings>) => apply((prev) => ({ ...prev, ...patch })),
    [apply]
  );

  const updateRates = useCallback(
    (patch: Partial<LabourRates>) =>
      apply((prev) => ({
        ...prev,
        labourRates: { ...prev.labourRates, ...patch },
      })),
    [apply]
  );

  const updateCompany = useCallback(
    (patch: Partial<CompanyInfo>) =>
      apply((prev) => ({ ...prev, company: { ...prev.company, ...patch } })),
    [apply]
  );

  const reset = useCallback(() => apply(() => DEFAULT_WORKSPACE_SETTINGS), [apply]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ settings, loading, error, update, updateRates, updateCompany, reset }),
    [settings, loading, error, update, updateRates, updateCompany, reset]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceSettings(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceSettings must be used inside <WorkspaceSettingsProvider>");
  return ctx;
}
