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
import { JOB_PIECE_PINS_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { JobPiecePin } from "@shared/lib/types";
import { rowToPin, pinToRow, type PinRow } from "./piecePinsRowMap";
import { optimistic } from "@shared/lib/optimistic";

// S8a (ADR 0023): the pins store + live subscription land BEFORE any UI reads
// the new table. Dual-read holds during the overlap — the embedded
// `job_pieces.pin_*` columns stay authoritative until S8b switches the overlay
// (`PiecePin`/`docPins`) onto this collection. This provider is intentionally
// not yet mounted in any route; it is wired in by S8b/S9.

const STORAGE_KEY = "gw_job_piece_pins_v1";
type Backend = "supabase" | "localStorage";

type PiecePinsContextValue = {
  pins: JobPiecePin[];
  backend: Backend;
  createPin: (pin: JobPiecePin) => Promise<void>;
  updatePin: (id: string, patch: Partial<JobPiecePin>) => Promise<void>;
  deletePin: (id: string) => Promise<void>;
};

const PiecePinsContext = createContext<PiecePinsContextValue | null>(null);

function localLoad(): JobPiecePin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JobPiecePin[]) : [];
  } catch {
    return [];
  }
}
function localSave(pins: JobPiecePin[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function PiecePinsProvider({ children }: { children: ReactNode }) {
  const backend: Backend = hasSupabase() ? "supabase" : "localStorage";
  const [pins, setPins] = useState<JobPiecePin[]>([]);
  const [loading, setLoading] = useState(true);
  // Synchronous mirror of `pins` — React 18 defers functional-update bodies, so
  // mutators read this ref for a deterministic, race-safe view (mirrors piecesStore).
  const pinsRef = useRef<JobPiecePin[]>([]);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  // Per-instance channel suffix: supabase-js returns the *existing* channel for a
  // duplicate name, so a second provider would `.on()` an already-subscribed
  // channel and throw. A unique suffix keeps each subscriber independent.
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
        if (!cancelled) {
          setPins(localLoad());
          setLoading(false);
        }
        return;
      }
      const { data, error } = await getSupabase().from(JOB_PIECE_PINS_TABLE).select("*");
      if (!cancelled) {
        if (!error && data) setPins((data as PinRow[]).map(rowToPin));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(pins);
  }, [pins, loading, backend]);

  // Live sync. Patch-by-id is idempotent: our own optimistic writes echo back
  // harmlessly and other clients' changes merge in (LWW).
  useEffect(() => {
    if (backend !== "supabase") return;
    const sb = getSupabase();
    const channel = sb
      .channel(`job_piece_pins_changes_${channelKeyRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: JOB_PIECE_PINS_TABLE },
        (payload) => {
          setPins((cur) => {
            let next = cur;
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string })?.id;
              next = id ? cur.filter((x) => x.id !== id) : cur;
            } else {
              const pin = rowToPin(payload.new as PinRow);
              next = cur.some((x) => x.id === pin.id)
                ? cur.map((x) => (x.id === pin.id ? pin : x))
                : [...cur, pin];
            }
            pinsRef.current = next;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [backend]);

  const createPin = useCallback(
    async (pin: JobPiecePin) => {
      await optimistic({
        ref: pinsRef,
        setState: setPins,
        apply: (cur) => [...cur, pin],
        rollback: (cur) => cur.filter((x) => x.id !== pin.id),
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase().from(JOB_PIECE_PINS_TABLE).insert(pinToRow(pin));
          if (error) throw error;
        },
      });
    },
    [backend]
  );

  const updatePin = useCallback(
    async (id: string, patch: Partial<JobPiecePin>) => {
      const prev = pinsRef.current.find((x) => x.id === id);
      if (!prev) return;
      const merged = { ...prev, ...patch };
      await optimistic({
        ref: pinsRef,
        setState: setPins,
        apply: (cur) => cur.map((x) => (x.id === id ? merged : x)),
        rollback: (cur) => cur.map((x) => (x.id === id ? prev : x)),
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase()
            .from(JOB_PIECE_PINS_TABLE)
            .update(pinToRow(merged))
            .eq("id", id);
          if (error) throw error;
        },
      });
    },
    [backend]
  );

  const deletePin = useCallback(
    async (id: string) => {
      const removed = pinsRef.current.find((x) => x.id === id);
      if (!removed) return;
      await optimistic({
        ref: pinsRef,
        setState: setPins,
        apply: (cur) => cur.filter((x) => x.id !== id),
        rollback: (cur) => [...cur, removed],
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase().from(JOB_PIECE_PINS_TABLE).delete().eq("id", id);
          if (error) throw error;
        },
      });
    },
    [backend]
  );

  const value = useMemo<PiecePinsContextValue>(
    () => ({ pins, backend, createPin, updatePin, deletePin }),
    [pins, backend, createPin, updatePin, deletePin]
  );
  return <PiecePinsContext.Provider value={value}>{children}</PiecePinsContext.Provider>;
}

export function usePiecePins(): PiecePinsContextValue {
  const ctx = useContext(PiecePinsContext);
  if (!ctx) throw new Error("usePiecePins must be used inside <PiecePinsProvider>");
  return ctx;
}

/** Pins for one piece, primary first then by creation time. */
export function usePinsForPiece(jobPieceId: string): JobPiecePin[] {
  const { pins } = usePiecePins();
  return useMemo(
    () =>
      pins
        .filter((p) => p.jobPieceId === jobPieceId)
        .sort(
          (a, b) =>
            Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.localeCompare(b.createdAt)
        ),
    [pins, jobPieceId]
  );
}

/** Reverse lookup: pins that reference one document (cross-link panel, S9). */
export function usePinsForDocument(documentId: string): JobPiecePin[] {
  const { pins } = usePiecePins();
  return useMemo(() => pins.filter((p) => p.documentId === documentId), [pins, documentId]);
}
