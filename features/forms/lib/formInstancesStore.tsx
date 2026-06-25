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
import type {
  FormInstance,
  FormInstanceField,
  FormTemplate,
  FormTemplateField,
} from "@shared/lib/types";
import {
  FORM_INSTANCES_TABLE,
  FORM_INSTANCE_FIELDS_TABLE,
  getSupabase,
  hasSupabase,
} from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import {
  formInstanceFieldToRow,
  formInstanceToRow,
  rowToFormInstance,
  rowToFormInstanceField,
  type FormInstanceFieldRow,
  type FormInstanceRow,
} from "./formInstancesRowMap";
import { snapshotTemplate } from "./snapshot";

const INSTANCES_KEY = "gw_form_instances_v1";
const FIELDS_KEY = "gw_form_instance_fields_v1";
const SCHEMA_VERSION = 1;

type PersistedInstances = { schema: number; instances: FormInstance[] };
type PersistedFields = { schema: number; fields: FormInstanceField[] };

export type FormsBackend = "supabase" | "localStorage";

type FormInstancesContextValue = {
  instances: FormInstance[];
  fields: FormInstanceField[];
  loading: boolean;
  backend: FormsBackend;
  error: string | null;
  refresh: () => Promise<void>;
  instancesForJob: (jobId: string) => FormInstance[];
  fieldsForInstance: (instanceId: string) => FormInstanceField[];
  /** Snapshot a template onto a job (or null = standalone). Returns the new instance. */
  attachTemplate: (
    template: FormTemplate,
    templateFields: FormTemplateField[],
    jobId: string | null
  ) => Promise<FormInstance>;
  /** Patch a single instance field's answer; bumps a draft instance to in_progress. */
  updateInstanceField: (fieldId: string, patch: Partial<FormInstanceField>) => Promise<void>;
};

const FormInstancesContext = createContext<FormInstancesContextValue | null>(null);

function localLoadInstances(): FormInstance[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INSTANCES_KEY);
    if (!raw) return [];
    const parsed: PersistedInstances = JSON.parse(raw);
    return parsed.schema === SCHEMA_VERSION && Array.isArray(parsed.instances)
      ? parsed.instances
      : [];
  } catch {
    return [];
  }
}

function localLoadFields(): FormInstanceField[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FIELDS_KEY);
    if (!raw) return [];
    const parsed: PersistedFields = JSON.parse(raw);
    return parsed.schema === SCHEMA_VERSION && Array.isArray(parsed.fields) ? parsed.fields : [];
  } catch {
    return [];
  }
}

function localSaveInstances(instances: FormInstance[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INSTANCES_KEY,
      JSON.stringify({ schema: SCHEMA_VERSION, instances })
    );
  } catch {
    /* quota / denied — silent fail, matches jobsStore */
  }
}

function localSaveFields(fields: FormInstanceField[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIELDS_KEY, JSON.stringify({ schema: SCHEMA_VERSION, fields }));
  } catch {
    /* quota / denied */
  }
}

async function supabaseLoad(): Promise<{
  instances: FormInstance[];
  fields: FormInstanceField[];
}> {
  const sb = getSupabase();
  const [insRes, fldRes] = await Promise.all([
    sb.from(FORM_INSTANCES_TABLE).select("*").order("sort_order", { ascending: true }),
    sb.from(FORM_INSTANCE_FIELDS_TABLE).select("*").order("sort_order", { ascending: true }),
  ]);
  if (insRes.error) throw insRes.error;
  if (fldRes.error) throw fldRes.error;
  return {
    instances: (insRes.data as FormInstanceRow[] | null)?.map(rowToFormInstance) ?? [],
    fields: (fldRes.data as FormInstanceFieldRow[] | null)?.map(rowToFormInstanceField) ?? [],
  };
}

