import type { Job, CostLine } from "@shared/lib/types";
import { newActivity } from "@features/jobs/lib/activity";
import { formatCAD } from "@shared/lib/format";
import type { LineItem, CabinetSummary } from "./types";
import type { EstimateTotals } from "./totals";
import { totalCabinetCount, totalCabinetLinearFt } from "./types";

type Input = {
  client: string;
  project: string;
  lines: LineItem[];
  overheadPct: number;
  totals: EstimateTotals;
  existingJobs: Job[];
  cabinetSummary: CabinetSummary;
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
  } = input;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const code = nextJobCode(existingJobs);

  // The job-level CostLine schema is still (materials | labour | overhead),
  // so we collapse the estimator's per-line cost breakdown into those buckets
  // — this keeps reports and P&L stable.
  const costs: CostLine[] = [
    {
      id: "c-mat",
      category: "materials",
      label: "Materials (estimator)",
      amount: totals.costs.materials,
    },
    {
      id: "c-lab",
      category: "labour",
      label: "Labour (estimator)",
      amount: totals.costs.labour,
    },
    {
      id: "c-oh",
      category: "overhead",
      label: `Overhead (${overheadPct}%)`,
      amount: totals.overhead,
    },
  ];

  const installDate = new Date();
  installDate.setDate(installDate.getDate() + 45);

  const issued = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);

  const cabCount = totalCabinetCount(cabinetSummary);
  const cabLf = totalCabinetLinearFt(cabinetSummary);
  const cabNote =
    cabCount > 0
      ? ` · ${cabCount} cabinets, ${cabLf.toFixed(2)} lf`
      : "";

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
    revenue: Math.round(totals.quoted * 100) / 100,
    costs,
    notes:
      `Created from estimator with ${lines.length} line item(s); effective margin ${totals.effectiveMarginPct.toFixed(1)}%` +
      cabNote,
    activity: [
      newActivity(
        "note",
        `Job created from estimator at price ${formatCAD(totals.quoted)}.`
      ),
    ],
    invoice: {
      number: `INV-${code.slice(3)}`,
      issuedDate: issued.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      lineItems: lines.map((l, idx) => {
        const sub = totals.lineSubtotals[idx];
        return {
          description: l.item || l.description || "Line item",
          qty: l.qty, // invoice shows finished qty (what the customer asked for)
          unitPrice: sub.price / Math.max(1, l.qty),
        };
      }),
    },
  };
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
