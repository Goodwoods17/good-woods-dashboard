/**
 * CSV + plain-text exports of a project's measured elements, generalized over
 * element kinds (ported from door-sizer's exportDoorsToCSV / exportDoorsToText).
 * Pure: returns strings; the caller handles the download.
 */
import { formatFraction } from "./dimensions";
import { elementSqft } from "./sqft";
import { ELEMENT_KIND_LABELS, type RefaceElement, type RefaceProject } from "./types";

function allElements(project: RefaceProject): RefaceElement[] {
  return project.photos.flatMap((p) => p.elements);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function elementsToCSV(project: RefaceProject): string {
  const header = ["Ref", "Type", "Location", "Width", "Height", "Qty", "SqFt", "Notes"];
  const rows = allElements(project).map((el) => [
    el.label,
    ELEMENT_KIND_LABELS[el.kind],
    el.location,
    formatFraction(el.widthIn),
    formatFraction(el.heightIn),
    String(el.qty),
    elementSqft(el).toFixed(2),
    el.notes,
  ]);
  return [header, ...rows].map((r) => r.map((c) => csvCell(c)).join(",")).join("\r\n");
}

export function elementsToText(project: RefaceProject): string {
  const lines: string[] = [`${project.name} — measurements`, ""];
  for (const el of allElements(project)) {
    const dims =
      el.widthIn !== null && el.heightIn !== null
        ? `${formatFraction(el.widthIn)}" × ${formatFraction(el.heightIn)}"`
        : "(no dimensions)";
    const qty = el.qty > 1 ? ` ×${el.qty}` : "";
    const loc = el.location ? ` — ${el.location}` : "";
    lines.push(`${el.label}  ${ELEMENT_KIND_LABELS[el.kind]}  ${dims}${qty}${loc}`);
  }
  return lines.join("\n");
}
