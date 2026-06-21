/**
 * Supabase row <-> Reface domain-type conversion, plus the three table names.
 *
 * The schema is hierarchical (project -> photos -> elements) but PostgREST
 * returns each table flat, so {@link assembleProjects} stitches the three row
 * sets into the nested {@link RefaceProject} shape the store and UI consume.
 */
import {
  defaultOrderSettings,
  type ElementBox,
  type ElementKind,
  type HingeSlot,
  type OrderSettings,
  type RefaceElement,
  type RefacePhoto,
  type RefaceProject,
} from "./types";

export const REFACE_PROJECTS_TABLE = "reface_projects";
export const REFACE_PHOTOS_TABLE = "reface_photos";
export const REFACE_ELEMENTS_TABLE = "reface_elements";

// ---------------------------------------------------------------------------
// Row shapes (snake_case, mirror supabase/migrations/20260604_reface_studio.sql)
// ---------------------------------------------------------------------------

export type RefaceProjectRow = {
  id: string;
  name: string;
  job_id: string | null;
  order_settings: Partial<OrderSettings> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RefacePhotoRow = {
  id: string;
  project_id: string;
  storage_path: string;
  width: number;
  height: number;
  sort: number;
  created_at: string;
};

export type RefaceElementRow = {
  id: string;
  photo_id: string;
  kind: ElementKind;
  label: string;
  location: string;
  width_in: number | string | null;
  height_in: number | string | null;
  qty: number;
  box: ElementBox | null;
  ai_guess: boolean;
  mullion_sections: number;
  dividers: number;
  notes: string;
  style: string | null;
  material: string | null;
  hinges: HingeSlot[] | null;
  hinge_positions: Partial<Record<HingeSlot, number>> | null;
  sort: number;
  created_at: string;
};

// Postgres `numeric` can arrive as a string; normalize to number | null.
function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

export function rowToElement(row: RefaceElementRow): RefaceElement {
  return {
    id: row.id,
    photoId: row.photo_id,
    kind: row.kind,
    label: row.label ?? "",
    location: row.location ?? "",
    widthIn: toNum(row.width_in),
    heightIn: toNum(row.height_in),
    qty: row.qty ?? 1,
    box: row.box ?? null,
    aiGuess: row.ai_guess,
    mullionSections: row.mullion_sections ?? 0,
    dividers: row.dividers ?? 0,
    notes: row.notes ?? "",
    style: row.style ?? undefined,
    material: row.material ?? undefined,
    hinges: row.hinges ?? undefined,
    hingePositions: row.hinge_positions ?? undefined,
    sort: row.sort ?? 0,
    createdAt: row.created_at,
  };
}

export function elementToRow(el: RefaceElement): RefaceElementRow {
  return {
    id: el.id,
    photo_id: el.photoId,
    kind: el.kind,
    label: el.label,
    location: el.location,
    width_in: el.widthIn,
    height_in: el.heightIn,
    qty: el.qty,
    box: el.box,
    ai_guess: el.aiGuess,
    mullion_sections: el.mullionSections,
    dividers: el.dividers,
    notes: el.notes,
    style: el.style ?? null,
    material: el.material ?? null,
    hinges: el.hinges ?? null,
    hinge_positions: el.hingePositions ?? null,
    sort: el.sort,
    created_at: el.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

export function rowToPhoto(row: RefacePhotoRow, elements: RefaceElement[]): RefacePhoto {
  return {
    id: row.id,
    projectId: row.project_id,
    storagePath: row.storage_path,
    width: row.width ?? 0,
    height: row.height ?? 0,
    sort: row.sort ?? 0,
    createdAt: row.created_at,
    elements,
  };
}

// `elements` lives in its own table; strip it before writing the photo row.
export function photoToRow(photo: RefacePhoto): RefacePhotoRow {
  return {
    id: photo.id,
    project_id: photo.projectId,
    storage_path: photo.storagePath,
    width: photo.width,
    height: photo.height,
    sort: photo.sort,
    created_at: photo.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function rowToProject(row: RefaceProjectRow, photos: RefacePhoto[]): RefaceProject {
  return {
    id: row.id,
    name: row.name,
    jobId: row.job_id,
    // Merge over defaults so partial / legacy settings always normalize.
    orderSettings: { ...defaultOrderSettings(), ...(row.order_settings ?? {}) },
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
  };
}

// `photos` live in their own table; strip them before writing the project row.
export function projectToRow(project: RefaceProject): RefaceProjectRow {
  return {
    id: project.id,
    name: project.name,
    job_id: project.jobId,
    order_settings: project.orderSettings,
    notes: project.notes,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Assemble flat row sets -> nested projects
// ---------------------------------------------------------------------------

export function assembleProjects(
  projectRows: RefaceProjectRow[],
  photoRows: RefacePhotoRow[],
  elementRows: RefaceElementRow[]
): RefaceProject[] {
  const elementsByPhoto = new Map<string, RefaceElement[]>();
  for (const row of elementRows) {
    const list = elementsByPhoto.get(row.photo_id) ?? [];
    list.push(rowToElement(row));
    elementsByPhoto.set(row.photo_id, list);
  }

  const photosByProject = new Map<string, RefacePhoto[]>();
  for (const row of photoRows) {
    const photo = rowToPhoto(row, elementsByPhoto.get(row.id) ?? []);
    const list = photosByProject.get(row.project_id) ?? [];
    list.push(photo);
    photosByProject.set(row.project_id, list);
  }

  return projectRows.map((row) => rowToProject(row, photosByProject.get(row.id) ?? []));
}
