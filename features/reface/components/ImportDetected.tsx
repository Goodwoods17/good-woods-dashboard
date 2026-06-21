"use client";

import { useMemo, useState } from "react";
import { Modal } from "@shared/components/ui/Modal";
import { useReface } from "../lib/refaceStore";
import { detectedToElements, makeLabeler, parseDetectedJson } from "../lib/importElements";
import { ELEMENT_KIND_LABELS, type RefacePhoto, type RefaceProject } from "../lib/types";

const textareaCls =
  "w-full text-xs font-mono bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-y";

/**
 * Fallback ingestion path for Claude-Code-detected elements: paste the
 * DetectedElement[] JSON, preview the parse, and drop the pins onto this photo.
 * (The primary path is a direct Supabase MCP insert + Refresh — see CLAUDE.md.)
 */
export function ImportDetected({
  project,
  photo,
  onClose,
}: {
  project: RefaceProject;
  photo: RefacePhoto;
  onClose: () => void;
}) {
  const { addElements } = useReface();
  const [text, setText] = useState("");

  const result = useMemo(() => (text.trim() ? parseDetectedJson(text) : null), [text]);

  function handleImport() {
    if (!result || result.detected.length === 0) return;
    const labeler = makeLabeler(project);
    const elements = detectedToElements(project, photo.id, result.detected, labeler);
    addElements(elements);
    onClose();
  }

  return (
    <Modal title="Import detected elements" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          Paste the <code className="font-mono text-xs">DetectedElement[]</code> JSON from Claude
          Code. Each pin lands on this photo as an unconfirmed guess.
        </p>
        <textarea
          className={textareaCls}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            '[\n  { "kind": "door", "box": {"x":0.1,"y":0.2,"w":0.15,"h":0.4}, "estWidthIn": 15, "estHeightIn": 30, "location": "sink base" }\n]'
          }
        />

        {result && (
          <div className="text-sm space-y-1">
            {result.detected.length > 0 && (
              <p className="text-status-on-track">
                {result.detected.length} element{result.detected.length === 1 ? "" : "s"} ready
                {(() => {
                  const counts = result.detected.reduce<Record<string, number>>((acc, d) => {
                    acc[d.kind] = (acc[d.kind] ?? 0) + 1;
                    return acc;
                  }, {});
                  const parts = Object.entries(counts).map(
                    ([k, n]) =>
                      `${n} ${ELEMENT_KIND_LABELS[k as keyof typeof ELEMENT_KIND_LABELS].toLowerCase()}`
                  );
                  return parts.length ? ` — ${parts.join(", ")}` : "";
                })()}
              </p>
            )}
            {result.errors.map((err, i) => (
              <p key={i} className="text-status-blocked text-caption">
                {err}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!result || result.detected.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast disabled:opacity-40"
          >
            Add {result?.detected.length ?? 0} pins
          </button>
        </div>
      </div>
    </Modal>
  );
}
