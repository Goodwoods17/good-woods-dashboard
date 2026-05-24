"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LABOUR_RATES,
  DEFAULT_MARKUP_PCT,
  type LabourRates,
} from "@features/estimator/lib/types";

// Workspace-wide editable settings used by the estimator and other features.
// Lives in localStorage for now; trivially migratable to Supabase later
// (one row, columns mirroring this shape).

export type WorkspaceSettings = {
  schema: number;
  labourRates: LabourRates;
  defaultOverheadPct: number;
  defaultMarkupPct: number;
  defaultGasRatePerMile: number;
  defaultLoadMinutesPerCabinet: number;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  schema: 1,
  labourRates: { ...DEFAULT_LABOUR_RATES },
  defaultOverheadPct: 8,
  defaultMarkupPct: DEFAULT_MARKUP_PCT,
  defaultGasRatePerMile: 0.55,
  defaultLoadMinutesPerCabinet: 5,
};

const KEY = "gw_workspace_settings_v1";

type WorkspaceContextValue = {
  settings: WorkspaceSettings;
  update: (patch: Partial<WorkspaceSettings>) => void;
  updateRates: (patch: Partial<LabourRates>) => void;
  reset: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function load(): WorkspaceSettings {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WORKSPACE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSettings>;
    if (parsed.schema !== 1) return DEFAULT_WORKSPACE_SETTINGS;
    // Merge with defaults to be resilient to fields added in later versions.
    return {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...parsed,
      labourRates: {
        ...DEFAULT_WORKSPACE_SETTINGS.labourRates,
        ...(parsed.labourRates ?? {}),
      },
    } as WorkspaceSettings;
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

function save(s: WorkspaceSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* silent */
  }
}

export function WorkspaceSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings>(
    DEFAULT_WORKSPACE_SETTINGS,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(settings);
  }, [settings, hydrated]);

  const update = useCallback((patch: Partial<WorkspaceSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateRates = useCallback((patch: Partial<LabourRates>) => {
    setSettings((prev) => ({
      ...prev,
      labourRates: { ...prev.labourRates, ...patch },
    }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_WORKSPACE_SETTINGS);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ settings, update, updateRates, reset }),
    [settings, update, updateRates, reset],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceSettings(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error(
      "useWorkspaceSettings must be used inside <WorkspaceSettingsProvider>",
    );
  return ctx;
}
