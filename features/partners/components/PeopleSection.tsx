"use client";

import { useState } from "react";
import { Mail, Pencil, Phone, Plus, Star, Trash2, UserPlus } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { PartnerCompanyKind, PartnerPerson } from "../lib/types";
import { usePartnerPeople } from "../lib/partnerPeopleStore";

const ROLE_SUGGESTIONS = [
  "Owner",
  "Estimator",
  "Installer",
  "Foreman",
  "Scheduler",
  "Accounts",
  "Sales",
  "Project manager",
];

export function PeopleSection({
  kind,
  companyId,
}: {
  kind: PartnerCompanyKind;
  companyId: string;
}) {
  const { peopleFor, removePerson, setPrimary } = usePartnerPeople();
  const people = peopleFor(kind, companyId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="bg-surface rounded-2xl shadow-resting overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">People ({people.length})</h2>
        {!adding && editingId === null && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Add
          </button>
        )}
      </div>

      <div className="divide-y divide-border-faint">
        {people.length === 0 && !adding && (
          <p className="px-5 py-5 text-sm text-text-tertiary text-center">
            <UserPlus className="h-5 w-5 mx-auto mb-2 text-text-tertiary" strokeWidth={1.5} />
            No people yet. Add the owner, estimator, or the crew you actually call.
          </p>
        )}

        {people.map((p) =>
          editingId === p.id ? (
            <PersonForm
              key={p.id}
              kind={kind}
              companyId={companyId}
              person={p}
              isFirst={people.length === 1}
              onClose={() => setEditingId(null)}
            />
          ) : (
            <PersonRow
              key={p.id}
              person={p}
              onEdit={() => setEditingId(p.id)}
              onRemove={() => removePerson(p.id)}
              onMakePrimary={() => setPrimary(p.id)}
            />
          )
        )}

        {adding && (
          <PersonForm
            kind={kind}
            companyId={companyId}
            isFirst={people.length === 0}
            onClose={() => setAdding(false)}
          />
        )}
      </div>
    </section>
  );
}

function PersonRow({
  person,
  onEdit,
  onRemove,
  onMakePrimary,
}: {
  person: PartnerPerson;
  onEdit: () => void;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  return (
    <div className="px-5 py-3.5 group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {person.name || "Unnamed"}
            </span>
            {person.isPrimary && (
              <Star
                className="h-3 w-3 text-accent fill-current shrink-0"
                strokeWidth={1.75}
                aria-label="Primary contact"
              />
            )}
          </div>
          {person.role && (
            <span className="mt-1 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
              {person.role}
            </span>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {person.phone && (
              <a
                href={`tel:${person.phone}`}
                className="inline-flex items-center gap-1 text-text-secondary hover:text-accent transition-colors duration-fast tabular-nums"
              >
                <Phone className="h-3 w-3" strokeWidth={1.75} />
                {person.phone}
              </a>
            )}
            {person.email && (
              <a
                href={`mailto:${person.email}`}
                className="inline-flex items-center gap-1 text-text-secondary hover:text-accent transition-colors duration-fast truncate"
              >
                <Mail className="h-3 w-3" strokeWidth={1.75} />
                {person.email}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-fast">
          {!person.isPrimary && (
            <button
              type="button"
              onClick={onMakePrimary}
              title="Make primary"
              className="p-1.5 rounded-md text-text-tertiary hover:text-accent hover:bg-surface-muted transition-colors duration-fast"
            >
              <Star className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-muted transition-colors duration-fast"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove ${person.name || "this person"}?`)) onRemove();
            }}
            title="Remove"
            className="p-1.5 rounded-md text-text-tertiary hover:text-status-blocked hover:bg-surface-muted transition-colors duration-fast"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonForm({
  kind,
  companyId,
  person,
  isFirst,
  onClose,
}: {
  kind: PartnerCompanyKind;
  companyId: string;
  person?: PartnerPerson;
  isFirst: boolean;
  onClose: () => void;
}) {
  const { createPerson, updatePerson } = usePartnerPeople();
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (person) {
        await updatePerson(person.id, {
          name: name.trim(),
          role: role.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
        });
      } else {
        const now = new Date().toISOString();
        await createPerson({
          id: crypto.randomUUID(),
          supplierId: kind === "supplier" ? companyId : null,
          subtradeId: kind === "subtrade" ? companyId : null,
          name: name.trim(),
          role: role.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          isPrimary: isFirst, // first person added is the default contact
          notes: null,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-4 bg-surface-muted/40 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          autoFocus
          className="min-h-[36px] text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (e.g. Installer)"
          list="partner-role-suggestions"
          className="min-h-[36px] text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          type="tel"
          className="min-h-[36px] text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          className="min-h-[36px] text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
      </div>
      <datalist id="partner-role-suggestions">
        {ROLE_SUGGESTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1.5 transition-colors duration-fast"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="inline-flex items-center rounded-full bg-ink-pill text-white px-3.5 py-1.5 text-xs font-medium hover:bg-accent-active transition-colors duration-fast disabled:bg-text-disabled disabled:cursor-not-allowed"
        >
          {saving ? "Saving" : person ? "Save" : "Add person"}
        </button>
      </div>
    </div>
  );
}
