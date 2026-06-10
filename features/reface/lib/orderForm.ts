/**
 * Fill New Surrey's "Wood Doors Order Form" (.xlsx) from a project's measured
 * doors + drawer fronts. Client-side only: loads the bundled blank template,
 * writes cells while preserving the form's branding/merges/layout, and returns
 * one buffer per form (doors overflow > 23 or drawer fronts > 13 spill onto
 * additional copies).
 *
 * Cell map verified against the template (sheet "Wood", 2026-06-04):
 *   Header  — Order Date I3; product spec C6..C13; customer PO K6 / name K8 /
 *             address K9; grain K16/K17 (door) + N16/N17 (drawer); boring M20..M22.
 *   Doors   — left table, rows 16..38 (Sr 1-23): B=Qty C=Height D=Wide E=Details.
 *   Drawers — right table, rows 25..37 (Sr 24-36): I=Qty J=Height L=Wide M=Details.
 * End panels + toe kicks are NOT on this form (separate form, later phase).
 */
import type { Workbook, Worksheet } from "exceljs";
import { formatFraction } from "./dimensions";
import { ORDERABLE_KINDS } from "./pricing";
import type { OrderSettings, RefaceElement, RefaceProject } from "./types";

export type OrderCustomer = { name: string; address: string };

const TEMPLATE_URL = "/reface/wood-doors-order-form.xlsx";
const SHEET_NAME = "Wood";

const MAX_DOORS_PER_FORM = 23;
const MAX_DRAWERS_PER_FORM = 13;
const DOOR_FIRST_ROW = 16; // Sr. No. 1
const DRAWER_FIRST_ROW = 25; // Sr. No. 24

export type GeneratedForm = { filename: string; buffer: ArrayBuffer };

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function orderedByKind(project: RefaceProject) {
  const all = project.photos
    .flatMap((p) => p.elements)
    .filter((e) => ORDERABLE_KINDS.includes(e.kind))
    .sort((a, b) => a.sort - b.sort);
  return {
    doors: all.filter((e) => e.kind === "door"),
    drawers: all.filter((e) => e.kind === "drawer"),
  };
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fillHeader(ws: Worksheet, s: OrderSettings, customer: OrderCustomer) {
  ws.getCell("I3").value = todayISODate();

  // Product information (left column values).
  ws.getCell("C6").value = s.woodSpecies;
  ws.getCell("C7").value = s.modelNo;
  ws.getCell("C8").value = s.stileSize;
  ws.getCell("C9").value = s.railSize;
  ws.getCell("C10").value = s.insideProfile;
  ws.getCell("C11").value = s.outsideProfile;
  ws.getCell("C12").value = s.panelProfile;
  ws.getCell("C13").value = s.finish;

  // Customer information (Company/Phone/Email are template constants — leave).
  ws.getCell("K6").value = s.customerPO;
  ws.getCell("K8").value = customer.name;
  ws.getCell("K9").value = customer.address;

  // Grain checkboxes (true on the selected direction).
  ws.getCell("K16").value = s.doorGrain === "vertical";
  ws.getCell("K17").value = s.doorGrain === "horizontal";
  ws.getCell("N16").value = s.drawerGrain === "vertical";
  ws.getCell("N17").value = s.drawerGrain === "horizontal";

  // Hinge boring.
  ws.getCell("M20").value = s.hingeBoring.holeCenter;
  ws.getCell("M21").value = s.hingeBoring.edge;
  ws.getCell("M22").value = s.hingeBoring.pilotHoleSize;
}

function fillDoors(ws: Worksheet, doors: RefaceElement[]) {
  doors.forEach((el, i) => {
    const r = DOOR_FIRST_ROW + i;
    ws.getCell(`B${r}`).value = el.qty;
    ws.getCell(`C${r}`).value = formatFraction(el.heightIn);
    ws.getCell(`D${r}`).value = formatFraction(el.widthIn);
    ws.getCell(`E${r}`).value = el.location;
  });
}

function fillDrawers(ws: Worksheet, drawers: RefaceElement[]) {
  drawers.forEach((el, i) => {
    const r = DRAWER_FIRST_ROW + i;
    ws.getCell(`I${r}`).value = el.qty;
    ws.getCell(`J${r}`).value = formatFraction(el.heightIn);
    ws.getCell(`L${r}`).value = formatFraction(el.widthIn);
    ws.getCell(`M${r}`).value = el.location;
  });
}

async function loadTemplate(): Promise<{ ExcelJS: typeof import("exceljs"); buffer: ArrayBuffer }> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`Couldn't load order-form template (${res.status})`);
  const buffer = await res.arrayBuffer();
  const ExcelJS = (await import("exceljs")).default;
  return { ExcelJS, buffer };
}

function slug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "order"
  );
}

/**
 * Build the filled Wood Doors order form(s). Returns one form per overflow page;
 * the common case is a single form. Each page repeats the full header.
 */
export async function generateWoodDoorsForms(
  project: RefaceProject,
  customer: OrderCustomer
): Promise<GeneratedForm[]> {
  const { ExcelJS, buffer } = await loadTemplate();
  const { doors, drawers } = orderedByKind(project);

  const doorPages = chunk(doors, MAX_DOORS_PER_FORM);
  const drawerPages = chunk(drawers, MAX_DRAWERS_PER_FORM);
  const pageCount = Math.max(doorPages.length, drawerPages.length);

  const forms: GeneratedForm[] = [];
  for (let page = 0; page < pageCount; page++) {
    const wb: Workbook = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];

    fillHeader(ws, project.orderSettings, customer);
    fillDoors(ws, doorPages[page] ?? []);
    fillDrawers(ws, drawerPages[page] ?? []);

    const out = await wb.xlsx.writeBuffer();
    const suffix = pageCount > 1 ? `-${page + 1}of${pageCount}` : "";
    forms.push({
      filename: `wood-doors-${slug(project.name)}${suffix}.xlsx`,
      buffer: out as ArrayBuffer,
    });
  }

  if (doors.length > MAX_DOORS_PER_FORM || drawers.length > MAX_DRAWERS_PER_FORM) {
    // No silent truncation — surface the spill that forced extra pages.
    console.warn(
      `Reface order form: ${doors.length} doors / ${drawers.length} drawer fronts exceed one form (max ${MAX_DOORS_PER_FORM}/${MAX_DRAWERS_PER_FORM}); generated ${pageCount} forms.`
    );
  }

  return forms;
}
