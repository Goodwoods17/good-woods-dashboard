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
import {
  QUOTE_SECTIONS,
  SECTION_LABELS,
  type SectionId,
  type SectionToggles,
} from "@features/estimator/lib/sections";
import { ProjectSection } from "./ProjectSection";
import { LineItemsTable } from "./LineItemsTable";
import { MarkupSection } from "./MarkupSection";
import { CabinetSummary } from "./CabinetSummary";
import { QuoteSummary } from "./QuoteSummary";

// Tiny helper for IDs.
function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function EstimatorView() {
  const router = useRouter();
  const { createJob, jobs } = useJobs();

  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [overheadPct, setOverheadPct] = useState(8);
  const [defaultMarkupPct, setDefaultMarkupPct] = useState(DEFAULT_MARKUP_PCT);

  // Section toggles (only "gc" is toggleable today; default OFF since most
  // jobs don't have GC subs). Adding more toggleable sections later is one
  // line in lib/sections.ts + a default here.
  const [sectionToggles, setSectionToggles] = useState<SectionToggles>({
    gc: false,
  });

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
      category: "CNC",
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

  function addLineInSection(sectionLabel: string) {
    // Best-guess default unit per section so the user types less.
    const unitGuess: Record<string, LineItem["unit"]> = {
      Materials: "ea",
      Hardware: "ea",
      CNC: "hr",
      "Doors & Faces": "sqft",
      Assembly: "hr",
      Finishing: "sqft",
      Delivery: "ea",
      Install: "hr",
      "GC Subcontractors": "ea",
    };

    setLines((prev) => [
      ...prev,
      {
        id: newId("l"),
        category: sectionLabel,
        item: "",
        qty: 1,
        unit: unitGuess[sectionLabel] ?? "ea",
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

  function toggleSection(id: SectionId, next: boolean) {
    setSectionToggles((prev) => ({ ...prev, [id]: next }));
  }

  function updateCabinetSummary(patch: Partial<CabinetSummaryT>) {
    setCabinetSummary((prev) => ({ ...prev, ...patch }));
  }

  // Lines that contribute to totals — excludes any line whose section
  // is toggleable and currently off.
  const activeLines = useMemo(() => {
    return lines.filter((l) => {
      const sec = QUOTE_SECTIONS.find((s) => s.label === l.category);
      if (!sec?.toggleable) return true;
      return Boolean(sectionToggles[sec.id]);
    });
  }, [lines, sectionToggles]);

  const totals = useMemo(
    () => computeTotals(activeLines, overheadPct),
    [activeLines, overheadPct]
  );

  // For the SectionBlock components, we still need subtotals for ALL lines
  // (including disabled GC ones, since they're rendered greyed-out). Compute
  // a separate totals object on the full lines list so each section knows
  // what its lines would cost if enabled.
  const allLinesTotals = useMemo(
    () => computeTotals(lines, overheadPct),
    [lines, overheadPct]
  );

  // Category dropdown suggestions: the fixed 9 sections plus anything the
  // user has typed manually (so custom categories surface for re-use).
  const categorySuggestions = useMemo(() => {
    const used = lines.map((l) => l.category).filter(Boolean);
    return Array.from(new Set([...SECTION_LABELS, ...used]));
  }, [lines]);

  async function saveAsJob() {
    if (!client.trim() || !project.trim()) return;
    setSubmitting(true);
    const job = createJobFromEstimate({
      client,
      project,
      lines: activeLines, // only enabled-section lines are in the saved job
      overheadPct,
      totals,
      existingJobs: jobs,
      cabinetSummary,
    });
    await createJob(job);
    router.push(`/jobs/${job.id}`);
  }

  void DEFAULT_LABOUR_RATE; // kept for Phase 2 Catalog seeding

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
            lineSubtotals={allLinesTotals.lineSubtotals}
            categorySuggestions={categorySuggestions}
            sectionToggles={sectionToggles}
            onToggleSection={toggleSection}
            onAdd={addLineInSection}
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