export function FormInstancesProvider({ children }: { children: ReactNode }) {
  const backend: FormsBackend = hasSupabase() ? "supabase" : "localStorage";
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [fields, setFields] = useState<FormInstanceField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const instancesRef = useRef<FormInstance[]>([]);
  const fieldsRef = useRef<FormInstanceField[]>([]);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) {
            setInstances(remote.instances);
            setFields(remote.fields);
          }
        } else if (!cancelled) {
          setInstances(localLoadInstances());
          setFields(localLoadFields());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setInstances(localLoadInstances());
          setFields(localLoadFields());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  // Persist to localStorage in fallback mode (Supabase persists per-write).
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveInstances(instances);
  }, [instances, loading, backend]);
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveFields(fields);
  }, [fields, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      const remote = await supabaseLoad();
      setInstances(remote.instances);
      setFields(remote.fields);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const attachTemplate = useCallback(
    async (
      template: FormTemplate,
      templateFields: FormTemplateField[],
      jobId: string | null
    ): Promise<FormInstance> => {
      const { instance, fields: snapFields } = snapshotTemplate(template, templateFields, jobId);
      // Optimistic.
      setInstances((prev) => [...prev, instance]);
      setFields((prev) => [...prev, ...snapFields]);

      if (backend !== "supabase") return instance;
      try {
        const sb = getSupabase();
        const { error: insErr } = await sb
          .from(FORM_INSTANCES_TABLE)
          .insert(formInstanceToRow(instance));
        if (insErr) throw insErr;
        if (snapFields.length) {
          const { error: fldErr } = await sb
            .from(FORM_INSTANCE_FIELDS_TABLE)
            .insert(snapFields.map(formInstanceFieldToRow));
          if (fldErr) throw fldErr;
        }
        setError(null);
      } catch (e) {
        setError(formatError(e));
        // Roll back the optimistic insert.
        setInstances((prev) => prev.filter((i) => i.id !== instance.id));
        setFields((prev) => prev.filter((f) => f.instanceId !== instance.id));
        throw e;
      }
      return instance;
    },
    [backend]
  );

  const updateInstanceField = useCallback(
    async (fieldId: string, patch: Partial<FormInstanceField>) => {
      const prevFields = fieldsRef.current;
      const prevInstances = instancesRef.current;
      const target = prevFields.find((f) => f.id === fieldId);
      if (!target) return;

      // Touching a draft moves it to in_progress.
      const inst = prevInstances.find((i) => i.id === target.instanceId);
      const bumpInstance = inst && inst.status === "draft";

      setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
      if (bumpInstance) {
        setInstances((prev) =>
          prev.map((i) => (i.id === inst!.id ? { ...i, status: "in_progress" } : i))
        );
      }

      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const merged = { ...target, ...patch };
        const row = formInstanceFieldToRow(merged);
        const { error: upErr } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .update({
            value: row.value,
            checked: row.checked,
            note: row.note,
            photo_url: row.photo_url,
          })
          .eq("id", fieldId);
        if (upErr) throw upErr;
        if (bumpInstance) {
          const { error: insErr } = await sb
            .from(FORM_INSTANCES_TABLE)
            .update({ status: "in_progress" })
            .eq("id", inst!.id);
          if (insErr) throw insErr;
        }
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prevFields);
        setInstances(prevInstances);
        throw e;
      }
    },
    [backend]
  );

  const instancesForJob = useCallback(
    (jobId: string) =>
      instances.filter((i) => i.jobId === jobId).sort((a, b) => a.sortOrder - b.sortOrder),
    [instances]
  );

  const fieldsForInstance = useCallback(
    (instanceId: string) =>
      fields.filter((f) => f.instanceId === instanceId).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  const value = useMemo<FormInstancesContextValue>(
    () => ({
      instances,
      fields,
      loading,
      backend,
      error,
      refresh,
      instancesForJob,
      fieldsForInstance,
      attachTemplate,
      updateInstanceField,
    }),
    [
      instances,
      fields,
      loading,
      backend,
      error,
      refresh,
      instancesForJob,
      fieldsForInstance,
      attachTemplate,
      updateInstanceField,
    ]
  );

  return <FormInstancesContext.Provider value={value}>{children}</FormInstancesContext.Provider>;
}

export function useFormInstances(): FormInstancesContextValue {
  const ctx = useContext(FormInstancesContext);
  if (!ctx) {
    throw new Error("useFormInstances must be used inside <FormInstancesProvider>");
  }
  return ctx;
}
