// Daily time-card aggregation (Slice B Part 2). Pure: rolls completed labour
// sessions into per-(worker,day) and per-(job,day) hours. Hours = active time
// (durationMs), pauses excluded. No $; pay rates are a later slice.
import { durationMs, type LabourSession } from "./labourStore";

export type TimeCardEntry = {
  sessionId: string; date: string;
  workerId: string | null; jobId: string | null; operationId: string | null; ms: number;
};
export type DayCard = { workerId: string | null; date: string; entries: TimeCardEntry[]; totalMs: number };
export type ProjectDay = { jobId: string | null; date: string; entries: TimeCardEntry[]; totalMs: number };

function dayOf(iso: string): string { return iso.slice(0, 10); }

export function buildTimeCards(sessions: LabourSession[]): { byWorkerDay: DayCard[]; byJobDay: ProjectDay[] } {
  const completed = sessions.filter((s) => s.endedAt != null);
  const entries: TimeCardEntry[] = completed.map((s) => ({
    sessionId: s.id, date: dayOf(s.startedAt),
    workerId: s.workerId, jobId: s.jobId, operationId: s.operationId, ms: durationMs(s),
  }));

  const wMap = new Map<string, DayCard>();
  const jMap = new Map<string, ProjectDay>();
  for (const e of entries) {
    const wk = `${e.workerId ?? "—"}__${e.date}`;
    let w = wMap.get(wk);
    if (!w) { w = { workerId: e.workerId, date: e.date, entries: [], totalMs: 0 }; wMap.set(wk, w); }
    w.entries.push(e); w.totalMs += e.ms;

    const jk = `${e.jobId ?? "—"}__${e.date}`;
    let j = jMap.get(jk);
    if (!j) { j = { jobId: e.jobId, date: e.date, entries: [], totalMs: 0 }; jMap.set(jk, j); }
    j.entries.push(e); j.totalMs += e.ms;
  }
  const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  return {
    byWorkerDay: Array.from(wMap.values()).sort(byDateDesc),
    byJobDay: Array.from(jMap.values()).sort(byDateDesc),
  };
}
