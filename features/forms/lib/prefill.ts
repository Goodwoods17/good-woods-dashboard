import type { FormTemplateField, FormInstanceField, Job, JobPiece } from "@shared/lib/types";

/**
 * Curated job-data prefill sources (issue #68 / Forms P3 Slice 3).
 *
 * Each key maps to a resolver that extracts a string (or null) from the job.
 * `config.prefillFrom` on a template field names the key. At snapshot time,
 * `applyPrefill` fills matching fields with the resolved value. The snapshot is
 * then frozen — later edits to the job do NOT propagate (invariant preserved).
 *
 * Mozaik prefill is explicitly deferred (no stored Mozaik data yet).
 */

// ─── Source key type ───────────────────────────────────────────────────────

export const PREFILL_SOURCE_KEYS = [
  // Header
  "client",
  "address",
  "installDate",
  "jobCode",
  "template",
  // Site contact & access
  "siteContactName",
  "siteContactPhone",
  "buzzerCode",
  "doorCode",
  "lockboxCode",
  "parkingNotes",
  // Pieces summary
  "piecesSummary",
] as const;

export type PrefillSourceKey = (typeof PREFILL_SOURCE_KEYS)[number];

// ─── Grouped display labels for the builder dropdown ──────────────────────

export const PREFILL_SOURCE_GROUPS: Array<{
  label: string;
  keys: PrefillSourceKey[];
}> = [
  {
    label: "Header",
    keys: ["client", "address", "installDate", "jobCode", "template"],
  },
  {
    label: "Site contact & access",
    keys: ["siteContactName", "siteContactPhone", "buzzerCode", "doorCode", "lockboxCode", "parkingNotes"],
  },
  {
    label: "Pieces",
    keys: ["piecesSummary"],
  },
];

export const PREFILL_SOURCE_LABELS: Record<PrefillSourceKey, string> = {
  client: "Client name",
  address: "Job address",
  installDate: "Install date",
  jobCode: "Job code",
  template: "Project template",
  siteContactName: "Site contact — name",
  siteContactPhone: "Site contact — phone",
  buzzerCode: "Buzzer code",
  doorCode: "Door code",
  lockboxCode: "Lockbox code",
  parkingNotes: "Parking notes",
  piecesSummary: "Pieces summary (Room — Code — label)",
};

// ─── Template label mapping ────────────────────────────────────────────────

const TEMPLATE_LABELS: Record<string, string> = {
  refacing: "Refacing",
  spray_finishing: "Spray finishing",
  install_only: "Install only",
  full_project: "Full project",
};

// ─── Resolvers ─────────────────────────────────────────────────────────────

type Resolver = (job: Job, pieces: JobPiece[]) => string | null;

const PREFILL_SOURCES: Record<PrefillSourceKey, Resolver> = {
  client: (job) => job.client || null,
  address: (job) => job.address || null,
  installDate: (job) => job.installDate || null,
  jobCode: (job) => job.code || null,
  template: (job) => TEMPLATE_LABELS[job.template] ?? job.template ?? null,
  siteContactName: (job) => job.siteAccess?.siteContact?.name ?? null,
  siteContactPhone: (job) => job.siteAccess?.siteContact?.phone ?? null,
  buzzerCode: (job) => job.siteAccess?.buzzerCode ?? null,
  doorCode: (job) => job.siteAccess?.doorCode ?? null,
  lockboxCode: (job) => job.siteAccess?.lockboxCode ?? null,
  parkingNotes: (job) => job.siteAccess?.parkingNotes ?? null,
  piecesSummary: (_job, pieces) => {
    if (!pieces || pieces.length === 0) return null;
    const lines = pieces
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => {
        const parts: string[] = [];
        if (p.room) parts.push(p.room);
        if (p.code) parts.push(p.code);
        parts.push(p.label);
        return parts.join(" — ");
      });
    return lines.join("\n");
  },
};

// ─── Exported helpers ──────────────────────────────────────────────────────

/**
 * Resolve a single prefill source key against the given job + pieces.
 * Returns null when the key is unrecognised or the job field is absent.
 */
export function resolvePrefill(
  key: PrefillSourceKey | string,
  job: Job,
  pieces: JobPiece[]
): string | null {
  const resolver = PREFILL_SOURCES[key as PrefillSourceKey];
  if (!resolver) return null;
  return resolver(job, pieces);
}

/**
 * Coerce a resolved string value to the appropriate answer slot for a given
 * field type. `date` fields use the `value` slot (ISO date string). All other
 * text-like types also use `value`. Returns a partial patch to merge into the
 * field's answer columns.
 */
function coercePrefillValue(
  type: FormTemplateField["type"],
  raw: string
): Partial<Pick<FormInstanceField, "value" | "checked">> {
  // date fields expect the ISO string in `value`.
  // All other text-accepting types (short_text, long_text, number) also use `value`.
  return { value: raw };
}

/**
 * Return a NEW array of FormInstanceFields with `value` (or per-type coercion)
 * filled in for any field whose `config.prefillFrom` resolves to a non-null
 * value against the given job + pieces. Fields without a mapping, or with a
 * null resolution, are returned unchanged.
 *
 * This is the single application point — called inside snapshotTemplate after
 * blank fields are built, before the result is returned.
 */
export function applyPrefill(
  fields: FormInstanceField[],
  job: Job,
  pieces: JobPiece[]
): FormInstanceField[] {
  return fields.map((f) => {
    const key = (f.config as Record<string, unknown>)?.prefillFrom;
    if (typeof key !== "string" || !key) return f;
    const resolved = resolvePrefill(key, job, pieces);
    if (resolved === null) return f;
    const patch = coercePrefillValue(f.type, resolved);
    return { ...f, ...patch };
  });
}
