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
import type { ProjectDocument } from "@shared/lib/types";
import { DOCUMENTS_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import {
  documentToRow,
  rowToDocument,
  type DocumentRow,
} from "./documentsRowMap";

const STORAGE_KEY = "gw_documents_v1";
const SCHEMA_VERSION = 1;

type Persisted = { schema: number; documents: ProjectDocument[] };

export type DocumentsBackend = "supabase" | "localStorage";

type DocumentsContextValue = {
  documents: ProjectDocument[];
  loading: boolean;
  backend: DocumentsBackend;
  error: string | null;
  refresh: () => Promise<void>;
  createDocument: (doc: ProjectDocument) => Promise<void>;
  updateDocument: (id: string, patch: Partial<ProjectDocument>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  /**
   * S7 — marks `newDocId` as the successor revision of `supersededId`.
   * Sets `supersedes_id` on the new doc and flips `is_current=false` on the
   * old doc. Optimistic — rolls back both on error.
   */
  supersedeDocument: (newDocId: string, supersededId: string) => Promise<void>;
};

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

function localLoad(): ProjectDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.documents)) {
      return [];
    }
    return parsed.documents;
  } catch {
    return [];
  }
}

function localSave(documents: ProjectDocument[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, documents };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / denied — silent */
  }
}

async function supabaseLoad(): Promise<ProjectDocument[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(DOCUMENTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DocumentRow[] | null)?.map(rowToDocument) ?? [];
}

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const backend: DocumentsBackend = hasSupabase() ? "supabase" : "localStorage";
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const docsRef = useRef<ProjectDocument[]>([]);

  useEffect(() => {
    docsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setDocuments(remote);
        } else {
          if (!cancelled) setDocuments(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setDocuments(localLoad());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(documents);
  }, [documents, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      const remote = await supabaseLoad();
      setDocuments(remote);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const createDocument = useCallback(
    async (doc: ProjectDocument) => {
      setDocuments((prev) => [doc, ...prev]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(DOCUMENTS_TABLE)
          .insert(documentToRow(doc));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        throw e;
      }
    },
    [backend]
  );

  const updateDocument = useCallback(
    async (id: string, patch: Partial<ProjectDocument>) => {
      const previous = docsRef.current;
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      );
      if (backend !== "supabase") return;
      try {
        const merged = { ...previous.find((d) => d.id === id), ...patch } as ProjectDocument;
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(DOCUMENTS_TABLE)
          .update(documentToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setDocuments(previous);
        throw e;
      }
    },
    [backend]
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      const previous = docsRef.current;
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: delErr } = await sb
          .from(DOCUMENTS_TABLE)
          .delete()
          .eq("id", id);
        if (delErr) throw delErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setDocuments(previous);
        throw e;
      }
    },
    [backend]
  );

  const supersedeDocument = useCallback(
    async (newDocId: string, supersededId: string) => {
      const previous = docsRef.current;
      // Optimistic: wire the lineage link + flip current off the old doc.
      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id === newDocId) return { ...d, supersedesId: supersededId };
          if (d.id === supersededId) return { ...d, isCurrent: false };
          return d;
        })
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: e1 } = await sb
          .from(DOCUMENTS_TABLE)
          .update({ supersedes_id: supersededId })
          .eq("id", newDocId);
        if (e1) throw e1;

        const { error: e2 } = await sb
          .from(DOCUMENTS_TABLE)
          .update({ is_current: false })
          .eq("id", supersededId);
        if (e2) throw e2;

        setError(null);
      } catch (e) {
        setError(formatError(e));
        setDocuments(previous);
        throw e;
      }
    },
    [backend]
  );

  const value: DocumentsContextValue = {
    documents,
    loading,
    backend,
    error,
    refresh,
    createDocument,
    updateDocument,
    deleteDocument,
    supersedeDocument,
  };

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext);
  if (!ctx) {
    throw new Error("useDocuments must be used inside <DocumentsProvider>");
  }
  return ctx;
}

export function useProjectDocuments(projectId: string): ProjectDocument[] {
  const { documents } = useDocuments();
  return useMemo(
    () => documents.filter((d) => d.projectId === projectId),
    [documents, projectId]
  );
}
