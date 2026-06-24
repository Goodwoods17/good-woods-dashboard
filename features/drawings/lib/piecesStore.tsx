"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { JOB_PIECES_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { JobPiece } from "@shared/lib/types";
import { rowToPiece, pieceToRow, type PieceRow } from "./piecesRowMap";

const STORAGE_KEY = "gw_job_pieces_v1";
type Backend = "supabase" | "localStorage";

type PiecesContextValue = {
  pieces: JobPiece[];
  backend: Backend;
  createPiece: (p: JobPiece) => Promise<void>;
  updatePiece: (id: string, patch: Partial<JobPiece>) => Promise<void>;
  deletePiece: (id: string) => Promise<void>;
};

const PiecesContext = createContext<PiecesContextValue | null>(null);

function localLoad(): JobPiece[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JobPiece[]) : [];
  } catch {
    return [];
  }
}
function localSave(pieces: JobPiece[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pieces));
}

export function PiecesProvider({ children }: { children: ReactNode }) {
  const backend: Backend = hasSupabase() ? "supabase" : "localStorage";
  const [pieces, setPieces] = useState<JobPiece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend === "localStorage") {
        if (!cancelled) { setPieces(localLoad()); setLoading(false); }
        return;
      }
      const { data, error } = await getSupabase().from(JOB_PIECES_TABLE).select("*");
      if (!cancelled) {
        if (!error && data) setPieces((data as PieceRow[]).map(rowToPiece));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(pieces);
  }, [pieces, loading, backend]);

  const createPiece = useCallback(async (p: JobPiece) => {
    setPieces((prev) => [...prev, p]);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).insert(pieceToRow(p));
      if (error) { setPieces((prev) => prev.filter((x) => x.id !== p.id)); throw error; }
    }
  }, [backend]);

  const updatePiece = useCallback(async (id: string, patch: Partial<JobPiece>) => {
    let prevSnapshot: JobPiece | undefined;
    setPieces((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      prevSnapshot = x;
      return { ...x, ...patch };
    }));
    if (backend === "supabase") {
      const merged = prevSnapshot ? { ...prevSnapshot, ...patch } : undefined;
      if (merged) {
        const { error } = await getSupabase().from(JOB_PIECES_TABLE)
          .update(pieceToRow(merged)).eq("id", id);
        if (error) {
          if (prevSnapshot) setPieces((prev) => prev.map((x) => (x.id === id ? prevSnapshot! : x)));
          throw error;
        }
      }
    }
  }, [backend]);

  const deletePiece = useCallback(async (id: string) => {
    let removed: JobPiece | undefined;
    setPieces((prev) => { removed = prev.find((x) => x.id === id); return prev.filter((x) => x.id !== id); });
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).delete().eq("id", id);
      if (error) { if (removed) setPieces((prev) => [...prev, removed!]); throw error; }
    }
  }, [backend]);

  const value = useMemo<PiecesContextValue>(
    () => ({ pieces, backend, createPiece, updatePiece, deletePiece }),
    [pieces, backend, createPiece, updatePiece, deletePiece]
  );
  return <PiecesContext.Provider value={value}>{children}</PiecesContext.Provider>;
}

export function usePieces(): PiecesContextValue {
  const ctx = useContext(PiecesContext);
  if (!ctx) throw new Error("usePieces must be used inside <PiecesProvider>");
  return ctx;
}

export function useProjectPieces(projectId: string): JobPiece[] {
  const { pieces } = usePieces();
  return useMemo(
    () => pieces
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    [pieces, projectId]
  );
}
