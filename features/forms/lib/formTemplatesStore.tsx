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

  const value = useMemo<FormTemplatesContextValue>(
    () => ({ templates, fields, loading, backend, error, refresh, fieldsForTemplate }),
    [templates, fields, loading, backend, error, refresh, fieldsForTemplate]
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
