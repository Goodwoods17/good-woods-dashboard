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
  /** Standalone instances (jobId = null). */
  standaloneInstances: FormInstance[];
  fieldsForInstance: (instanceId: string) => FormInstanceField[];
  /** Snapshot a template onto a job (or null = standalone). Returns the new instance. */
  attachTemplate: (
    template: FormTemplate,
    templateFields: FormTemplateField[],
    jobId: string | null
  ) => Promise<FormInstance>;
  /** Patch a single instance field's answer (checked/value/note/photoUrl). Bumps draft → in_progress. */
  updateInstanceField: (fieldId: string, patch: Partial<FormInstanceField>) => Promise<void>;
  /** Add an ad-hoc field to an existing instance (per-instance edit, does not touch the master). */
  addInstanceField: (field: FormInstanceField) => Promise<void>;
  /** Update an instance field's definition (label/type/config — not the answer). */
  editInstanceField: (id: string, patch: Partial<FormInstanceField>) => Promise<void>;
  /** Delete a field from an instance. */
  deleteInstanceField: (id: string) => Promise<void>;
  /** Update instance metadata (title, phase, status, sortOrder). */
  updateInstance: (id: string, patch: Partial<FormInstance>) => Promise<void>;
  /** Delete an instance and all its fields. */
  deleteInstance: (id: string) => Promise<void>;
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
    /* quota / denied — silent fail */
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
            // Signature fields stash their audit pair (signerName + signedAt) in
            // config at fill time, so the answer write must persist config too.
            config: row.config,
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

  // ─── Per-instance ad-hoc field edits ────────────────────────────────────

  const addInstanceField = useCallback(
    async (field: FormInstanceField) => {
      setFields((prev) => [...prev, field]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .insert(formInstanceFieldToRow(field));
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields((prev) => prev.filter((f) => f.id !== field.id));
        throw e;
      }
    },
    [backend]
  );

  const editInstanceField = useCallback(
    async (id: string, patch: Partial<FormInstanceField>) => {
      const prev = fieldsRef.current;
      setFields((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const target = prev.find((f) => f.id === id);
        if (!target) return;
        const merged = formInstanceFieldToRow({ ...target, ...patch });
        const { error: err } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .update({ label: merged.label, type: merged.type, config: merged.config })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prev);
        throw e;
      }
    },
    [backend]
  );

  const deleteInstanceField = useCallback(
    async (id: string) => {
      const prev = fieldsRef.current;
      setFields((f) => f.filter((x) => x.id !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb.from(FORM_INSTANCE_FIELDS_TABLE).delete().eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prev);
        throw e;
      }
    },
    [backend]
  );

  const updateInstance = useCallback(
    async (id: string, patch: Partial<FormInstance>) => {
      setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const target = instancesRef.current.find((i) => i.id === id);
        if (!target) return;
        const merged = formInstanceToRow({ ...target, ...patch });
        const { error: err } = await sb
          .from(FORM_INSTANCES_TABLE)
          .update({
            title: merged.title,
            phase: merged.phase,
            status: merged.status,
            sort_order: merged.sort_order,
          })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        throw e;
      }
    },
    [backend]
  );

  const deleteInstance = useCallback(
    async (id: string) => {
      const prevInstances = instancesRef.current;
      const prevFields = fieldsRef.current;
      setInstances((prev) => prev.filter((i) => i.id !== id));
      setFields((prev) => prev.filter((f) => f.instanceId !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: fErr } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .delete()
          .eq("instance_id", id);
        if (fErr) throw fErr;
        const { error: iErr } = await sb.from(FORM_INSTANCES_TABLE).delete().eq("id", id);
        if (iErr) throw iErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setInstances(prevInstances);
        setFields(prevFields);
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

  const standaloneInstances = useMemo(
    () => instances.filter((i) => i.jobId === null).sort((a, b) => a.sortOrder - b.sortOrder),
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
      standaloneInstances,
      fieldsForInstance,
      attachTemplate,
      updateInstanceField,
      addInstanceField,
      editInstanceField,
      deleteInstanceField,
      updateInstance,
      deleteInstance,
    }),
    [
      instances,
      fields,
      loading,
      backend,
      error,
      refresh,
      instancesForJob,
      standaloneInstances,
      fieldsForInstance,
      attachTemplate,
      updateInstanceField,
      addInstanceField,
      editInstanceField,
      deleteInstanceField,
      updateInstance,
      deleteInstance,
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
