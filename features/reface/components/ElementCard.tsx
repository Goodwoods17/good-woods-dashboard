"use client";

import { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { useReface } from "../lib/refaceStore";
import { parseDimensionString, formatFraction } from "../lib/dimensions";
import { elementSqft } from "../lib/sqft";
import {
  ELEMENT_KIND_LABELS,
  ELEMENT_KINDS,
  type ElementKind,
  type RefaceElement,
} from "../lib/types";
import { Field } from "@shared/components/forms/FormField";
import { Pill } from "@shared/components/ui/Pill";
import { cn } from "@shared/lib/utils";

const inputCls =
  "w-full text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast";

/** Edit a selected pin: kind, location, real W x H, qty, add-ons, notes. */
export function ElementCard({ element, onClose }: { element: RefaceElement; onClose: () => void }) {
  const { updateElement, deleteElement } = useReface();
  const [w, setW] = useState(formatFraction(element.widthIn));
  const [h, setH] = useState(formatFraction(element.heightIn));

  // Re-sync local dim text when a different pin is selected.
  useEffect(() => {
    setW(formatFraction(element.widthIn));
    setH(formatFraction(element.heightIn));
  }, [element.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitDim(which: "widthIn" | "heightIn", raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      updateElement(element.id, { [which]: null });
      return;
    }
    const parsed = parseDimensionString(trimmed);
    if (parsed) updateElement(element.id, { [which]: parsed.decimal });
  }

  const liveW = parseDimensionString(w.trim())?.decimal ?? element.widthIn;
  const liveH = parseDimensionString(h.trim())?.decimal ?? element.heightIn;
  const sqft = elementSqft({ widthIn: liveW, heightIn: liveH, qty: element.qty });

  return (
    <div className="rounded-xl border border-border bg-surface shadow-resting p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-serif text-title text-text-primary">{element.label}</span>
          {element.aiGuess && (
            <Pill
              tone={{
                bg: "bg-status-at-risk-soft",
                text: "text-status-at-risk",
                dot: "bg-status-at-risk",
              }}
              label="Unconfirmed"
            />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Field label="Type">
        <select
          value={element.kind}
          onChange={(e) => updateElement(element.id, { kind: e.target.value as ElementKind })}
          className={inputCls}
        >
          {ELEMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {ELEMENT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Location">
        <input
          className={inputCls}
          value={element.location}
          onChange={(e) => updateElement(element.id, { location: e.target.value })}
          placeholder="e.g. sink base"
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label='Width "'>
          <input
            className={inputCls}
            value={w}
            onChange={(e) => setW(e.target.value)}
            onBlur={() => commitDim("widthIn", w)}
            placeholder="23 3/4"
            inputMode="decimal"
          />
        </Field>
        <Field label='Height "'>
          <input
            className={inputCls}
            value={h}
            onChange={(e) => setH(e.target.value)}
            onBlur={() => commitDim("heightIn", h)}
            placeholder="30 1/2"
            inputMode="decimal"
          />
        </Field>
        <Field label="Qty">
          <input
            className={inputCls}
            type="number"
            min={1}
            value={element.qty}
            onChange={(e) =>
              updateElement(element.id, { qty: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </Field>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-text-tertiary">Square feet</span>
        <span className="font-mono text-text-primary">{sqft > 0 ? sqft.toFixed(2) : "—"}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Mullion sections">
          <input
            className={inputCls}
            type="number"
            min={0}
            value={element.mullionSections}
            onChange={(e) =>
              updateElement(element.id, {
                mullionSections: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </Field>
        <Field label="Dividers">
          <input
            className={inputCls}
            type="number"
            min={0}
            value={element.dividers}
            onChange={(e) =>
              updateElement(element.id, { dividers: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className={cn(inputCls, "resize-none")}
          rows={2}
          value={element.notes}
          onChange={(e) => updateElement(element.id, { notes: e.target.value })}
        />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        {element.aiGuess && (
          <button
            onClick={() => updateElement(element.id, { aiGuess: false })}
            className="inline-flex items-center gap-1.5 rounded-full bg-status-on-track text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity duration-fast"
          >
            <Check className="h-4 w-4" strokeWidth={2} />
            Confirm
          </button>
        )}
        <button
          onClick={() => {
            deleteElement(element.id);
            onClose();
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-status-blocked-soft text-status-blocked px-3 py-1.5 text-sm font-medium hover:bg-status-blocked hover:text-white transition-colors duration-fast ml-auto"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          Delete
        </button>
      </div>
    </div>
  );
}
