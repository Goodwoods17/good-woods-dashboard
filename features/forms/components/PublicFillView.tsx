"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { getFieldEntry } from "../lib/fieldRegistry";
import { getFillControl } from "../lib/fieldControls";
import type { ShareAnswerPatch, ShareAnswers } from "../lib/shareLink";

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
  // A form carrying a signature is a signing — gate submit on the "I confirm"
  // affirmation, and send it so the server can record the audit trail.
  const hasSignature = useMemo(() => fields.some((f) => f.type === "signature"), [fields]);

  // Local working copy of each field's answer, seeded from the persisted values.
  const [working, setWorking] = useState<FormInstanceField[]>(fields);
  const [affirmed, setAffirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    alreadySubmitted ? "saved" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function patchField(id: string, patch: Partial<FormInstanceField>) {
    setWorking((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    if (status === "saved") setStatus("idle");
  }

  async function submit() {
    if (hasSignature && !affirmed) {
      setStatus("error");
      setErrorMsg("Please confirm the affirmation before submitting.");
      return;
    }
    setStatus("saving");
    setErrorMsg(null);
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
        body: JSON.stringify({ answers, ...(hasSignature ? { affirmed } : {}) }),
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
    <main className="min-h-screen bg-background px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">Good Woods</p>
          <h1 className="font-serif text-2xl text-text-primary mt-1">{instance.title}</h1>
          {recipientName && <p className="text-sm text-text-secondary mt-1">For {recipientName}</p>}
        </header>

        <div
          className="rounded-2xl border border-border bg-surface p-5 shadow-resting"
          data-testid="public-fill-form"
        >
          <div className="flex flex-col gap-1">
            {working.map((field) => {
              const isLocked = locked.has(field.id);
              const entry = getFieldEntry(field.type);
              const Control = getFillControl(field.type);
              return (
                <div key={field.id} className="relative">
                  {entry?.implemented && Control ? (
                    <div className={isLocked ? "opacity-90" : undefined}>
                      <Control
                        field={field}
                        disabled={isLocked}
                        onChange={(patch) => patchField(field.id, patch)}
                      />
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

          {hasSignature && (
            <label className="mt-5 flex items-start gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={affirmed}
                disabled={status === "saving"}
                onChange={(e) => {
                  setAffirmed(e.target.checked);
                  if (status === "error") setStatus("idle");
                }}
                data-testid="signature-affirmation"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-ink-pill"
              />
              <span>
                I confirm the information above is accurate and that this signature is my own.
              </span>
            </label>
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
    </main>
  );
}
