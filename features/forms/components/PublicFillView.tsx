"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { getFieldEntry, isFieldRequired } from "../lib/fieldRegistry";
import { getFillControl } from "../lib/fieldControls";
import type { ShareAnswerPatch, ShareAnswers } from "../lib/shareLink";
import { missingVisibleRequiredFields } from "../lib/shareLink";
import { isFieldVisible } from "../lib/conditionals";
import { CompletionMeter } from "./CompletionMeter";

/**
 * The bare, no-login fill page rendered behind a /f/<token> link. Lists the
 * instance's fields via the field registry; locked fields render read-only
 * showing the owner's pre-filled value (context for the client); open fields are
 * editable. Submit POSTs to the token's submit route, which re-strips locked
 * fields server-side (the client view is convenience, not the boundary).
 *
 * Save-and-resume: the page re-hydrates from the persisted instance fields on
 * each open, so reopening the same link shows saved answers.
 */
export function PublicFillView({
  token,
  instance,
  fields,
  lockedFieldIds,
  recipientName,
  alreadySubmitted,
}: {
  token: string;
  instance: FormInstance;
  fields: FormInstanceField[];
  lockedFieldIds: string[];
  recipientName: string | null;
  alreadySubmitted: boolean;
}) {
  const locked = useMemo(() => new Set(lockedFieldIds), [lockedFieldIds]);

  // Local working copy of each field's answer, seeded from the persisted values.
  const [working, setWorking] = useState<FormInstanceField[]>(fields);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    alreadySubmitted ? "saved" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Non-blocking warning: names of visible required fields left blank on submit.
  const [warnFields, setWarnFields] = useState<string[]>([]);

  function patchField(id: string, patch: Partial<FormInstanceField>) {
    setWorking((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    if (status === "saved") setStatus("idle");
    // Clear soft-warn when the user starts editing again.
    if (warnFields.length > 0) setWarnFields([]);
  }

  async function submit() {
    setStatus("saving");
    setErrorMsg(null);

    // Soft-warn: collect visible required fields still blank on the OPEN (unlocked)
    // side. We warn but do NOT block — partial saves/resume are intentional.
    const openWorking = working.map((f) => (locked.has(f.id) ? f : f));
    const missing = missingVisibleRequiredFields(openWorking).filter((f) => !locked.has(f.id));
    setWarnFields(missing.map((f) => f.label));

    // Build the answer payload for the OPEN fields only; the server also strips
    // locked ids, so this is belt-and-suspenders.
    const answers: ShareAnswers = {};
    for (const f of working) {
      if (locked.has(f.id)) continue;
      const entry = getFieldEntry(f.type);
      if (entry?.isLayout) continue;
      const patch: ShareAnswerPatch = {};
      if (f.checked !== null) patch.checked = f.checked;
      if (f.value !== null && f.value !== undefined) patch.value = f.value;
      if (f.note !== null) patch.note = f.note;
      if (Object.keys(patch).length > 0) answers[f.id] = patch;
    }

    try {
      const res = await fetch(`/f/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        setStatus("error");
        setErrorMsg(
          body.reason === "revoked"
            ? "This link is no longer active."
            : "Could not save your answers. Please try again."
        );
        return;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
      setErrorMsg("Could not save your answers. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Branded header — 44px min touch target on mobile, full-bleed tint bar */}
      <div className="border-b border-border bg-canvas-top px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {/* Wordmark — serif logotype matching the dashboard identity */}
          <span
            className="font-serif text-lg font-semibold tracking-tight text-text-primary"
            aria-label="Good Woods"
          >
            Good Woods
          </span>
          <span className="text-border-strong">·</span>
          <span className="text-sm text-text-tertiary">Spacecraft Joinery</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
        <header className="mb-6">
          <h1 className="font-serif text-2xl text-text-primary">{instance.title}</h1>
          {recipientName && (
            <p className="mt-1 text-sm text-text-secondary">Prepared for {recipientName}</p>
          )}
        </header>

        <div
          className="rounded-2xl border border-border bg-surface p-5 shadow-resting"
          data-testid="public-fill-form"
        >
          <div className="flex flex-col gap-1">
            {working.map((field) => {
              if (!isFieldVisible(field, working)) return null;
              const isLocked = locked.has(field.id);
              const entry = getFieldEntry(field.type);
              const Control = getFillControl(field.type);
              const isRequired = isFieldRequired(field);
              return (
                <div key={field.id} className="relative">
                  {entry?.implemented && Control ? (
                    <div className={isLocked ? "opacity-90" : undefined}>
                      <Control
                        field={field}
                        disabled={isLocked}
                        onChange={(patch) => patchField(field.id, patch)}
                      />
                      {isRequired && !entry.isLayout && !isLocked && (
                        <span className="ml-0.5 text-accent" aria-label="required" title="Required">
                          *
                        </span>
                      )}
                      {isLocked && !entry.isLayout && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-text-tertiary"
                          data-testid="locked-field-badge"
                        >
                          <Lock className="h-3 w-3" strokeWidth={2} />
                          Provided — read only
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="py-1 text-sm text-text-tertiary">
                      <span className="text-text-secondary">{field.label}</span>{" "}
                      <span className="italic">(coming soon)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Live completeness meter — updates as fields fill */}
          <div className="mt-4">
            <CompletionMeter fields={working} />
          </div>

          {/* Soft-warn: shown after submit if visible required fields are blank */}
          {warnFields.length > 0 && (
            <div
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
              data-testid="required-fields-warning"
            >
              <p className="font-medium text-amber-800">Some fields were left blank:</p>
              <ul className="mt-1 list-disc pl-4 text-amber-700">
                {warnFields.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
              <p className="mt-1 text-amber-600">
                Your answers were saved — you can reopen this link to fill them in.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="min-h-[20px] text-sm">
              {status === "saved" && (
                <span
                  className="inline-flex items-center gap-1 text-status-on-track"
                  data-testid="submit-saved"
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  Saved — thank you
                </span>
              )}
              {status === "error" && errorMsg && (
                <span className="text-status-blocked">{errorMsg}</span>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={status === "saving"}
              data-testid="submit-form"
              className="inline-flex items-center gap-2 rounded-full bg-ink-pill px-5 py-2 text-sm font-medium text-white shadow-resting transition-opacity duration-fast disabled:opacity-60"
            >
              {status === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <Check className="h-4 w-4" strokeWidth={2.5} />
              )}
              {status === "saved" ? "Update" : "Submit"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-text-tertiary">
          Your answers are saved automatically — you can reopen this link anytime to continue.
        </p>
      </div>

      {/* Branded footer */}
      <footer className="mt-12 border-t border-border px-4 py-6 text-center">
        <p className="text-xs text-text-tertiary">
          Sent by{" "}
          <span className="font-medium text-text-secondary">Good Woods · Spacecraft Joinery</span>
        </p>
        <p className="mt-1 text-xs text-text-disabled">Questions? Contact your project team.</p>
      </footer>
    </main>
  );
}
