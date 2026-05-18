"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import {
  DEFAULT_LABOUR_RATE,
  DEFAULT_MARKUP_PCT,
  emptyCabinetSummary,
  type CabinetSummary as CabinetSummaryT,
  type LineItem,
} from "@features/estimator/lib/types";
import { computeTotals } from "@features/estimator/lib/totals";
import { createJobFromEstimate } from "@features/estimator/lib/createJobFromEstimate";
import { ProjectSection } from "./ProjectSection";
import { LineItemsTable } from "./LineItemsTable";
import { MarkupSection } from "./MarkupSection";
import { CabinetSummary } from "./CabinetSummary";
import { QuoteSummary } from "./QuoteSummary";

// Seed categories so the dropdown isn't empty on first use. As Andrew
// types new categories they get added to the suggestions live.
const SEED_CATEGORIES = [
  "Materials",
  "Doors",
  "Drawer Boxes",
  "Banding",
  "Fasteners",
  "Hinges",
  "Guides",
  "Legs",
  "Hardware",
  "Labour",
  "Add-On",
];

export function EstimatorView() {
  const router = useRouter();
  const { createJob, jobs } = useJobs();

  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [overheadPct, setOverheadPct] = useState(8);
  const [defaultMarkupPct, setDefaultMarkupPct] = useState(DEFAULT_MARKUP_PCT);
  const [lines, setLines] = useState<LineItem[]>([
    {
      id: "l1",
      category: "Materials",
      item: "5/8 Plywood Birch Prefinished",
      qty: 10,
      unit: "ea",
      unitPrice: 59.5,
      wastePct: 0,
      markupPct: DEFAULT_MARKUP_PCT,
    },
    {
      id: "l2",
      category: "Labour",
      item: "Machining",
      qty: 5.77,
      unit: "hr",
      unitPrice: 175,
      wastePct: 0,
      markupPct: DEFAULT_MARKUP_PCT,
    },
  ]);
  const [cabinetSummary, setCabinetSummary] = useState<CabinetSummaryT>(
    emptyCabinetSummary()
  );
  const [submitting, setSubmitting] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: `l${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        category: "",
        item: "",
        qty: 1,
        unit: "ea",
        unitPrice: 0,
        wastePct: 0,
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

  function updateCabinetSummary(patch: Partial<CabinetSummaryT>) {
    setCabinetSummary((prev) => ({ ...prev, ...patch }));
  }

  const totals = useMemo(
    () => computeTotals(lines, overheadPct),
    [lines, overheadPct]
  );

  // Categories suggested in the line-row dropdown: seed list ∪ whatever
  // the user has typed so far in this quote. Deduped.
  const categorySuggestions = useMemo(() => {
    const used = lines.map((l) => l.category).filter(Boolean);
    return Array.from(new Set([...SEED_CATEGORIES, ...used]));
  }, [lines]);

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
      cabinetSummary,
    });
    await createJob(job);
    router.push(`/jobs/${job.id}`);
  }

  // Mute unused import warning for DEFAULT_LABOUR_RATE — exported for
  // Phase 2 catalog seeding, not used here yet.
  void DEFAULT_LABOUR_RATE;

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
            categorySuggestions={categorySuggestions}
            onAdd={addLine}
            onUpdate={updateLine}
            onRemove={removeLine}
          />
          <MarkupSection
            overheadPct={overheadPct}
            defaultMarkupPct={defaultMarkupPct}
            onOverhead={setOverheadPct}
            onDefaultMarkup={setDefaultMarkupPct}
          />
          <CabinetSummary
            summary={cabinetSummary}
            onUpdate={updateCabinetSummary}
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
