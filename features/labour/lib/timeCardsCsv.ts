// CSV export for time cards (Slice B Part 2). Pure + tested. Hours only — no $.
import type { TimeCardEntry } from "./timeCards";

export type TimeCardCsvNames = {
  worker: (id: string | null) => string;
  job: (id: string | null) => string;
  code: (id: string | null) => string;
};

function csvField(value: string): string {
  // RFC-4180-style: always quote, escape internal quotes by doubling.
  return `"${value.replace(/"/g, '""')}"`;
}

export function timeCardsToCsv(entries: TimeCardEntry[], names: TimeCardCsvNames): string {
  const header = ["Date", "Worker", "Job", "Code", "Hours"].map(csvField).join(",");
  const rows = entries.map((e) =>
    [
      e.date,
      names.worker(e.workerId),
      names.job(e.jobId),
      names.code(e.operationId),
      (e.ms / 3_600_000).toFixed(2),
    ]
      .map((v) => csvField(String(v)))
      .join(",")
  );
  return [header, ...rows].join("\r\n");
}
