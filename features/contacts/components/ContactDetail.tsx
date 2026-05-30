"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Coffee,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
  User,
  Users,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { useContacts } from "../lib/contactsStore";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { rollupContact, rollupIntroducedClients } from "../lib/aggregate";
import { formatCAD, formatDate } from "@shared/lib/format";
import { RoleTagPills } from "./RoleTagPills";
import { WarmthChip } from "./WarmthChip";
import type { Contact } from "@shared/lib/types";

function formatLastTouched(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ContactDetail({ contact }: { contact: Contact }) {
  const { contacts, touchContact } = useContacts();
  const { jobs } = useJobs();
  const [touching, setTouching] = useState(false);
  const isMobile = useIsMobile();

  const rollup = useMemo(() => rollupContact(contact, jobs), [contact, jobs]);
  const introduced = useMemo(
    () => rollupIntroducedClients(contact, contacts, jobs),
    [contact, contacts, jobs]
  );
  const parent = contact.parentId ? contacts.find((c) => c.id === contact.parentId) : null;
  const introducedBy = contact.introducedById
    ? contacts.find((c) => c.id === contact.introducedById)
    : null;

  const Icon = contact.kind === "org" ? Building2 : User;

  async function handleTouch() {
    setTouching(true);
    try {
      await touchContact(contact.id);
    } finally {
      setTouching(false);
    }
  }

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl">
      <Link
        href="/crm"
        className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to Contacts
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-7">
        <div className="flex items-start gap-3 min-w-0">
          {contact.isAnchor && (
            <span
              aria-label="Anchor relationship"
              className="inline-block h-2 w-2 rounded-full bg-accent mt-3 shrink-0"
            />
          )}
          <Icon
            className="h-5 w-5 text-text-tertiary mt-2 shrink-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="min-w-0">
            <h1 className="font-serif text-headline font-medium text-text-primary truncate">
              {contact.name}
            </h1>
            {parent && (
              <Link
                href={`/crm/${parent.id}`}
                className="text-sm text-text-secondary hover:text-accent transition-colors duration-fast"
              >
                at {parent.name}
              </Link>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleTagPills tags={contact.roleTags} />
              <WarmthChip isAnchor={contact.isAnchor} daysSinceTouch={rollup.daysSinceTouch} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTouch}
            disabled={touching}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-surface shadow-floating hover:shadow-hover px-4 min-h-[40px] text-sm font-medium text-text-secondary transition-shadow duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-50"
          >
            <Coffee className="h-3.5 w-3.5" strokeWidth={1.75} />
            {touching ? "Updating" : "Touched today"}
          </button>
          <Link
            href={`/crm/${contact.id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink-pill text-white px-5 min-h-[40px] text-sm font-medium hover:bg-accent-active transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            Edit
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero column: Linked Jobs (P1 #5, the economic story leads). */}
        <div className="lg:col-span-2 space-y-6">
          <Section title={`Linked projects (${rollup.payerJobs.length})`}>
            {rollup.payerJobs.length === 0 ? (
              <p className="text-sm text-text-tertiary px-5 pb-5">
                No projects yet. New projects that list this contact as the payer will show up here.
              </p>
            ) : isMobile ? (
              <div className="divide-y divide-border-faint">
                {rollup.payerJobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="block px-5 py-4 min-h-[40px] hover:bg-surface-muted/40 transition-colors duration-fast"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text-primary font-medium truncate">{j.name}</span>
                      <span className="tabular-nums text-text-primary shrink-0">
                        {formatCAD(j.revenue)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-mono text-text-tertiary">{j.code}</span>
                      <span className="text-text-secondary capitalize">
                        {j.pipelineStatus.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-text-tertiary tabular-nums">
                      Install: {formatDate(j.installDate)}
                    </div>
                  </Link>
                ))}
                <div className="flex items-center justify-between px-5 py-3 bg-surface-muted/40">
                  <span className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium">
                    Lifetime
                  </span>
                  <span className="tabular-nums text-text-primary font-medium">
                    {formatCAD(rollup.lifetimeRevenue)}
                  </span>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-muted">
                    <Th>Project</Th>
                    <Th>Status</Th>
                    <Th align="right">Revenue</Th>
                    <Th align="right">Install</Th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.payerJobs.map((j, idx) => (
                    <tr
                      key={j.id}
                      className={cn(
                        "hover:bg-surface-muted/40 transition-colors duration-fast",
                        idx > 0 && "border-t border-[rgba(26,25,22,0.05)]"
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                        >
                          {j.name}
                        </Link>
                        <div className="text-xs text-text-tertiary font-mono">{j.code}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary capitalize">
                        {j.pipelineStatus.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatCAD(j.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                        {formatDate(j.installDate)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[rgba(26,25,22,0.08)] bg-surface-muted/40">
                    <td
                      colSpan={2}
                      className="px-4 py-2.5 text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium"
                    >
                      Lifetime
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-primary font-medium">
                      {formatCAD(rollup.lifetimeRevenue)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </Section>

          {introduced.length > 0 && (
            <Section title={`Introduced clients (${introduced.length})`}>
              {isMobile ? (
                <div className="divide-y divide-border-faint">
                  {introduced.map((r) => (
                    <Link
                      key={r.contact.id}
                      href={`/crm/${r.contact.id}`}
                      className="flex items-baseline justify-between gap-3 px-5 py-4 min-h-[40px] hover:bg-surface-muted/40 transition-colors duration-fast"
                    >
                      <span className="text-text-primary font-medium truncate">
                        {r.contact.name}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block tabular-nums text-text-primary">
                          {formatCAD(r.lifetimeRevenue)}
                        </span>
                        <span className="block text-xs tabular-nums text-text-tertiary">
                          {r.payerJobs.length} project{r.payerJobs.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-muted">
                      <Th>Name</Th>
                      <Th align="right">Lifetime revenue</Th>
                      <Th align="right">Projects</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {introduced.map((r, idx) => (
                      <tr
                        key={r.contact.id}
                        className={cn(
                          "hover:bg-surface-muted/40 transition-colors duration-fast",
                          idx > 0 && "border-t border-[rgba(26,25,22,0.05)]"
                        )}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/crm/${r.contact.id}`}
                            className="text-text-primary font-medium hover:text-accent transition-colors duration-fast"
                          >
                            {r.contact.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                          {formatCAD(r.lifetimeRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                          {r.payerJobs.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}
        </div>

        {/* Quiet sidebar: profile facts. */}
        <aside className="space-y-6">
          <Section title="Profile">
            <dl className="px-5 py-4 space-y-3 text-sm">
              <Fact label="Kind" value={contact.kind === "org" ? "Organization" : "Person"} />
              {contact.emails[0] && (
                <Fact
                  label="Email"
                  value={
                    <a
                      href={`mailto:${contact.emails[0].value}`}
                      className="inline-flex items-center gap-1.5 text-text-primary hover:text-accent transition-colors duration-fast"
                    >
                      <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {contact.emails[0].value}
                    </a>
                  }
                />
              )}
              {contact.phones[0] && (
                <Fact
                  label="Phone"
                  value={
                    <a
                      href={`tel:${contact.phones[0].value}`}
                      className="inline-flex items-center gap-1.5 text-text-primary hover:text-accent transition-colors duration-fast"
                    >
                      <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {contact.phones[0].value}
                    </a>
                  }
                />
              )}
              {contact.address && <Fact label="Address" value={contact.address} />}
              {contact.website && (
                <Fact
                  label="Website"
                  value={
                    <a
                      href={
                        contact.website.startsWith("http")
                          ? contact.website
                          : `https://${contact.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-text-primary hover:text-accent transition-colors duration-fast"
                    >
                      {contact.website}
                      <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                    </a>
                  }
                />
              )}
              {introducedBy && (
                <Fact
                  label="Introduced by"
                  value={
                    <Link
                      href={`/crm/${introducedBy.id}`}
                      className="inline-flex items-center gap-1.5 text-text-primary hover:text-accent transition-colors duration-fast"
                    >
                      <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {introducedBy.name}
                    </Link>
                  }
                />
              )}
              <Fact
                label="Last touched"
                value={
                  <span className="inline-flex items-center gap-1.5 text-text-secondary tabular-nums">
                    <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {formatLastTouched(contact.lastTouchedAt)}
                  </span>
                }
              />
            </dl>
          </Section>

          {contact.notes && (
            <Section title="Notes">
              <p className="px-5 py-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                {contact.notes}
              </p>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-2xl shadow-resting overflow-hidden">
      <div className="px-5 py-3 bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium pt-0.5 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-text-primary text-right min-w-0">{value}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-label uppercase text-text-tertiary font-medium",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}
