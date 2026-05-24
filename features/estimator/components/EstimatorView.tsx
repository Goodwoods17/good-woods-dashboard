"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import {
  emptyCabinetSummary,
  emptyDelivery,
  emptyDeficiencies,
  emptyPreWork,
  totalCabinetCount,
  DEFAULT_ASSEMBLY_MINUTES,
  DEFAULT_INSTALL_MINUTES,
  type CabinetSummary as CabinetSummaryT,
  type DeficienciesState,
  type DeliveryState,
  type LineItem,
  type PreWorkState,
  type Room,
} from "@features/estimator/lib/types";
import {
  computeDeliveryCost,
  computeDeficienciesCost,
  computePreWorkCost,
  computeTotals,
  deriveLabourHoursFromCabinets,
  partitionCabinetSummaryByRoom,
} from "@features/estimator/lib/totals";
import { logPricesFromEstimate } from "@features/catalog/lib/priceHistory";
import { createJobFromEstimate } from "@features/estimator/lib/createJobFromEstimate";
import {
  QUOTE_SECTIONS,
  type SectionId,
} from "@features/estimator/lib/sections";
import {
  defaultTemplate,
  isSectionActive,
  type EstimateTemplate,
} from "@features/estimator/lib/templates";
import { ProjectSection } from "./ProjectSection";
import { LineItemsTable } from "./LineItemsTable";
import { CabinetSummary } from "./CabinetSummary";
import { QuoteSummary } from "./QuoteSummary";
import { PreWorkBlock } from "./PreWorkBlock";
import { DeliveryCalculator } from "./DeliveryCalculator";
import { DeficienciesBlock } from "./DeficienciesBlock";
import { RoomsPanel } from "./RoomsPanel";
import { TemplatePicker, TemplateChip } from "./TemplatePicker";

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// Unit guess per section so a freshly-added line is one-touch sensible.
const UNIT_GUESS: Partial<Record<SectionId, LineItem["unit"]>> = {
  casework: "ea",
  cnc: "ea",
  doors: "sqft",
  face: "sqft",
  finishing: "sqft",
  assembly: "hr",
  install: "hr",
};

// Sections that get auto-derived from Cabinet Summary. The orchestrator
// synthesises a single line per section labelled with what was derived;
// user can edit or add more lines manually.
const AUTO_DERIVED_SECTIONS: SectionId[] = ["assembly", "install"];

