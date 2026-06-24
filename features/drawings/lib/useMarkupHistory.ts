"use client";

import { useCallback, useRef, useState } from "react";
import type { Annotation } from "@shared/lib/types";

type Entry = { kind: "add" | "delete"; annotation: Annotation };

/**
 * Session-scoped undo/redo over markup actions. `recordAdd` after a stroke
 * commits; `recordDelete` after an erase. undo/redo invert by calling the
 * supplied store ops. History clears on reload (in-memory only).
 */
export function useMarkupHistory(ops: {
  onAdd: (a: Annotation) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  const [, force] = useState(0);
  const sync = () => force((n) => n + 1);

  const recordAdd = useCallback((a: Annotation) => {
    undoStack.current.push({ kind: "add", annotation: a }); redoStack.current = []; sync();
  }, []);
  const recordDelete = useCallback((a: Annotation) => {
    undoStack.current.push({ kind: "delete", annotation: a }); redoStack.current = []; sync();
  }, []);

  const undo = useCallback(async () => {
    const e = undoStack.current.pop(); if (!e) return;
    if (e.kind === "add") await ops.onRemove(e.annotation.id);
    else await ops.onAdd(e.annotation);
    redoStack.current.push(e); sync();
  }, [ops]);

  const redo = useCallback(async () => {
    const e = redoStack.current.pop(); if (!e) return;
    if (e.kind === "add") await ops.onAdd(e.annotation);
    else await ops.onRemove(e.annotation.id);
    undoStack.current.push(e); sync();
  }, [ops]);

  return {
    recordAdd, recordDelete, undo, redo,
    canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0,
  };
}
