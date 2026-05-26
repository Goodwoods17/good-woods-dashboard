"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useContacts } from "../lib/contactsStore";
import {
  ROLE_TAG_LABELS,
  type Contact,
  type RoleTag,
} from "@shared/lib/types";

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Filter the list down to contacts that carry at least one of these tags. Empty array = no filter. */
  rolePreference?: RoleTag[];
  /** Pre-fill the inline create form's role tag. */
  defaultCreateRole?: RoleTag;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Typeahead picker over contacts. + Create contact opens an inline
 * expanding mini-form below the combobox (NOT a Modal — locked from
 * /impeccable craft P0 #2). After creation the new contact id is
 * selected and the mini-form collapses.
 */
export function ContactCombobox({
  value,
  onChange,
  rolePreference = [],
  defaultCreateRole,
  placeholder = "Search contacts",
  disabled,
}: Props) {
  const { contacts, createContact } = useContacts();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [open]);

  const selected = useMemo(
    () => contacts.find((c) => c.id === value) ?? null,
    [contacts, value]
  );

  const filtered = useMemo(() => {
    const active = contacts.filter((c) => !c.archivedAt);
    const byRole = rolePreference.length === 0
      ? active
      : [
          ...active.filter((c) => c.roleTags.some((t) => rolePreference.includes(t))),
          ...active.filter((c) => !c.roleTags.some((t) => rolePreference.includes(t))),
        ];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return byRole.slice(0, 20);
    return byRole.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);
  }, [contacts, rolePreference, query]);

  function pick(c: Contact) {
    onChange(c.id);
    setOpen(false);
    setQuery("");
    setShowCreate(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((p) => !p);
          setShowCreate(false);
        }}
        disabled={disabled}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-fast",
          "bg-white border border-border focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft",
          "disabled:bg-surface-muted disabled:cursor-not-allowed",
          open && "border-border-strong ring-2 ring-accent-soft"
        )}
      >
        <span className={cn("truncate", selected ? "text-text-primary" : "text-text-tertiary")}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0 text-text-tertiary">
          {selected && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              className="hover:text-text-secondary"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-floating overflow-hidden">
          <div className="border-b border-[rgba(26,25,22,0.05)] px-3 py-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter"
              className="w-full text-sm bg-transparent placeholder:text-text-tertiary focus:outline-none"
            />
          </div>

          {showCreate ? (
            <InlineCreate
              initialName={query}
              defaultRole={defaultCreateRole}
              onCancel={() => setShowCreate(false)}
              onCreated={async (fresh) => {
                await createContact(fresh);
                pick(fresh);
              }}
            />
          ) : (
            <>
              <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-text-tertiary">
                    No matches
                  </li>
                ) : (
                  filtered.map((c) => {
                    const isSel = c.id === value;
                    const matchedRole = c.roleTags.find((t) =>
                      rolePreference.includes(t)
                    );
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => pick(c)}
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-fast",
                            isSel
                              ? "bg-surface-muted text-text-primary"
                              : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {c.isAnchor && (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                            )}
                            <span className="text-sm truncate">{c.name}</span>
                            {matchedRole && (
                              <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary shrink-0">
                                {ROLE_TAG_LABELS[matchedRole]}
                              </span>
                            )}
                          </span>
                          {isSel && (
                            <Check
                              className="h-3.5 w-3.5 text-accent shrink-0"
                              strokeWidth={2}
                            />
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary border-t border-[rgba(26,25,22,0.05)] transition-colors duration-fast"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {query.trim().length > 0 ? `Create "${query.trim()}"` : "Create contact"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InlineCreate({
  initialName,
  defaultRole,
  onCancel,
  onCreated,
}: {
  initialName: string;
  defaultRole?: RoleTag;
  onCancel: () => void;
  onCreated: (c: Contact) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<Contact["kind"]>("org");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length === 0) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onCreated({
        id: crypto.randomUUID(),
        kind,
        parentId: null,
        name: name.trim(),
        roleTags: defaultRole ? [defaultRole] : [],
        emails: email.trim() ? [{ label: "primary", value: email.trim() }] : [],
        phones: [],
        address: null,
        website: null,
        notes: null,
        introducedById: null,
        isAnchor: false,
        lastTouchedAt: null,
        followUpAt: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      });
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Could not create.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-3 space-y-2 bg-surface-muted/40">
      <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
        New contact{defaultRole ? ` . ${ROLE_TAG_LABELS[defaultRole]}` : ""}
      </div>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full text-sm bg-white border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
      />
      <div className="flex items-center gap-1.5">
        {(["person", "org"] as const).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-fast",
              kind === k
                ? "bg-ink-pill text-white"
                : "bg-white text-text-secondary hover:text-text-primary"
            )}
          >
            {k === "org" ? "Organization" : "Person"}
          </button>
        ))}
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        className="w-full text-sm bg-white border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft"
      />
      {err && <div className="text-xs text-status-blocked">{err}</div>}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={name.trim().length === 0 || submitting}
          className={cn(
            "rounded-full bg-ink-pill text-white px-3 py-1 text-xs font-medium hover:bg-accent-active transition-colors duration-fast",
            "disabled:bg-text-disabled disabled:cursor-not-allowed"
          )}
        >
          {submitting ? "Creating" : "Create"}
        </button>
      </div>
    </form>
  );
}