export function EstimatorView() {
  const router = useRouter();
  const { createJob, jobs } = useJobs();
  const { settings } = useWorkspaceSettings();

  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<EstimateTemplate>(
    defaultTemplate(),
  );
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [prework, setPrework] = useState<PreWorkState>(emptyPreWork());
  const [delivery, setDelivery] = useState<DeliveryState>({
    ...emptyDelivery(),
    gasRatePerMile: settings.defaultGasRatePerMile,
  });
  const [deficiencies, setDeficiencies] = useState<DeficienciesState>(
    emptyDeficiencies(),
  );
  const [cabinetSummary, setCabinetSummary] = useState<CabinetSummaryT>(
    emptyCabinetSummary(),
  );

  const [lines, setLines] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const activeSectionIds = activeTemplate.activeSections;
  const overheadPct = settings.defaultOverheadPct;

  // ─── Manual line CRUD ────────────────────────────────────────────────
  function addLineInSection(sectionLabel: string) {
    const section = QUOTE_SECTIONS.find((s) => s.label === sectionLabel);
    const unit = (section && UNIT_GUESS[section.id]) ?? "ea";
    setLines((prev) => [
      ...prev,
      {
        id: newId("l"),
        category: sectionLabel,
        item: "",
        qty: 1,
        unit,
        unitPrice: 0,
        wastePct: 0,
        markupPct: settings.defaultMarkupPct,
      },
    ]);
  }
  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  // ─── Auto-derived Assembly + Install lines (per room) ────────────────
  // SYNTHESISED into the lines list each render. Partitioned by Cabinet
  // Summary roomId so the auto-derived labour respects room toggles —
  // a client saying "drop the bathroom" zeroes its assembly + install
  // hours along with the rest.
  const autoLines = useMemo<LineItem[]>(() => {
    if (totalCabinetCount(cabinetSummary) === 0) return [];
    const out: LineItem[] = [];
    const partitions = partitionCabinetSummaryByRoom(cabinetSummary);
    const assemblyOn = isSectionActive(activeTemplate, "assembly");
    const installOn = isSectionActive(activeTemplate, "install");
    const roomNameFor = (roomId: string | undefined) =>
      roomId
        ? (rooms.find((r) => r.id === roomId)?.name ?? "")
        : "";

    for (const [roomId, sub] of Array.from(partitions.entries())) {
      const roomKey = roomId ?? "all";
      const roomSuffix = roomId
        ? ` — ${roomNameFor(roomId) || "Room"}`
        : "";

      if (assemblyOn) {
        const hours = deriveLabourHoursFromCabinets(
          sub,
          DEFAULT_ASSEMBLY_MINUTES,
        );
        if (hours > 0) {
          out.push({
            id: `auto-assembly-${roomKey}`,
            category: "Assembly",
            item: `Cabinet assembly (auto)${roomSuffix}`,
            description: assemblyBreakdownLabel(sub),
            qty: round2(hours),
            unit: "hr",
            unitPrice: settings.labourRates.shopRate,
            wastePct: 0,
            markupPct: settings.defaultMarkupPct,
            roomId,
          });
        }
      }

      if (installOn) {
        const hours = deriveLabourHoursFromCabinets(
          sub,
          DEFAULT_INSTALL_MINUTES,
        );
        if (hours > 0) {
          out.push({
            id: `auto-install-${roomKey}`,
            category: "Install",
            item: `On-site install (auto)${roomSuffix}`,
            description: assemblyBreakdownLabel(sub),
            qty: round2(hours),
            unit: "hr",
            unitPrice: settings.labourRates.installRate,
            wastePct: 0,
            markupPct: settings.defaultMarkupPct,
            roomId,
          });
        }
      }
    }

    return out;
  }, [activeTemplate, cabinetSummary, rooms, settings]);

  // ─── Synthesised lines for the structured sections ───────────────────
  // Pre-work, Delivery, Deficiencies are entered via structured blocks
  // but become real lines in totals math + the saved Job invoice. This
  // keeps computeTotals + createJobFromEstimate simple — every cost is
  // a LineItem.
  const syntheticLines = useMemo<LineItem[]>(() => {
    const out: LineItem[] = [];

    // Pre-work: one line per filled slot. excludeFromQuote so it's
    // internal-only (counts in internalCost, not quoted).
    if (isSectionActive(activeTemplate, "prework")) {
      const pw = computePreWorkCost(prework, settings.labourRates);
      for (const slotId of Object.keys(pw.perSlot) as (keyof typeof pw.perSlot)[]) {
        const slot = pw.perSlot[slotId];
        if (slot.hours > 0) {
          out.push({
            id: `auto-prework-${slotId}`,
            category: "Pre-work",
            item: slot.label,
            description: prework[slotId].note,
            qty: round2(slot.hours),
            unit: "hr",
            unitPrice: settings.labourRates.designRate,
            wastePct: 0,
            markupPct: 0,
            excludeFromQuote: true,
          });
        }
      }
    }

    // Delivery: 3 sub-lines (gas, travel, loading) so totals naturally
    // show what's billed for. Default markup applies — Andrew can edit
    // per-line via the calculator (the structured block writes back).
    if (isSectionActive(activeTemplate, "delivery")) {
      const cd = computeDeliveryCost(
        delivery,
        totalCabinetCount(cabinetSummary),
        settings.labourRates,
      );
      if (delivery.miles > 0) {
        out.push({
          id: "auto-delivery-gas",
          category: "Packing & delivery",
          item: "Gas",
          description: `${(delivery.miles * 2).toFixed(1)} mi round trip @ $${delivery.gasRatePerMile}/mi`,
          qty: 1,
          unit: "ea",
          unitPrice: cd.gasCost,
          wastePct: 0,
          markupPct: settings.defaultMarkupPct,
        });
      }
      if (delivery.travelHours > 0) {
        out.push({
          id: "auto-delivery-travel",
          category: "Packing & delivery",
          item: "Travel time",
          description: `${delivery.travelHours} hrs @ install rate`,
          qty: delivery.travelHours,
          unit: "hr",
          unitPrice: settings.labourRates.installRate,
          wastePct: 0,
          markupPct: settings.defaultMarkupPct,
        });
      }
      if (cd.loadingHours > 0) {
        out.push({
          id: "auto-delivery-loading",
          category: "Packing & delivery",
          item: "Loading time",
          description: `${totalCabinetCount(cabinetSummary)} cabinets × ${delivery.loadMinutesPerCabinet} min @ shop rate`,
          qty: round2(cd.loadingHours),
          unit: "hr",
          unitPrice: settings.labourRates.shopRate,
          wastePct: 0,
          markupPct: settings.defaultMarkupPct,
        });
      }
    }

    // Deficiencies hours budget becomes one line. The contingency % is
    // passed to computeTotals as an option (added on top of quoted total).
    if (
      isSectionActive(activeTemplate, "deficiencies") &&
      deficiencies.hoursBudget > 0
    ) {
      const cd = computeDeficienciesCost(deficiencies, settings.labourRates);
      out.push({
        id: "auto-deficiencies-budget",
        category: "Deficiencies",
        item: "Touch-up hours budget",
        description: "Predictable allowance for typical end-of-job items",
        qty: deficiencies.hoursBudget,
        unit: "hr",
        unitPrice: settings.labourRates.installRate,
        wastePct: 0,
        markupPct: settings.defaultMarkupPct,
      });
      void cd; // kept for reference if we later want to display budgetCost separately
    }

    return out;
  }, [
    activeTemplate,
    prework,
    delivery,
    cabinetSummary,
    deficiencies,
    settings,
  ]);

  // Combine: user-typed lines + auto-derived + structured synthetics. The
  // order matters for the LineItemRow positional zip with subtotals.
  const allLines = useMemo<LineItem[]>(
    () => [...lines, ...autoLines, ...syntheticLines],
    [lines, autoLines, syntheticLines],
  );

  const totals = useMemo(
    () =>
      computeTotals(allLines, {
        overheadPct,
        rooms,
        contingencyPct: isSectionActive(activeTemplate, "deficiencies")
          ? deficiencies.contingencyPct
          : 0,
      }),
    [allLines, overheadPct, rooms, activeTemplate, deficiencies.contingencyPct],
  );

  const preworkCostBreakdown = useMemo(
    () => computePreWorkCost(prework, settings.labourRates),
    [prework, settings.labourRates],
  );

  // Quoted total BEFORE contingency, for the Deficiencies preview.
  const quotedPreContingency = totals.quoted - totals.contingency;

  // Category dropdown suggestions: active-section labels first, then any
  // custom typed categories.
  const categorySuggestions = useMemo(() => {
    const activeLabels = QUOTE_SECTIONS.filter((s) =>
      activeSectionIds.includes(s.id),
    ).map((s) => s.label);
    const used = lines.map((l) => l.category).filter(Boolean);
    return Array.from(new Set([...activeLabels, ...used]));
  }, [activeSectionIds, lines]);

  // ─── Structured-section content passed into LineItemsTable ────────────
  const structuredContent: Partial<Record<SectionId, ReactNode>> = {};
  const structuredSubtotals: Partial<
    Record<SectionId, { cost: number; price: number }>
  > = {};

  if (isSectionActive(activeTemplate, "prework")) {
    structuredContent.prework = (
      <PreWorkBlock prework={prework} onUpdate={setPrework} />
    );
    structuredSubtotals.prework = {
      cost: preworkCostBreakdown.totalCost,
      price: 0, // pre-work isn't on the quote
    };
  }
  if (isSectionActive(activeTemplate, "delivery")) {
    structuredContent.delivery = (
      <DeliveryCalculator
        delivery={delivery}
        cabinetSummary={cabinetSummary}
        onUpdate={(patch) => setDelivery((prev) => ({ ...prev, ...patch }))}
      />
    );
    const cd = computeDeliveryCost(
      delivery,
      totalCabinetCount(cabinetSummary),
      settings.labourRates,
    );
    structuredSubtotals.delivery = {
      cost: cd.total,
      price: cd.total * (1 + settings.defaultMarkupPct / 100),
    };
  }
  if (isSectionActive(activeTemplate, "deficiencies")) {
    structuredContent.deficiencies = (
      <DeficienciesBlock
        deficiencies={deficiencies}
        quotedTotal={quotedPreContingency}
        onUpdate={(patch) =>
          setDeficiencies((prev) => ({ ...prev, ...patch }))
        }
      />
    );
    const cd = computeDeficienciesCost(deficiencies, settings.labourRates);
    structuredSubtotals.deficiencies = {
      cost: cd.budgetCost,
      price:
        cd.budgetCost * (1 + settings.defaultMarkupPct / 100) +
        totals.contingency,
    };
  }

  async function saveAsJob() {
    if (!client.trim() || !project.trim()) return;
    setSubmitting(true);
    const job = createJobFromEstimate({
      client,
      project,
      lines: allLines,
      overheadPct,
      totals,
      existingJobs: jobs,
      cabinetSummary,
      rooms,
      template: activeTemplate,
    });
    await createJob(job);
    // Append a price-history row for every catalogId-tagged line. Builds
    // the dataset behind the "Last bid: $X on Job #N" tooltip + 90-day
    // average comparisons. Failures are non-critical to job creation.
    try {
      logPricesFromEstimate(
        allLines
          .filter((l) => l.catalogId)
          .map((l) => ({
            catalogId: l.catalogId,
            supplier: l.supplierSnapshot,
            unitPrice: l.unitPrice,
          })),
        job.id,
      );
    } catch {
      /* silent — history is non-critical */
    }
    router.push(`/jobs/${job.id}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Estimator"
        title="New estimate"
        subtitle="Direct cost × per-line markup + overhead + contingency = quoted price. Convert to a Job in one click."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-7xl">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <TemplateChip
              template={activeTemplate}
              onClickChange={() => setTemplatePickerOpen(true)}
            />
            <span className="text-[11px] text-text-tertiary">
              {activeTemplate.activeSections.length} section(s) active. Hidden
              sections won&apos;t price into this quote.
            </span>
          </div>

          <ProjectSection
            client={client}
            project={project}
            onClient={setClient}
            onProject={setProject}
          />

          <RoomsPanel
            rooms={rooms}
            perRoom={totals.perRoom}
            onChange={setRooms}
          />

          <LineItemsTable
            lines={allLines}
            lineSubtotals={totals.lineSubtotals}
            categorySuggestions={categorySuggestions}
            activeSectionIds={activeSectionIds}
            rooms={rooms}
            structuredContent={structuredContent}
            structuredSubtotals={structuredSubtotals}
            onAdd={addLineInSection}
            onUpdate={updateLine}
            onRemove={removeLine}
          />

          <CabinetSummary
            summary={cabinetSummary}
            rooms={rooms}
            onUpdate={(patch) =>
              setCabinetSummary((prev) => ({ ...prev, ...patch }))
            }
          />
        </div>

        <QuoteSummary
          totals={totals}
          overheadPct={overheadPct}
          contingencyPct={
            isSectionActive(activeTemplate, "deficiencies")
              ? deficiencies.contingencyPct
              : 0
          }
          preworkCost={preworkCostBreakdown.totalCost}
          preworkHours={preworkCostBreakdown.totalHours}
          rooms={rooms}
          canSave={Boolean(client.trim() && project.trim())}
          submitting={submitting}
          onSave={saveAsJob}
        />
      </div>

      <TemplatePicker
        open={templatePickerOpen}
        current={activeTemplate}
        onPick={(tpl) => setActiveTemplate(tpl)}
        onClose={() => setTemplatePickerOpen(false)}
      />
      {/* No persistence yet — silence unused var warning for AUTO_DERIVED_SECTIONS */}
      <span hidden>{AUTO_DERIVED_SECTIONS.length}</span>
    </>
  );
}

function assemblyBreakdownLabel(s: CabinetSummaryT): string {
  const parts: string[] = [];
  if (s.base.count > 0) parts.push(`${s.base.count} base`);
  if (s.wall.count > 0) parts.push(`${s.wall.count} wall`);
  if (s.tall.count > 0) parts.push(`${s.tall.count} tall`);
  if (s.island.count > 0) parts.push(`${s.island.count} island`);
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
