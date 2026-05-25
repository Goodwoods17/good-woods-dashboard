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
    <Section title="Storage">
      <Field
        label="Backend"
        value={backend === "supabase" ? "Supabase (cloud)" : "localStorage (browser)"}
      />
      <Field label="Jobs loaded" value={String(jobs.length)} />
      {backend === "localStorage" && (
        <p className="text-xs text-text-tertiary col-span-2 mt-1 leading-relaxed">
          Set <code className="font-mono text-caption">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="font-mono text-caption">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
          to switch this surface to Supabase. Each device currently has its own
          copy.
        </p>
      )}
      {backend === "supabase" && (
        <div className="col-span-2 flex items-center gap-2 mt-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Refresh from cloud
          </button>
          <button
            onClick={async () => {
              setSeeding(true);
              setSeedResult(null);
              const r = await seedDatabase();
              setSeedResult(
                r.inserted > 0
                  ? `Seeded ${r.inserted} job${r.inserted === 1 ? "" : "s"} into Supabase.`
                  : "Seed failed — see error banner."
              );
              setSeeding(false);
            }}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-full bg-ink-pill text-white px-4 py-1.5 text-xs font-medium hover:bg-accent-active transition-colors duration-fast disabled:bg-text-disabled disabled:cursor-wait"
          >
            <Sprout className="h-3.5 w-3.5" strokeWidth={1.75} />
            {seeding ? "Seeding…" : "Seed 6 demo jobs"}
          </button>
          {seedResult && (
            <span className="text-xs text-text-secondary">{seedResult}</span>
          )}
        </div>
      )}
    </Section>
  );
}
