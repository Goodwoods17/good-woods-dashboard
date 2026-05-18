"use client";

import { useMemo } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { formatCAD } from "@shared/lib/format";
import { computeClients } from "@features/crm/lib/aggregate";
import { ClientsTable } from "./ClientsTable";
import { EmptyState } from "./EmptyState";

export function CrmView() {
  const { jobs, loading } = useJobs();

  const clients = useMemo(() => computeClients(jobs), [jobs]);
  const totalRevenue = clients.reduce((s, c) => s + c.totalRevenue, 0);

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        subtitle={`${clients.length} unique client${clients.length === 1 ? "" : "s"} · ${formatCAD(totalRevenue)} total billed`}
      />
      <div className="px-8 py-6 max-w-6xl">
        {loading ? (
          <div className="bg-surface border border-border rounded-lg h-48 animate-pulse" />
        ) : clients.length === 0 ? (
          <EmptyState />
        ) : (
          <ClientsTable clients={clients} />
        )}

        <p className="text-xs text-text-tertiary mt-4 px-1">
          Derived from job records. Standalone client / contact CRUD lands when
          the first business-development hire arrives.
        </p>
      </div>
    </>
  );
}
