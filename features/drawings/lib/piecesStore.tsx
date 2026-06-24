"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
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
  // Synchronous mirror of `pieces`. React 18 defers functional-update bodies,
  // so we cannot read post-`setPieces` state synchronously; the ref gives every
  // mutator a deterministic, race-safe view (rapid same-id updates compose).
  const piecesRef = useRef<JobPiece[]>([]);
  useEffect(() => { piecesRef.current = pieces; }, [pieces]);

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

  // Slice 2: live sync. Patch by id is idempotent, so our own optimistic
  // writes echo back harmlessly and other clients' changes merge in (LWW).
  useEffect(() => {
    if (backend !== "supabase") return;
    const sb = getSupabase();
    const channel = sb
      .channel("job_pieces_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: JOB_PIECES_TABLE },
        (payload) => {
          setPieces((cur) => {
            let next = cur;
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string })?.id;
              next = id ? cur.filter((x) => x.id !== id) : cur;
            } else {
              const piece = rowToPiece(payload.new as PieceRow);
              next = cur.some((x) => x.id === piece.id)
                ? cur.map((x) => (x.id === piece.id ? piece : x))
                : [...cur, piece];
            }
            piecesRef.current = next;
            return next;
          });
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [backend]);

  const createPiece = useCallback(async (p: JobPiece) => {
    piecesRef.current = [...piecesRef.current, p];
    setPieces(piecesRef.current);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).insert(pieceToRow(p));
      if (error) {
        piecesRef.current = piecesRef.current.filter((x) => x.id !== p.id);
        setPieces(piecesRef.current);
        throw error;
      }
    }
  }, [backend]);

  const updatePiece = useCallback(async (id: string, patch: Partial<JobPiece>) => {
    const prev = piecesRef.current.find((x) => x.id === id);
    if (!prev) return;
    const merged = { ...prev, ...patch };
    piecesRef.current = piecesRef.current.map((x) => (x.id === id ? merged : x));
    setPieces(piecesRef.current);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).update(pieceToRow(merged)).eq("id", id);
      if (error) {
        piecesRef.current = piecesRef.current.map((x) => (x.id === id ? prev : x));
        setPieces(piecesRef.current);
        throw error;
      }
    }
  }, [backend]);

  const deletePiece = useCallback(async (id: string) => {
    const removed = piecesRef.current.find((x) => x.id === id);
    piecesRef.current = piecesRef.current.filter((x) => x.id !== id);
    setPieces(piecesRef.current);
    if (backend === "supabase") {
      const { error } = await getSupabase().from(JOB_PIECES_TABLE).delete().eq("id", id);
      if (error) {
        if (removed) { piecesRef.current = [...piecesRef.current, removed]; setPieces(piecesRef.current); }
        throw error;
      }
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
