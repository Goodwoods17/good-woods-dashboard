"use client";

import { useCallback, useRef, useState } from "react";
import type { Annotation } from "@shared/lib/types";

type Entry =
  | { kind: "add"; annotation: Annotation }
  | { kind: "delete"; annotation: Annotation }
  | { kind: "update"; before: Annotation; after: Annotation };

/**
 * Session-scoped undo/redo over markup actions. `recordAdd` after a stroke
 * commits; `recordDelete` after an erase; `recordUpdate` after a move/resize/
 * text-edit. undo/redo invert by calling the supplied store ops. History
 * clears on reload (in-memory only).
 */
export function useMarkupHistory(ops: {
  onAdd: (a: Annotation) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onUpdate: (a: Annotation) => void | Promise<void>;
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
  const recordUpdate = useCallback((before: Annotation, after: Annotation) => {
    undoStack.current.push({ kind: "update", before, after }); redoStack.current = []; sync();
  }, []);

  const undo = useCallback(async () => {
    const e = undoStack.current.pop(); if (!e) return;
    if (e.kind === "add") await ops.onRemove(e.annotation.id);
    else if (e.kind === "delete") await ops.onAdd(e.annotation);
    else await ops.onUpdate(e.before);
    redoStack.current.push(e); sync();
  }, [ops]);

  const redo = useCallback(async () => {
    const e = redoStack.current.pop(); if (!e) return;
    if (e.kind === "add") await ops.onAdd(e.annotation);
    else if (e.kind === "delete") await ops.onRemove(e.annotation.id);
    else await ops.onUpdate(e.after);
    undoStack.current.push(e); sync();
  }, [ops]);

  return {
    recordAdd, recordDelete, recordUpdate, undo, redo,
    canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0,
  };
}
