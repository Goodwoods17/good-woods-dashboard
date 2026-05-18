import { computeMargin, type Job } from "@shared/lib/types";

export type ClientRow = {
  name: string;
  jobs: Job[];
  totalRevenue: number;
  totalMargin: number;
  latestInstall: string | null;
  activeCount: number;
};

// Group jobs by client name and compute lifetime stats. Sorted by total
// revenue descending so the biggest clients land at the top of the table.
export function computeClients(jobs: Job[]): ClientRow[] {
  const map = new Map<string, Job[]>();
  for (const j of jobs) {
    const list = map.get(j.client) ?? [];
    list.push(j);
    map.set(j.client, list);
  }
  return Array.from(map.entries())
    .map(([name, list]) => {
      const totalRevenue = list.reduce((s, j) => s + j.revenue, 0);
      const totalMargin = list.reduce(
        (s, j) => s + computeMargin(j).marginAmount,
        0
      );
      const installs = list
        .map((j) => j.installDate)
        .sort()
        .reverse();
      return {
        name,
        jobs: list,
        totalRevenue,
        totalMargin,
        latestInstall: installs[0] ?? null,
        activeCount: list.filter((j) => j.pipelineStatus !== "complete").length,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}
