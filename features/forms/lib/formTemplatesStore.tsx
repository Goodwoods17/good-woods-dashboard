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
import type { FormTemplate, FormTemplateField } from "@shared/lib/types";
import {
  FORM_TEMPLATES_TABLE,
  FORM_TEMPLATE_FIELDS_TABLE,
  getSupabase,
  hasSupabase,
} from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import {
  rowToFormTemplate,
  rowToFormTemplateField,
  formTemplateToRow,
  formTemplateFieldToRow,
  type FormTemplateFieldRow,
  type FormTemplateRow,
} from "./formTemplatesRowMap";

const TEMPLATES_KEY = "gw_form_templates_v1";
const FIELDS_KEY = "gw_form_template_fields_v1";
const SCHEMA_VERSION = 1;

type PersistedTemplates = { schema: number; templates: FormTemplate[] };
type PersistedFields = { schema: number; fields: FormTemplateField[] };

export type FormsBackend = "supabase" | "localStorage";

type FormTemplatesContextValue = {
  templates: FormTemplate[];
  fields: FormTemplateField[];
  loading: boolean;
  backend: FormsBackend;
  error: string | null;
  refresh: () => Promise<void>;
  fieldsForTemplate: (templateId: string) => FormTemplateField[];
  /** Create a new form template. */
  createTemplate: (template: FormTemplate, fields: FormTemplateField[]) => Promise<void>;
  /** Update a template's metadata (name, description, phase, isDefault, active, sortOrder). */
  updateTemplate: (id: string, patch: Partial<FormTemplate>) => Promise<void>;
  /** Delete a template and all its fields. Does NOT delete existing instances (snapshot invariant). */
  deleteTemplate: (id: string) => Promise<void>;
  /** Reorder a template's fields (drag-drop). Accepts the full ordered list. */
  reorderTemplateFields: (templateId: string, ordered: FormTemplateField[]) => Promise<void>;
  /** Add a field to a template. */
  addTemplateField: (field: FormTemplateField) => Promise<void>;
  /** Update a template field (label, config, type). */
  updateTemplateField: (id: string, patch: Partial<FormTemplateField>) => Promise<void>;
  /** Delete a template field. */
  deleteTemplateField: (id: string) => Promise<void>;
};

const FormTemplatesContext = createContext<FormTemplatesContextValue | null>(null);

function localLoad<T>(key: string, pick: (parsed: unknown) => T[] | null): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return pick(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

function localLoadTemplates(): FormTemplate[] {
  return localLoad<FormTemplate>(TEMPLATES_KEY, (p) => {
    const parsed = p as PersistedTemplates;
    return parsed?.schema === SCHEMA_VERSION && Array.isArray(parsed.templates)
      ? parsed.templates
      : null;
  });
}

function localLoadFields(): FormTemplateField[] {
  return localLoad<FormTemplateField>(FIELDS_KEY, (p) => {
    const parsed = p as PersistedFields;
    return parsed?.schema === SCHEMA_VERSION && Array.isArray(parsed.fields) ? parsed.fields : null;
  });
}

function localSaveTemplates(templates: FormTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TEMPLATES_KEY,
      JSON.stringify({ schema: SCHEMA_VERSION, templates })
    );
  } catch {
    /* quota / denied */
  }
}

function localSaveFields(fields: FormTemplateField[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIELDS_KEY, JSON.stringify({ schema: SCHEMA_VERSION, fields }));
  } catch {
    /* quota / denied */
  }
}

async function supabaseLoad(): Promise<{
  templates: FormTemplate[];
  fields: FormTemplateField[];
}> {
  const sb = getSupabase();
  const [tplRes, fldRes] = await Promise.all([
    sb.from(FORM_TEMPLATES_TABLE).select("*").order("sort_order", { ascending: true }),
    sb.from(FORM_TEMPLATE_FIELDS_TABLE).select("*").order("sort_order", { ascending: true }),
  ]);
  if (tplRes.error) throw tplRes.error;
  if (fldRes.error) throw fldRes.error;
  return {
    templates: (tplRes.data as FormTemplateRow[] | null)?.map(rowToFormTemplate) ?? [],
    fields: (fldRes.data as FormTemplateFieldRow[] | null)?.map(rowToFormTemplateField) ?? [],
  };
}

