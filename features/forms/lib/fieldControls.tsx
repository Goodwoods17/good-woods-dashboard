"use client";

import { useEffect, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { Camera, Eraser, Loader2 } from "lucide-react";
import { getStroke } from "perfect-freehand";
import type { FieldType, FormInstanceField } from "@shared/lib/types";
import { resolveFormPhotoUrl, uploadFormPhoto, uploadSignaturePng } from "./storage";

/**
 * Fill-time React controls, keyed by field type. Kept in a `.tsx` sibling of the
 * pure `fieldRegistry.ts` so the registry's logic (metadata, isComplete,
 * exhaustiveness) stays JSX-free and unit-testable under the node vitest env.
 * Only UI components import this file; tests never do.
 *
 * Slice 1 wires `section` + `checkbox`. Slice 2 adds short_text, long_text,
 * number, yes_no, dropdown, date. Unimplemented or unknown types have no entry
 * here; FormFillSurface renders a safe read-only fallback instead.
 */

export type FillControlProps = {
  field: FormInstanceField;
  /** Patch the instance field's answer (checked/value/note/photoUrl). */
  onChange: (patch: Partial<FormInstanceField>) => void;
  disabled?: boolean;
};

// ─── Shared input style ────────────────────────────────────────────────────
const inputCls =
  "w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 " +
  "placeholder:text-text-tertiary focus:outline-none focus:border-border-strong " +
  "focus:ring-2 focus:ring-accent-soft transition-colors duration-fast " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// ─── Section ───────────────────────────────────────────────────────────────
function SectionFill({ field }: FillControlProps) {
  return (
    <div className="pt-4 pb-1">
      <h3 className="font-serif text-lg text-text-primary">{field.label}</h3>
      <div className="mt-1 h-px bg-border" />
    </div>
  );
}

// ─── Checkbox ──────────────────────────────────────────────────────────────
function CheckboxFill({ field, onChange, disabled }: FillControlProps) {
  const checked = field.checked === true;
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1">
      <input
        type="checkbox"
        className="h-5 w-5 rounded border-border accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange({ checked: e.target.checked })}
      />
      <span className="text-sm text-text-primary">{field.label}</span>
    </label>
  );
}

