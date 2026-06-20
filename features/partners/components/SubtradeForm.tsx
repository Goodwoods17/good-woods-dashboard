"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { Subtrade } from "../lib/types";
import { useSubtrades } from "../lib/subtradesStore";
import { useTrades } from "../lib/tradesStore";
import { TradeDot } from "./TradePill";

type Mode = "create" | "edit";

export function SubtradeForm({ subtrade, mode }: { subtrade?: Subtrade; mode: Mode }) {
  const router = useRouter();
  const { createSubtrade, updateSubtrade, archiveSubtrade } = useSubtrades();
  const { trades } = useTrades();

  const tradeOptions = trades
    .filter((t) => t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const [name, setName] = useState(subtrade?.name ?? "");
  const [tradeId, setTradeId] = useState<string | null>(subtrade?.tradeId ?? null);
  const [contactName, setContactName] = useState(subtrade?.contactName ?? "");
  const [phone, setPhone] = useState(subtrade?.phone ?? "");
  const [email, setEmail] = useState(subtrade?.email ?? "");
  const [address, setAddress] = useState(subtrade?.address ?? "");
  const [rateNote, setRateNote] = useState(subtrade?.typicalRateNote ?? "");
  const [notes, setNotes] = useState(subtrade?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "create") {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const fresh: Subtrade = {
          id,
          name: name.trim(),
          tradeId,
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          typicalRateNote: rateNote.trim() || null,
          notes: notes.trim() || null,
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        await createSubtrade(fresh);
        router.push(`/subtrades/${id}`);
      } else if (subtrade) {
        await updateSubtrade(subtrade.id, {
          name: name.trim(),
          tradeId,
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          typicalRateNote: rateNote.trim() || null,
          notes: notes.trim() || null,
        });
        router.push(`/subtrades/${subtrade.id}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save subtrade.");
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!subtrade) return;
    if (!window.confirm(`Archive ${subtrade.name}? You can restore it later.`)) return;
    setArchiving(true);
    try {
      await archiveSubtrade(subtrade.id);
      router.push("/partners");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not archive.");
      setArchiving(false);
    }
  }

  const backHref = mode === "edit" && subtrade ? `/subtrades/${subtrade.id}` : "/partners";

  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back
      </Link>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card title="Identity">
          <Field label="Name" required>
            <Input
              value={name}
              onChange={setName}
              placeholder="e.g. Coastline Install Co."
              autoFocus
            />
          </Field>
          <Field label="Trade">
            <div className="flex flex-wrap gap-1.5">
              {tradeOptions.map((t) => {
                const selected = tradeId === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTradeId(selected ? null : t.id)}
                    aria-pressed={selected}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-[40px] text-xs font-medium transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
                      selected
                        ? "bg-ink-pill text-white"
                        : "bg-surface-muted text-text-secondary hover:bg-surface-sunken"
                    )}
                  >
                    <TradeDot color={t.color} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </Card>

        <Card title="Contact">
          <Field label="Contact name">
            <Input value={contactName} onChange={setContactName} placeholder="Foreman or main contact" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={setPhone} placeholder="(250) 555 0182" type="tel" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={setEmail} placeholder="crew@coastline.ca" type="email" />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={setAddress} placeholder="Shop or mailing address" />
          </Field>
          <Field label="Typical rate">
            <Input
              value={rateNote}
              onChange={setRateNote}
              placeholder="e.g. $65/hr, or $400/day, 2-person crew"
            />
          </Field>
        </Card>

        <Card title="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Reliability, scheduling quirks, anything worth remembering before the next job."
            className="w-full min-h-[96px] text-sm bg-surface border border-border rounded-md px-3 py-2.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-y"
          />
        </Card>

        {submitError && (
          <div className="bg-status-blocked-soft rounded-md p-3 text-sm text-status-blocked">
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          {mode === "edit" && subtrade ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 min-h-[40px] text-xs text-text-tertiary hover:text-status-blocked transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft rounded-full px-1"
            >
              <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
              {archiving ? "Archiving" : "Archive subtrade"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              className="inline-flex items-center justify-center rounded-full bg-surface shadow-floating hover:shadow-hover px-5 min-h-[40px] text-sm font-medium text-text-secondary transition-shadow duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={cn(
                "inline-flex items-center justify-center rounded-full bg-ink-pill text-white px-5 min-h-[40px] text-sm font-medium hover:bg-accent-active transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
                "disabled:bg-text-disabled disabled:cursor-not-allowed"
              )}
            >
              {submitting
                ? mode === "create"
                  ? "Creating"
                  : "Saving"
                : mode === "create"
                  ? "Add subtrade"
                  : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-2xl shadow-resting overflow-hidden">
      <div className="px-5 py-3 bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full min-h-[40px] text-sm bg-surface border border-border rounded-md px-3 py-2.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    />
  );
}