export function FormTemplatesProvider({ children }: { children: ReactNode }) {
  const backend: FormsBackend = hasSupabase() ? "supabase" : "localStorage";
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [fields, setFields] = useState<FormTemplateField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) {
            setTemplates(remote.templates);
            setFields(remote.fields);
          }
        } else if (!cancelled) {
          setTemplates(localLoadTemplates());
          setFields(localLoadFields());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setTemplates(localLoadTemplates());
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

  // Persist to localStorage in fallback mode.
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveTemplates(templates);
  }, [templates, loading, backend]);
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveFields(fields);
  }, [fields, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      const remote = await supabaseLoad();
      setTemplates(remote.templates);
      setFields(remote.fields);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const fieldsForTemplate = useCallback(
    (templateId: string) =>
      fields.filter((f) => f.templateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  // ─── CRUD ────────────────────────────────────────────────────────────────

  const createTemplate = useCallback(
    async (template: FormTemplate, tplFields: FormTemplateField[]) => {
      setTemplates((prev) => [...prev, template]);
      setFields((prev) => [...prev, ...tplFields]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: tErr } = await sb
          .from(FORM_TEMPLATES_TABLE)
          .insert(formTemplateToRow(template));
        if (tErr) throw tErr;
        if (tplFields.length) {
          const { error: fErr } = await sb
            .from(FORM_TEMPLATE_FIELDS_TABLE)
            .insert(tplFields.map(formTemplateFieldToRow));
          if (fErr) throw fErr;
        }
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
        setFields((prev) => prev.filter((f) => f.templateId !== template.id));
        throw e;
      }
    },
    [backend]
  );

  const updateTemplate = useCallback(
    async (id: string, patch: Partial<FormTemplate>) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const updated = templates.find((t) => t.id === id);
        if (!updated) return;
        const row = formTemplateToRow({ ...updated, ...patch });
        const { error: err } = await sb
          .from(FORM_TEMPLATES_TABLE)
          .update({
            name: row.name,
            description: row.description,
            phase: row.phase,
            is_default: row.is_default,
            active: row.active,
            sort_order: row.sort_order,
          })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        throw e;
      }
    },
    [backend, templates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const prevTemplates = templates;
      const prevFields = fields;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setFields((prev) => prev.filter((f) => f.templateId !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        // Delete fields first (FK constraint).
        const { error: fErr } = await sb
          .from(FORM_TEMPLATE_FIELDS_TABLE)
          .delete()
          .eq("template_id", id);
        if (fErr) throw fErr;
        const { error: tErr } = await sb.from(FORM_TEMPLATES_TABLE).delete().eq("id", id);
        if (tErr) throw tErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setTemplates(prevTemplates);
        setFields(prevFields);
        throw e;
      }
    },
    [backend, templates, fields]
  );

  const reorderTemplateFields = useCallback(
    async (templateId: string, ordered: FormTemplateField[]) => {
      // Reassign sort_order indices in the given order.
      const reindexed = ordered.map((f, idx) => ({ ...f, sortOrder: idx }));
      setFields((prev) => {
        const untouched = prev.filter((f) => f.templateId !== templateId);
        return [...untouched, ...reindexed];
      });
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        await Promise.all(
          reindexed.map((f) =>
            sb.from(FORM_TEMPLATE_FIELDS_TABLE).update({ sort_order: f.sortOrder }).eq("id", f.id)
          )
        );
        setError(null);
      } catch (e) {
        setError(formatError(e));
        throw e;
      }
    },
    [backend]
  );

  const addTemplateField = useCallback(
    async (field: FormTemplateField) => {
      setFields((prev) => [...prev, field]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_TEMPLATE_FIELDS_TABLE)
          .insert(formTemplateFieldToRow(field));
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

  const updateTemplateField = useCallback(
    async (id: string, patch: Partial<FormTemplateField>) => {
      setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const target = fields.find((f) => f.id === id);
        if (!target) return;
        const merged = formTemplateFieldToRow({ ...target, ...patch });
        const { error: err } = await sb
          .from(FORM_TEMPLATE_FIELDS_TABLE)
          .update({ label: merged.label, type: merged.type, config: merged.config })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        throw e;
      }
    },
    [backend, fields]
  );

  const deleteTemplateField = useCallback(
    async (id: string) => {
      const prev = fields;
      setFields((f) => f.filter((x) => x.id !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb.from(FORM_TEMPLATE_FIELDS_TABLE).delete().eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prev);
        throw e;
      }
    },
    [backend, fields]
  );

  const value = useMemo<FormTemplatesContextValue>(
    () => ({
      templates,
      fields,
      loading,
      backend,
      error,
      refresh,
      fieldsForTemplate,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      reorderTemplateFields,
      addTemplateField,
      updateTemplateField,
      deleteTemplateField,
    }),
    [
      templates,
      fields,
      loading,
      backend,
      error,
      refresh,
      fieldsForTemplate,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      reorderTemplateFields,
      addTemplateField,
      updateTemplateField,
      deleteTemplateField,
    ]
  );

  return <FormTemplatesContext.Provider value={value}>{children}</FormTemplatesContext.Provider>;
}

export function useFormTemplates(): FormTemplatesContextValue {
  const ctx = useContext(FormTemplatesContext);
  if (!ctx) {
    throw new Error("useFormTemplates must be used inside <FormTemplatesProvider>");
  }
  return ctx;
}
