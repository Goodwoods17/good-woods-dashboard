export type BriefingSeverity = "red" | "yellow" | "green";

export type BriefingItem = {
  job_id: string;
  job_code: string;
  job_name: string;
  client: string;
  severity: BriefingSeverity;
  headline: string;
  reason: string;
  suggested_action: string;
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
