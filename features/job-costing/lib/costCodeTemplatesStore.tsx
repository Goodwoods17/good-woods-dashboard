"use client";

// Cost-code task templates — the estimating bundles (job-costing P2b).
// A template is a named set of cost codes (labour operations carrying a `code`)
// with a budgeted-minutes + qty per code; loaded into an estimate later (P3) to
// seed a job's labour budget. DISTINCT from the estimator's section-templates.
// Tables (cost_code_templates, cost_code_template_items) ship in the P1 migration;
// this store + the /labour Templates tab are the first CRUD over them.
// See docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md §4.2.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { CostCodeTemplate, CostCodeTemplateItem } from "./types";

// ─── Row shapes ─────────────────────────────────────────────────────────

type TemplateRow = { id: string; name: string; active: boolean };
type ItemRow = {
  id: string;
  template_id: string;
  code_id: string | null;
  budgeted_minutes: number | string | null;
  qty: number | string | null;
  sort: number | null;
};

const numOrNull = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

const rowToTemplate = (r: TemplateRow): CostCodeTemplate => ({
  id: r.id,
  name: r.name,
  active: r.active,
});
const rowToItem = (r: ItemRow): CostCodeTemplateItem => ({
  id: r.id,
  templateId: r.template_id,
  codeId: r.code_id,
  budgetedMinutes: numOrNull(r.budgeted_minutes),
  qty: r.qty === null || r.qty === "" ? 1 : Number(r.qty),
  sort: r.sort ?? 0,
});

const newUuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

const LS_KEY = "gw_cost_code_templates_v1";

// ─── Context ────────────────────────────────────────────────────────────

type CostCodeTemplatesContextValue = {
  templates: CostCodeTemplate[];
  items: CostCodeTemplateItem[];
  loading: boolean;
  error: string | null;
  addTemplate: (name: string) => string; // returns new id
  updateTemplate: (id: string, patch: Partial<Pick<CostCodeTemplate, "name" | "active">>) => void;
  removeTemplate: (id: string) => void; // soft delete (active=false)
  addItem: (input: {
    templateId: string;
    codeId: string | null;
    budgetedMinutes: number | null;
    qty: number;
  }) => void;
  updateItem: (
    id: string,
    patch: Partial<Pick<CostCodeTemplateItem, "codeId" | "budgetedMinutes" | "qty" | "sort">>
  ) => void;
  removeItem: (id: string) => void; // hard delete (items are cheap)
  itemsByTemplate: Map<string, CostCodeTemplateItem[]>;
};

const CostCodeTemplatesContext = createContext<CostCodeTemplatesContextValue | null>(null);

export function CostCodeTemplatesProvider({ children }: { children: ReactNode }) {
  const backend = hasSupabase() ? "supabase" : "localStorage";
  const [templates, setTemplates] = useState<CostCodeTemplate[]>([]);
  const [items, setItems] = useState<CostCodeTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // localStorage persistence (only when Supabase isn't configured).
  useEffect(() => {
    if (backend !== "localStorage" || loading) return;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({ templates, items }));
    } catch {
      /* silent */
    }
  }, [backend, loading, templates, items]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend !== "supabase") {
        try {
          const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
          if (raw && !cancelled) {
            const p = JSON.parse(raw);
            setTemplates(p.templates ?? []);
            setItems(p.items ?? []);
          }
        } catch {
          /* keep empty */
        }
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const sb = getSupabase();
        const [tpls, its] = await Promise.all([
          sb.from("cost_code_templates").select("*").order("name"),
          sb.from("cost_code_template_items").select("*").order("sort"),
        ]);
        if (tpls.error) throw tpls.error;
        if (its.error) throw its.error;
        if (!cancelled) {
          setTemplates((tpls.data as TemplateRow[]).map(rowToTemplate));
          setItems((its.data as ItemRow[]).map(rowToItem));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const sb = useCallback(() => getSupabase(), []);
  const isSb = backend === "supabase";

  const addTemplate = useCallback(
    (name: string): string => {
      const created: CostCodeTemplate = { id: newUuid(), name, active: true };
      setTemplates((prev) => [...prev, created]);
      if (isSb) {
        void sb()
          .from("cost_code_templates")
          .insert({ id: created.id, name })
          .then(({ error: e }) => e && setError(formatError(e)));
      }
      return created.id;
    },
    [isSb, sb]
  );

  const updateTemplate = useCallback(
    (id: string, patch: Partial<Pick<CostCodeTemplate, "name" | "active">>) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (isSb) {
        void sb()
          .from("cost_code_templates")
          .update(patch)
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const removeTemplate = useCallback(
    (id: string) => updateTemplate(id, { active: false }),
    [updateTemplate]
  );

  const addItem = useCallback(
    (input: {
      templateId: string;
      codeId: string | null;
      budgetedMinutes: number | null;
      qty: number;
    }) => {
      const sort =
        items
          .filter((i) => i.templateId === input.templateId)
          .reduce((m, i) => Math.max(m, i.sort), 0) + 10;
      const created: CostCodeTemplateItem = {
        id: newUuid(),
        templateId: input.templateId,
        codeId: input.codeId,
        budgetedMinutes: input.budgetedMinutes,
        qty: input.qty,
        sort,
      };
      setItems((prev) => [...prev, created]);
      if (isSb) {
        void sb()
          .from("cost_code_template_items")
          .insert({
            id: created.id,
            template_id: created.templateId,
            code_id: created.codeId,
            budgeted_minutes: created.budgetedMinutes,
            qty: created.qty,
            sort: created.sort,
          })
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [items, isSb, sb]
  );

  const updateItem = useCallback(
    (
      id: string,
      patch: Partial<Pick<CostCodeTemplateItem, "codeId" | "budgetedMinutes" | "qty" | "sort">>
    ) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      if (isSb) {
        const row: Record<string, unknown> = {};
        if (patch.codeId !== undefined) row.code_id = patch.codeId;
        if (patch.budgetedMinutes !== undefined) row.budgeted_minutes = patch.budgetedMinutes;
        if (patch.qty !== undefined) row.qty = patch.qty;
        if (patch.sort !== undefined) row.sort = patch.sort;
        void sb()
          .from("cost_code_template_items")
          .update(row)
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (isSb) {
        void sb()
          .from("cost_code_template_items")
          .delete()
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [isSb, sb]
  );

  const itemsByTemplate = useMemo(() => {
    const m = new Map<string, CostCodeTemplateItem[]>();
    for (const i of [...items].sort((a, b) => a.sort - b.sort)) {
      const arr = m.get(i.templateId) ?? [];
      arr.push(i);
      m.set(i.templateId, arr);
    }
    return m;
  }, [items]);

  const value = useMemo<CostCodeTemplatesContextValue>(
    () => ({
      templates,
      items,
      loading,
      error,
      addTemplate,
      updateTemplate,
      removeTemplate,
      addItem,
      updateItem,
      removeItem,
      itemsByTemplate,
    }),
    [
      templates,
      items,
      loading,
      error,
      addTemplate,
      updateTemplate,
      removeTemplate,
      addItem,
      updateItem,
      removeItem,
      itemsByTemplate,
    ]
  );

  return (
    <CostCodeTemplatesContext.Provider value={value}>{children}</CostCodeTemplatesContext.Provider>
  );
}

export function useCostCodeTemplates(): CostCodeTemplatesContextValue {
  const ctx = useContext(CostCodeTemplatesContext);
  if (!ctx) throw new Error("useCostCodeTemplates must be used inside <CostCodeTemplatesProvider>");
  return ctx;
}
