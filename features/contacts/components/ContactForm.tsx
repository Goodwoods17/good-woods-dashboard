"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, Star } from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  ROLE_TAGS,
  ROLE_TAG_LABELS,
  type Contact,
  type ContactKind,
  type RoleTag,
} from "@shared/lib/types";
import { useContacts } from "../lib/contactsStore";

type Mode = "create" | "edit";

export function ContactForm({ contact, mode }: { contact?: Contact; mode: Mode }) {
  const router = useRouter();
  const { createContact, updateContact, archiveContact } = useContacts();

  const [name, setName] = useState(contact?.name ?? "");
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? "person");
  const [roleTags, setRoleTags] = useState<RoleTag[]>(contact?.roleTags ?? []);
  const [isAnchor, setIsAnchor] = useState(contact?.isAnchor ?? false);
  const [email, setEmail] = useState(contact?.emails?.[0]?.value ?? "");
  const [phone, setPhone] = useState(contact?.phones?.[0]?.value ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [website, setWebsite] = useState(contact?.website ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  function toggleTag(tag: RoleTag) {
    setRoleTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const emails = email.trim() ? [{ label: "primary", value: email.trim() }] : [];
    const phones = phone.trim() ? [{ label: "primary", value: phone.trim() }] : [];

    try {
      if (mode === "create") {
        const id = crypto.randomUUID();
        const fresh: Contact = {
          id,
          kind,
          parentId: null,
          name: name.trim(),
          roleTags,
          emails,
          phones,
          address: address.trim() || null,
          website: website.trim() || null,
          notes: notes.trim() || null,
          introducedById: null,
          isAnchor,
          lastTouchedAt: null,
          followUpAt: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        };
        await createContact(fresh);
        router.push(`/crm/${id}`);
      } else if (contact) {
        await updateContact(contact.id, {
          name: name.trim(),
          kind,
          roleTags,
          isAnchor,
          emails,
          phones,
          address: address.trim() || null,
          website: website.trim() || null,
          notes: notes.trim() || null,
        });
        router.push(`/crm/${contact.id}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save contact.");
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!contact) return;
    if (!window.confirm(`Archive ${contact.name}? You can restore later from the archive view.`)) {
      return;
    }
    setArchiving(true);
    try {
      await archiveContact(contact.id);
      router.push("/crm");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not archive.");
      setArchiving(false);
    }
  }

  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl">
      <Link
        href={mode === "edit" && contact ? `/crm/${contact.id}` : "/crm"}
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
              placeholder={kind === "org" ? "e.g. Raubyn Design Studio" : "e.g. Anika Patel"}
              autoFocus
            />
          </Field>
          <Field label="Kind">
            <SegmentedControl
              value={kind}
              onChange={(v) => setKind(v as ContactKind)}
              options={[
                { value: "person", label: "Person" },
                { value: "org", label: "Organization" },
              ]}
            />
          </Field>
          <Field label="Roles">
            <div className="flex flex-wrap gap-1.5">
              {ROLE_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={roleTags.includes(tag)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 min-h-[40px] text-xs font-medium transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
                    roleTags.includes(tag)
                      ? "bg-ink-pill text-white"
                      : "bg-surface-muted text-text-secondary hover:bg-surface-sunken"
                  )}
                >
                  {ROLE_TAG_LABELS[tag]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Anchor relationship">
            <button
              type="button"
              onClick={() => setIsAnchor((p) => !p)}
              aria-pressed={isAnchor}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 min-h-[40px] text-xs font-medium transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
                isAnchor
                  ? "bg-accent-soft text-accent"
                  : "bg-surface-muted text-text-secondary hover:bg-surface-sunken"
              )}
            >
              <Star className={cn("h-3.5 w-3.5", isAnchor && "fill-current")} strokeWidth={1.75} />
              {isAnchor ? "Anchor" : "Mark as anchor"}
            </button>
            <p className="text-xs text-text-tertiary mt-2">
              Anchors pin to the top of Contacts and surface in the daily briefing when they go
              quiet.
            </p>
          </Field>
        </Card>

        <Card title="Reach">
          <Field label="Email">
            <Input
              value={email}
              onChange={setEmail}
              placeholder="raubyn@rothschildwest.com"
              type="email"
            />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={setPhone} placeholder="(250) 555 0182" type="tel" />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={setAddress} placeholder="Studio address or site" />
          </Field>
          <Field label="Website">
            <Input value={website} onChange={setWebsite} placeholder="rothschildwest.com" />
          </Field>
        </Card>

        <Card title="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Recent context, design preferences, payment cadence, anything worth remembering before the next call."
            className="w-full min-h-[96px] text-sm bg-surface border border-border rounded-md px-3 py-2.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-y"
          />
        </Card>

        {submitError && (
          <div className="bg-status-blocked-soft rounded-md p-3 text-sm text-status-blocked">
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          {mode === "edit" && contact ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 min-h-[40px] text-xs text-text-tertiary hover:text-status-blocked transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft rounded-full px-1"
            >
              <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
              {archiving ? "Archiving" : "Archive contact"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Link
              href={mode === "edit" && contact ? `/crm/${contact.id}` : "/crm"}
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
                  ? "Create client"
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

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-muted p-1">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            "inline-flex items-center rounded-full px-4 min-h-[36px] text-xs font-medium transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
            value === opt.value
              ? "bg-ink-pill text-white"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