// ─── Short text ────────────────────────────────────────────────────────────
function ShortTextFill({ field, onChange, disabled }: FillControlProps) {
  return (
    <div className="py-1">
      <label htmlFor={`fill-${field.id}`} className="block text-sm text-text-primary mb-1">
        {field.label}
      </label>
      <input
        id={`fill-${field.id}`}
        type="text"
        className={inputCls}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        placeholder={(field.config as Record<string, unknown>)?.placeholder as string | undefined}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}

// ─── Long text ─────────────────────────────────────────────────────────────
function LongTextFill({ field, onChange, disabled }: FillControlProps) {
  return (
    <div className="py-1">
      <label htmlFor={`fill-${field.id}`} className="block text-sm text-text-primary mb-1">
        {field.label}
      </label>
      <textarea
        id={`fill-${field.id}`}
        className={inputCls + " resize-none"}
        rows={3}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        placeholder={(field.config as Record<string, unknown>)?.placeholder as string | undefined}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}

// ─── Number ────────────────────────────────────────────────────────────────
function NumberFill({ field, onChange, disabled }: FillControlProps) {
  const cfg = field.config as Record<string, unknown>;
  return (
    <div className="py-1">
      <label htmlFor={`fill-${field.id}`} className="block text-sm text-text-primary mb-1">
        {field.label}
      </label>
      <input
        id={`fill-${field.id}`}
        type="number"
        className={inputCls}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        placeholder={cfg?.placeholder as string | undefined}
        min={cfg?.min as string | undefined}
        max={cfg?.max as string | undefined}
        step={cfg?.step as string | undefined}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}

// ─── Yes / No ──────────────────────────────────────────────────────────────
function YesNoFill({ field, onChange, disabled }: FillControlProps) {
  const current = field.value as "yes" | "no" | null;
  return (
    <div className="py-1">
      <span className="block text-sm text-text-primary mb-2">{field.label}</span>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ value: current === opt ? null : opt })}
            className={
              "min-w-[60px] rounded-full px-4 py-1.5 text-sm font-medium border transition-colors duration-fast " +
              (current === opt
                ? "bg-ink-pill text-white border-ink-pill"
                : "bg-surface-muted text-text-secondary border-border hover:border-border-strong disabled:opacity-50")
            }
          >
            {opt === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Dropdown ──────────────────────────────────────────────────────────────
function DropdownFill({ field, onChange, disabled }: FillControlProps) {
  const cfg = field.config as Record<string, unknown>;
  const options = (cfg?.options as string[] | undefined) ?? [];
  const current = typeof field.value === "string" ? field.value : "";
  return (
    <div className="py-1">
      <label htmlFor={`fill-${field.id}`} className="block text-sm text-text-primary mb-1">
        {field.label}
      </label>
      <select
        id={`fill-${field.id}`}
        className={inputCls}
        value={current}
        disabled={disabled}
        onChange={(e) => onChange({ value: e.target.value || null })}
      >
        <option value="">— select —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Date ──────────────────────────────────────────────────────────────────
function DateFill({ field, onChange, disabled }: FillControlProps) {
  return (
    <div className="py-1">
      <label htmlFor={`fill-${field.id}`} className="block text-sm text-text-primary mb-1">
        {field.label}
      </label>
      <input
        id={`fill-${field.id}`}
        type="date"
        className={inputCls}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        onChange={(e) => onChange({ value: e.target.value || null })}
      />
    </div>
  );
}

// ─── Photo ─────────────────────────────────────────────────────────────────
// Capture/upload an image to the form-photos bucket (data: URL fallback when
// Supabase is absent), persist the storage path on photoUrl, and re-render it
// via a freshly-resolved (signed) URL.
function PhotoFill({ field, onChange, disabled }: FillControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve the stored path → renderable URL whenever it changes.
  useEffect(() => {
    let cancelled = false;
    if (!field.photoUrl) {
      setPreview(null);
      return;
    }
    resolveFormPhotoUrl(field.photoUrl)
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [field.photoUrl]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { storagePath } = await uploadFormPhoto(field.instanceId, field.id, file);
      onChange({ photoUrl: storagePath });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      {preview && (
        // Stored capture — a data: or signed URL, not optimizable by next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={field.label}
          data-testid="form-photo-preview"
          className="mb-2 max-h-48 rounded-md border border-border object-contain"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={field.label}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-4 py-1.5 text-sm text-text-secondary hover:border-border-strong disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Camera className="h-4 w-4" strokeWidth={1.75} />
        )}
        {field.photoUrl ? "Replace photo" : "Add photo"}
      </button>
      {error && <p className="mt-1 text-xs text-status-blocked">{error}</p>}
    </div>
  );
}

// ─── Signature ─────────────────────────────────────────────────────────────
// Draw on a canvas (perfect-freehand smoothing — same engine as drawings), save
// the result as a PNG to form-photos, and record the typed signer name + an
// exact timestamp (signed_at) alongside it. That audit pair is what makes the
// eventual signoff dispute-proof (renders on the slice-4 PDF).
function SignatureFill({ field, onChange, disabled }: FillControlProps) {
  const cfg = field.config as Record<string, unknown>;
  const [signerName, setSignerName] = useState(
    typeof cfg?.signerName === "string" ? (cfg.signerName as string) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // The "I confirm" affirmation: must be ticked before a signature can be saved.
  // Persisted as config.affirmed so the audit trail records that the signer
  // explicitly affirmed (renders on the signoff PDF).
  const [affirmed, setAffirmed] = useState(cfg?.affirmed === true);
  const signedAt = typeof cfg?.signedAt === "string" ? (cfg.signedAt as string) : null;

  useEffect(() => {
    let cancelled = false;
    if (!field.photoUrl) {
      setPreview(null);
      return;
    }
    resolveFormPhotoUrl(field.photoUrl)
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [field.photoUrl]);

  async function handleSave(dataUrl: string) {
    if (!signerName.trim()) {
      setError("Type the signer's name first.");
      return;
    }
    if (!affirmed) {
      setError("Tick the confirmation box before signing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { storagePath } = await uploadSignaturePng(field.instanceId, field.id, dataUrl);
      onChange({
        photoUrl: storagePath,
        config: {
          ...cfg,
          signerName: signerName.trim(),
          signedAt: new Date().toISOString(),
          affirmed: true,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save signature");
    } finally {
      setBusy(false);
    }
  }

  const signed = Boolean(field.photoUrl);

  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      <input
        type="text"
        className={inputCls + " mb-2"}
        value={signerName}
        disabled={disabled || signed}
        aria-label={`${field.label} — signer name`}
        placeholder="Signed by (full name)"
        onChange={(e) => setSignerName(e.target.value)}
      />
      {signed && preview ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={`Signature of ${signerName || "signer"}`}
            data-testid="form-signature-preview"
            className="max-h-32 rounded-md border border-border bg-white object-contain"
          />
          <p className="mt-1 text-xs text-text-tertiary">
            Signed by {signerName || "—"}
            {signedAt ? ` · ${new Date(signedAt).toLocaleString()}` : ""}
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange({ photoUrl: null })}
              className="mt-1 inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
            >
              <Eraser className="h-3 w-3" strokeWidth={2} /> Sign again
            </button>
          )}
        </div>
      ) : (
        <>
          <label className="mb-2 flex items-start gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={affirmed}
              disabled={disabled}
              aria-label={`${field.label} — I confirm`}
              data-testid="signature-affirm"
              onChange={(e) => setAffirmed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-ink-pill"
            />
            <span>I confirm this is my signature and the information above is correct.</span>
          </label>
          <SignaturePad disabled={disabled || busy || !affirmed} busy={busy} onSave={handleSave} />
        </>
      )}
      {error && <p className="mt-1 text-xs text-status-blocked">{error}</p>}
    </div>
  );
}

// A touch/mouse signature canvas. Captures pointer strokes, renders them with
// perfect-freehand, and exports a trimmed PNG data URL on "Save".
function SignaturePad({
  disabled,
  busy,
  onSave,
}: {
  disabled?: boolean;
  busy?: boolean;
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<[number, number, number][][]>([]);
  const currentRef = useRef<[number, number, number][]>([]);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1A1916";
    const all = [...strokesRef.current, currentRef.current].filter((s) => s.length > 0);
    for (const points of all) {
      const outline = getStroke(points, {
        size: 4,
        thinning: 0.6,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true,
        last: !drawingRef.current,
      });
      if (outline.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) {
        ctx.lineTo(outline[i][0], outline[i][1]);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function pointFromEvent(e: PointerEvent<HTMLCanvasElement>): [number, number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top, e.pressure || 0.5];
  }

  function clear() {
    strokesRef.current = [];
    currentRef.current = [];
    setHasInk(false);
    redraw();
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        data-testid="form-signature-canvas"
        aria-label="Signature canvas"
        className="w-full touch-none rounded-md border border-border bg-white"
        style={{ maxWidth: 480 }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawingRef.current = true;
          currentRef.current = [pointFromEvent(e)];
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          currentRef.current = [...currentRef.current, pointFromEvent(e)];
          redraw();
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          if (currentRef.current.length > 0) {
            strokesRef.current = [...strokesRef.current, currentRef.current];
            currentRef.current = [];
            setHasInk(true);
          }
          redraw();
        }}
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || !hasInk}
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40"
        >
          <Eraser className="h-3 w-3" strokeWidth={2} /> Clear
        </button>
        <button
          type="button"
          data-testid="signature-save"
          disabled={disabled || busy || !hasInk}
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) onSave(canvas.toDataURL("image/png"));
          }}
          className="inline-flex items-center gap-1 rounded-full bg-ink-pill px-4 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />}
          Save signature
        </button>
      </div>
    </div>
  );
}

export const FILL_CONTROLS: Partial<Record<FieldType, ComponentType<FillControlProps>>> = {
  section: SectionFill,
  checkbox: CheckboxFill,
  short_text: ShortTextFill,
  long_text: LongTextFill,
  number: NumberFill,
  yes_no: YesNoFill,
  dropdown: DropdownFill,
  date: DateFill,
  photo: PhotoFill,
  signature: SignatureFill,
};

export function getFillControl(type: string): ComponentType<FillControlProps> | undefined {
  return FILL_CONTROLS[type as FieldType];
}
