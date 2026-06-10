/**
 * Element creation: ref-label assignment, the manual-pin factory, and ingestion
 * of Claude-Code-detected elements.
 *
 * Ref labels are per-kind and project-wide (D1, D2.../DR1.../EP1.../TK1...), so a
 * labeler is seeded from a project's existing elements and hands out the next free
 * code per kind. AI-detected and manually-added pins share this path; the only
 * difference is `aiGuess` (true for detected, false for manual) which drives the
 * "unconfirmed" badge.
 */
import {
  ELEMENT_KINDS,
  ELEMENT_KIND_PREFIX,
  type DetectedElement,
  type ElementBox,
  type ElementKind,
  type RefaceElement,
  type RefaceProject,
} from "./types";

/** Highest numeric suffix already used per kind across the whole project. */
function maxSuffixByKind(project: RefaceProject): Record<ElementKind, number> {
  const max = Object.fromEntries(ELEMENT_KINDS.map((k) => [k, 0])) as Record<ElementKind, number>;
  for (const photo of project.photos) {
    for (const el of photo.elements) {
      const prefix = ELEMENT_KIND_PREFIX[el.kind];
      const m = el.label?.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) max[el.kind] = Math.max(max[el.kind], Number(m[1]));
    }
  }
  return max;
}

export type Labeler = (kind: ElementKind) => string;

/**
 * Build a labeler primed off the project's current elements. Calls mutate the
 * labeler's internal counters, so a batch of new elements gets D1, D2, D3...
 * without colliding with each other or with what's already on the project.
 */
export function makeLabeler(project: RefaceProject): Labeler {
  const counters = maxSuffixByKind(project);
  return (kind: ElementKind) => {
    counters[kind] += 1;
    return `${ELEMENT_KIND_PREFIX[kind]}${counters[kind]}`;
  };
}

/** Next sort value to append after a photo's existing elements. */
function nextSort(project: RefaceProject, photoId: string): number {
  const photo = project.photos.find((p) => p.id === photoId);
  if (!photo || photo.elements.length === 0) return 0;
  return Math.max(...photo.elements.map((e) => e.sort)) + 1;
}

type NewElementInput = {
  kind: ElementKind;
  box?: ElementBox | null;
  widthIn?: number | null;
  heightIn?: number | null;
  qty?: number;
  location?: string;
  aiGuess?: boolean;
  sort?: number;
};

/** Construct a fully-formed {@link RefaceElement} with id, label, and defaults. */
export function buildElement(
  photoId: string,
  input: NewElementInput,
  labeler: Labeler,
  createdAt: string = new Date().toISOString()
): RefaceElement {
  return {
    id: crypto.randomUUID(),
    photoId,
    kind: input.kind,
    label: labeler(input.kind),
    location: input.location ?? "",
    widthIn: input.widthIn ?? null,
    heightIn: input.heightIn ?? null,
    qty: input.qty && input.qty > 0 ? input.qty : 1,
    box: input.box ?? null,
    aiGuess: input.aiGuess ?? false,
    mullionSections: 0,
    dividers: 0,
    notes: "",
    sort: input.sort ?? 0,
    createdAt,
  };
}

/**
 * Factory for a manually-added pin (tap empty space). `box` is the normalized
 * tap point with a small default footprint; the rest is filled in via the card.
 */
export function newManualElement(
  project: RefaceProject,
  photoId: string,
  kind: ElementKind,
  box: ElementBox | null,
  labeler: Labeler
): RefaceElement {
  return buildElement(
    photoId,
    { kind, box, aiGuess: false, sort: nextSort(project, photoId) },
    labeler
  );
}

const VALID_KINDS = new Set<string>(ELEMENT_KINDS);

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function isValidBox(b: unknown): b is ElementBox {
  if (!b || typeof b !== "object") return false;
  const box = b as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (k) => typeof box[k] === "number" && Number.isFinite(box[k])
  );
}

export type ValidationResult = {
  detected: DetectedElement[];
  errors: string[];
};

/**
 * Validate a raw `DetectedElement[]` payload (parsed JSON from Claude Code).
 * Drops malformed entries with a per-index error message; normalizes boxes into
 * the 0..1 range. Accepts a bare array or `{ elements: [...] }`.
 */
export function validateDetected(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { elements?: unknown }).elements)
      ? (raw as { elements: unknown[] }).elements
      : null;

  if (!list) {
    return { detected: [], errors: ["Expected a JSON array of detected elements."] };
  }

  const detected: DetectedElement[] = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`#${i + 1}: not an object`);
      return;
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.kind !== "string" || !VALID_KINDS.has(obj.kind)) {
      errors.push(`#${i + 1}: invalid kind "${String(obj.kind)}"`);
      return;
    }
    if (!isValidBox(obj.box)) {
      errors.push(`#${i + 1}: missing or invalid box {x,y,w,h}`);
      return;
    }
    const box = obj.box as ElementBox;
    detected.push({
      kind: obj.kind as ElementKind,
      box: { x: clamp01(box.x), y: clamp01(box.y), w: clamp01(box.w), h: clamp01(box.h) },
      estWidthIn: typeof obj.estWidthIn === "number" ? obj.estWidthIn : null,
      estHeightIn: typeof obj.estHeightIn === "number" ? obj.estHeightIn : null,
      location: typeof obj.location === "string" ? obj.location : "",
    });
  });

  return { detected, errors };
}

/**
 * Convert a validated `DetectedElement[]` into ready-to-insert elements for one
 * photo: aiGuess=true, estimated dims pre-filled, sequential ref labels + sort.
 */
export function detectedToElements(
  project: RefaceProject,
  photoId: string,
  detected: DetectedElement[],
  labeler: Labeler
): RefaceElement[] {
  const base = nextSort(project, photoId);
  const createdAt = new Date().toISOString();
  return detected.map((d, i) =>
    buildElement(
      photoId,
      {
        kind: d.kind,
        box: d.box,
        widthIn: d.estWidthIn ?? null,
        heightIn: d.estHeightIn ?? null,
        location: d.location ?? "",
        aiGuess: true,
        sort: base + i,
      },
      labeler,
      createdAt
    )
  );
}

/** Parse + validate a JSON string of detected elements. */
export function parseDetectedJson(text: string): ValidationResult {
  try {
    return validateDetected(JSON.parse(text));
  } catch (e) {
    return {
      detected: [],
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}
