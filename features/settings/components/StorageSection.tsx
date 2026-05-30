"use client";

import { useState } from "react";
import { Sprout, RefreshCw } from "lucide-react";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { Section, Field } from "./Section";

export function StorageSection() {
  const { seedDatabase, refresh, backend, jobs } = useJobs();
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  return (
    <Section title="Storage" description="Where this workspace keeps its data.">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field
          label="Backend"
          value={backend === "supabase" ? "Supabase (cloud)" : "localStorage (browser)"}
        />
        <Field label="Jobs loaded" value={String(jobs.length)} mono />
      </dl>

      {backend === "localStorage" && (
        <p className="mt-4 text-caption leading-relaxed text-text-tertiary">
          Set <code className="font-mono text-micro">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-micro">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to switch this
          surface to Supabase. Each device currently keeps its own copy.
        </p>
      )}

      {backend === "supabase" && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover focus:outline-none focus:ring-2 focus:ring-accent-soft"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
            Refresh from cloud
          </button>
          <button
            type="button"
            onClick={async () => {
              setSeeding(true);
              setSeedResult(null);
              const r = await seedDatabase();
              setSeedResult(
                r.inserted > 0
                  ? `Seeded ${r.inserted} job${r.inserted === 1 ? "" : "s"} into Supabase.`
                  : "Seed failed, see the error banner above."
              );
              setSeeding(false);
            }}
            disabled={seeding}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-ink-pill px-5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-active focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:cursor-wait disabled:bg-text-disabled"
          >
            <Sprout className="h-4 w-4" strokeWidth={1.75} />
            {seeding ? "Seeding…" : "Seed 6 demo jobs"}
          </button>
          {seedResult && <span className="text-caption text-text-secondary">{seedResult}</span>}
        </div>
      )}
    </Section>
  );
}
