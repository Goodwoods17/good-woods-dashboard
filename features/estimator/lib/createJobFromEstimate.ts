import type { Job, CostLine } from "@shared/lib/types";
import { newActivity } from "@features/jobs/lib/activity";
import { formatCAD } from "@shared/lib/format";
import type { LineItem, CabinetSummary, Room } from "./types";
import type { EstimateTotals } from "./totals";
import type { EstimateTemplate } from "./templates";
import { totalCabinetCount, totalCabinetLinearFt } from "./types";

type Input = {
  client: string;
  project: string;
  lines: LineItem[];
  overheadPct: number;
  totals: EstimateTotals;
  existingJobs: Job[];
  cabinetSummary: CabinetSummary;
  rooms?: Room[];
  template?: EstimateTemplate;
};

export function createJobFromEstimate(input: Input): Job {
  const {
    client,
    project,
    lines,
    overheadPct,
    totals,
    existingJobs,
    cabinetSummary,
    rooms,
    template,
  } = input;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const code = nextJobCode(existingJobs);

  // The job-level CostLine schema is (materials | labour | overhead). We
  // also expose pre-work as a separate labour-flavoured bucket so margin
  // reports can see it isolated. The shipped Job type accepts free-form
  // category strings, so "prework" lands cleanly.
  const costs: CostLine[] = [
    {
      id: "c-mat",
      category: "materials",
      label: "Materials (estimator)",
      amount: round2(totals.costs.materials),
    },
    {
      id: "c-lab",
      category: "labour",
      label: "Labour (estimator)",
      amount: round2(totals.costs.labour),
    },
    {
      id: "c-oh",
      category: "overhead",
      label: `Overhead (${overheadPct}%)`,
      amount: round2(totals.overhead),
    },
  ];
  if (totals.costs.prework > 0) {
    costs.push({
      id: "c-prework",
      category: "labour",
      label: "Pre-work (internal, not billed)",
      amount: round2(totals.costs.prework),
    });
  }
  if (totals.contingency > 0) {
    // Contingency on the cost side too — it represents budgeted
    // unknowns that will likely materialize as labour.
    costs.push({
      id: "c-contingency",
      category: "labour",
      label: "Contingency budget",
      amount: round2(totals.contingency),
    });
  }

  const installDate = new Date();
  installDate.setDate(installDate.getDate() + 45);

  const issued = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);

  const cabCount = totalCabinetCount(cabinetSummary);
  const cabLf = totalCabinetLinearFt(cabinetSummary);
  const cabNote =
    cabCount > 0 ? ` · ${cabCount} cabinets, ${cabLf.toFixed(2)} lf` : "";

  // Filter out disabled rooms' lines + excluded-from-quote lines from the
  // invoice so the client only sees what they're paying for.
  const disabledRoomIds = new Set(
    (rooms ?? []).filter((r) => !r.enabled).map((r) => r.id),
  );
  const billableLines = lines.filter(
    (l) =>
      !(l.roomId && disabledRoomIds.has(l.roomId)) && !l.excludeFromQuote,
  );

  const roomsNote =
    rooms && rooms.length > 0
      ? ` · rooms: ${rooms
          .filter((r) => r.enabled)
          .map((r) => r.name)
          .join(", ")}`
      : "";

  const tplNote = template ? ` · template: ${template.name}` : "";

  return {
    id,
    code,
    name: project.trim(),
    client: client.trim(),
    address: "",
    template: "full_project",
    pipelineStatus: "sold",
    healthStatus: "on_track",
    currentMilestone: "sold",
    installDate: installDate.toISOString().slice(0, 10),
    revenue: round2(totals.quoted),
    costs,
    notes:
      `Created from estimator with ${lines.length} line(s); effective margin ${totals.effectiveMarginPct.toFixed(1)}%` +
      cabNote +
      roomsNote +
      tplNote,
    activity: [
      newActivity(
        "note",
        `Job created from estimator at price ${formatCAD(totals.quoted)}.`,
      ),
    ],
    invoice: {
      number: `INV-${code.slice(3)}`,
      issuedDate: issued.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      lineItems: billableLines.map((l) => {
        // Find this line's subtotal in totals — they share order with
        // the input lines array.
        const idx = lines.indexOf(l);
        const sub = totals.lineSubtotals[idx];
        return {
          description: [l.item || l.description || "Line item", maybeRoomLabel(l, rooms)]
            .filter(Boolean)
            .join(" — "),
          qty: l.qty,
          unitPrice: sub ? sub.price / Math.max(1, l.qty) : l.unitPrice,
        };
      }),
    },
  };
}

function maybeRoomLabel(l: LineItem, rooms?: Room[]): string {
  if (!l.roomId || !rooms) return "";
  const room = rooms.find((r) => r.id === l.roomId);
  return room ? room.name : "";
}

function nextJobCode(existingJobs: Job[]): string {
  const year = new Date().getFullYear();
  const prefix = `GW-${year}-`;
  const max = existingJobs
    .map((j) => j.code)
    .filter((c) => c.startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
