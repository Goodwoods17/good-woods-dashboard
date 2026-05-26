export type BriefingSeverity = "red" | "yellow" | "green";

export type BriefingItemKind = "job" | "relationship";

export type BriefingItem = {
  /**
   * Discriminator. "job" items link to /jobs/[id]; "relationship" items
   * link to /crm/[id]. Optional for backward compatibility with rows
   * generated before the contacts feature shipped (treat as "job").
   */
  kind?: BriefingItemKind;
  job_id: string;
  job_code: string;
  job_name: string;
  client: string;
  severity: BriefingSeverity;
  headline: string;
  reason: string;
  suggested_action: string;
  /** Set when kind === "relationship". */
  contact_id?: string;
  contact_name?: string;
};

export type Briefing = {
  id: string;
  generated_at: string;
  for_date: string;
  summary: string;
  items: BriefingItem[];
  model: string;
  jobs_considered: number;
  error: string | null;
  source: "cron" | "manual";
};

export type BriefingRow = {
  id: string;
  generated_at: string;
  for_date: string;
  summary: string;
  items: BriefingItem[];
  model: string;
  jobs_considered: number;
  error: string | null;
  source: "cron" | "manual";
};

export function rowToBriefing(row: BriefingRow): Briefing {
  return { ...row };
}
