"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import {
  DEFAULT_LABOUR_RATE,
  DEFAULT_MARKUP_PCT,
  type LineItem,
} from "@features/estimator/lib/types";
import { computeTotals } from "@features/estimator/lib/totals";
import { createJobFromEstimate } from "@features/estimator/lib/createJobFromEstimate";
import { ProjectSection } from "./ProjectSection";
import { LineItemsTable } from "./LineItemsTable";
import { MarkupSection } from "./MarkupSection";
import { QuoteSummary } from "./QuoteSummary";

export function EstimatorView() {
  const router = useRouter();
  const { createJob, jobs } = useJobs();
  const { materials } = useCatalog();

  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [overheadPct, setOverheadPct] = useState(8);
  const [defaultMarkupPct, setDefaultMarkupPct] = useState(DEFAULT_MARKUP_PCT);
  const [lines, setLines] = useState<LineItem[]>([
    {
      id: "l1",
      description: "Upper cabinets — 5 boxes",
      qty: 1,
      materialId: materials[0]?.id ?? null,
      materialPricePerSqft: materials[0]?.pricePerSqft ?? 0,
      labourHours: 18,
      labourRate: DEFAULT_LABOUR_RATE,
      markupPct: DEFAULT_MARKUP_PCT,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: `l${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        description: "",
        qty: 1,
        materialId: materials[0]?.id ?? null,
        materialPricePerSqft: materials[0]?.pricePerSqft ?? 0,
        labourHours: 0,
        labourRate: DEFAULT_LABOUR_RATE,
        markupPct: defaultMarkupPct,
      },
    ]);
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function pickMaterial(lineId: string, materialId: string) {
    const m = materials.find((mat) => mat.id === materialId);
    if (!m) return;
    updateLine(lineId, {
      materialId: m.id,
      materialPricePerSqft: m.pricePerSqft,
    });
  }

  const totals = useMemo(
    () => computeTotals(lines, overheadPct),
    [lines, overheadPct]
  );

  async function saveAsJob() {
    if (!client.trim() || !project.trim()) return;
    setSubmitting(true);
    const job = createJobFromEstimate({
      client,
      project,
      lines,
      overheadPct,
      totals,
      existingJobs: jobs,
    });
    await createJob(job);
    router.push(`/jobs/${job.id}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Estimator"
        title="New estimate"
        subtitle="Direct cost × per-line markup + overhead = quoted price. Convert to a Job in one click."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 max-w-6xl">
        <div className="space-y-5">
          <ProjectSection
            client={client}
            project={project}
            onClient={setClient}
            onProject={setProject}
          />
          <LineItemsTable
            lines={lines}
            lineSubtotals={totals.lineSubtotals}
            materials={materials}
            onAdd={addLine}
            onUpdate={updateLine}
            onRemove={removeLine}
            onPickMaterial={pickMaterial}
          />
          <MarkupSection
            overheadPct={overheadPct}
            defaultMarkupPct={defaultMarkupPct}
            onOverhead={setOverheadPct}
            onDefaultMarkup={setDefaultMarkupPct}
          />
        </div>

        <QuoteSummary
          totals={totals}
          overheadPct={overheadPct}
          canSave={Boolean(client.trim() && project.trim())}
          submitting={submitting}
          onSave={saveAsJob}
        />
      </div>
    </>
  );
}
