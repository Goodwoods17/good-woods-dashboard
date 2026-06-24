"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { DOCUMENT_ANNOTATIONS_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { Annotation } from "@shared/lib/types";
import { rowToAnnotation, annotationToRow, type AnnotationRow } from "./annotationsRowMap";

const STORAGE_KEY = "gw_document_annotations_v1";
type Backend = "supabase" | "localStorage";

type AnnotationsContextValue = {
  annotations: Annotation[];
  backend: Backend;
  createAnnotation: (a: Annotation) => Promise<void>;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  /** Re-insert a full annotation (incl. id) — used by undo to restore an erased stroke. */
  restoreAnnotation: (a: Annotation) => Promise<void>;
};

const AnnotationsContext = createContext<AnnotationsContextValue | null>(null);

function localLoad(): Annotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Annotation[]) : [];
  } catch {
    return [];
  }
}
function localSave(annotations: Annotation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
}

export function AnnotationsProvider({ children }: { children: ReactNode }) {
  const backend: Backend = hasSupabase() ? "supabase" : "localStorage";
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  // Synchronous mirror — see piecesStore for the React-18 deferred-update rationale.
  const annotationsRef = useRef<Annotation[]>([]);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  // Slice 3: load-on-open (NOT realtime). One fetch on mount, then optimistic mutations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend === "localStorage") {
        if (!cancelled) { setAnnotations(localLoad()); setLoading(false); }
        return;
      }
      const { data, error } = await getSupabase().from(DOCUMENT_ANNOTATIONS_TABLE).select("*");
      if (!cancelled) {
        if (!error && data) setAnnotations((data as AnnotationRow[]).map(rowToAnnotation));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(annotations);
  }, [annotations, loading, backend]);

  const insert = useCallback(async (a: Annotation) => {
    annotationsRef.current = [...annotationsRef.current, a];
    setAnnotations(annotationsRef.current);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(DOCUMENT_ANNOTATIONS_TABLE).insert(annotationToRow(a));
      if (error) {
        annotationsRef.current = annotationsRef.current.filter((x) => x.id !== a.id);
        setAnnotations(annotationsRef.current);
        throw error;
      }
    }
  }, [backend]);

  const createAnnotation = useCallback((a: Annotation) => insert(a), [insert]);
  const restoreAnnotation = useCallback((a: Annotation) => insert(a), [insert]);

  const updateAnnotation = useCallback(async (id: string, patch: Partial<Annotation>) => {
    const prev = annotationsRef.current.find((x) => x.id === id);
    if (!prev) return;
    const merged = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    annotationsRef.current = annotationsRef.current.map((x) => (x.id === id ? merged : x));
    setAnnotations(annotationsRef.current);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(DOCUMENT_ANNOTATIONS_TABLE).update(annotationToRow(merged)).eq("id", id);
      if (error) {
        annotationsRef.current = annotationsRef.current.map((x) => (x.id === id ? prev : x));
        setAnnotations(annotationsRef.current);
        throw error;
      }
    }
  }, [backend]);

  const deleteAnnotation = useCallback(async (id: string) => {
    const removed = annotationsRef.current.find((x) => x.id === id);
    annotationsRef.current = annotationsRef.current.filter((x) => x.id !== id);
    setAnnotations(annotationsRef.current);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(DOCUMENT_ANNOTATIONS_TABLE).delete().eq("id", id);
      if (error) {
        if (removed) { annotationsRef.current = [...annotationsRef.current, removed]; setAnnotations(annotationsRef.current); }
        throw error;
      }
    }
  }, [backend]);

  const value = useMemo<AnnotationsContextValue>(
    () => ({ annotations, backend, createAnnotation, updateAnnotation, deleteAnnotation, restoreAnnotation }),
    [annotations, backend, createAnnotation, updateAnnotation, deleteAnnotation, restoreAnnotation]
  );
  return <AnnotationsContext.Provider value={value}>{children}</AnnotationsContext.Provider>;
}

export function useAnnotations(): AnnotationsContextValue {
  const ctx = useContext(AnnotationsContext);
  if (!ctx) throw new Error("useAnnotations must be used inside <AnnotationsProvider>");
  return ctx;
}

export function useDocAnnotations(documentId: string | null, page: number): Annotation[] {
  const { annotations } = useAnnotations();
  return useMemo(
    () => (documentId ? annotations.filter((a) => a.documentId === documentId && a.page === page) : []),
    [annotations, documentId, page]
  );
}
