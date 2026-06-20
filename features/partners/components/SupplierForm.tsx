"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import type { CatalogSupplier } from "@features/catalog/lib/catalogRowMap";

type Mode = "create" | "edit";

export function SupplierForm({
  supplier,
  mode,
}: {
  supplier?: CatalogSupplier;
  mode: Mode;
}) {
  const router = useRouter();
  const { addSupplier, updateSupplier } = useCatalog();

  const [name, setName] = useState(supplier?.name ?? "");
  const [description, setDescription] = useState(supplier?.description ?? "");
  const [website, setWebsite] = useState(supplier?.website ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [account, setAccount] = useState(supplier?.accountNumber ?? "");
  const [leadTime, setLeadTime] = useState(supplier?.leadTimeNote ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  function patch() {
    return {
      description: description.trim() || undefined,
      website: website.trim() || undefined,
      address: address.trim() || undefined,
      accountNumber: account.trim() || undefined,
      leadTimeNote: leadTime.trim() || undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (mode === "create") {
        const id = await addSupplier(name.trim()); // find-or-create
        if (!id) throw new Error("Could not create supplier.");
        updateSupplier(id, patch());
        router.push(`/suppliers/${id}`);
      } else if (supplier) {
        updateSupplier(supplier.id, { name: name.trim(), ...patch() });
        router.push(`/suppliers/${supplier.id}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save supplier.");
      setSubmitting(false);
    }
  }

  const backHref = mode === "edit" && supplier ? `/suppliers/${supplier.id}` : "/partners";

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
        <Card title="Supplier">
          <Field label="Name" required>
            <Input value={name} onChange={setName} placeholder="e.g. Windsor Plywood" autoFocus />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={setDescription}
              placeholder="What they supply / specialty (e.g. cabinet-grade ply + melamine)"
            />
          </Field>
          <Field label="Website">
            <Input value={website} onChange={setWebsite} placeholder="windsorplywood.com" />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={setAddress} placeholder="Branch or mailing address" />
          </Field>
          <Field label="Account #">
            <Input value={account} onChange={setAccount} placeholder="Your account number with them" />
          </Field>
          <Field label="Lead time">
            <Input value={leadTime} onChange={setLeadTime} placeholder="e.g. 2-3 days, or next-day on stock" />
          </Field>
          <p className="text-xs text-text-tertiary">
            Add people (sales rep, accounts...) on the profile after creating. Prices and buy links
            are managed in the Catalog.
          </p>
        </Card>

        <Card title="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Delivery quirks, minimums, who to ask for, anything worth remembering."
            className="w-full min-h-[96px] text-sm bg-surface border border-border rounded-md px-3 py-2.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-y"
          />
        </Card>

        {submitError && (
          <div className="bg-status-blocked-soft rounded-md p-3 text-sm text-status-blocked">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
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
                ? "Add supplier"
                : "Save changes"}
          </button>
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
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full min-h-[40px] text-sm bg-surface border border-border rounded-md px-3 py-2.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    />
  );
}
