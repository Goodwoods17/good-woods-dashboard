"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { JOB_PIECES_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { JobPiece } from "@shared/lib/types";
import { rowToPiece, pieceToRow, type PieceRow } from "./piecesRowMap";
import { optimistic } from "@shared/lib/optimistic";

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

  // Per-instance channel suffix. supabase-js returns the *existing* channel for a
  // duplicate name, so a second <PiecesProvider> would call `.on()` on an
  // already-subscribed channel and throw, blanking the page. A unique suffix
  // keeps each subscriber independent. (Mirrors the job-status stores.)
  const channelKeyRef = useRef<string | null>(null);
  if (channelKeyRef.current === null) {
    channelKeyRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r${Math.random().toString(36).slice(2)}`;
  }

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
      .channel(`job_pieces_changes_${channelKeyRef.current}`)
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
    await optimistic({
      ref: piecesRef,
      setState: setPieces,
      apply: (cur) => [...cur, p],
      rollback: (cur) => cur.filter((x) => x.id !== p.id),
      persist: async () => {
        if (backend !== "supabase") return;
        const { error } = await getSupabase().from(JOB_PIECES_TABLE).insert(pieceToRow(p));
        if (error) throw error;
      },
    });
  }, [backend]);

  const updatePiece = useCallback(async (id: string, patch: Partial<JobPiece>) => {
    const prev = piecesRef.current.find((x) => x.id === id);
    if (!prev) return;
    const merged = { ...prev, ...patch };
    await optimistic({
      ref: piecesRef,
      setState: setPieces,
      apply: (cur) => cur.map((x) => (x.id === id ? merged : x)),
      rollback: (cur) => cur.map((x) => (x.id === id ? prev : x)),
      persist: async () => {
        if (backend !== "supabase") return;
        const { error } = await getSupabase().from(JOB_PIECES_TABLE).update(pieceToRow(merged)).eq("id", id);
        if (error) throw error;
      },
    });
  }, [backend]);

  const deletePiece = useCallback(async (id: string) => {
    const removed = piecesRef.current.find((x) => x.id === id);
    if (!removed) return;
    await optimistic({
      ref: piecesRef,
      setState: setPieces,
      apply: (cur) => cur.filter((x) => x.id !== id),
      rollback: (cur) => [...cur, removed],
      persist: async () => {
        if (backend !== "supabase") return;
        const { error } = await getSupabase().from(JOB_PIECES_TABLE).delete().eq("id", id);
        if (error) throw error;
      },
    });
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
