"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useContacts } from "@features/contacts/lib/contactsStore";
import { rollupContacts } from "@features/contacts/lib/aggregate";
import { ContactsList } from "@features/contacts/components/ContactsList";
import { formatCAD } from "@shared/lib/format";
import { EmptyState } from "./EmptyState";

export function CrmView() {
  const { jobs, loading: jobsLoading } = useJobs();
  const { contacts, loading: contactsLoading } = useContacts();

  const loading = jobsLoading || contactsLoading;
  const rollups = useMemo(() => rollupContacts(contacts, jobs), [contacts, jobs]);
  const totalRevenue = rollups.reduce((s, r) => s + r.lifetimeRevenue, 0);
  const anchorCount = rollups.filter((r) => r.contact.isAnchor).length;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        subtitle={`${rollups.length} active . ${anchorCount} anchor${anchorCount === 1 ? "" : "s"} . ${formatCAD(totalRevenue)} lifetime billed`}
        actions={
          <Link
            href="/crm/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New client
          </Link>
        }
      />
      <div className="px-8 py-6 max-w-6xl">
        {loading ? (
          <div className="bg-white rounded-xl shadow-resting h-48 animate-pulse" />
        ) : rollups.length === 0 ? (
          <EmptyState />
        ) : (
          <ContactsList rollups={rollups} />
        )}
      </div>
    </>
  );
}
