"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { COMPANY, TAX_RATE } from "@/lib/invoice";
import { RotateCcw, Database, AlertCircle, Sprout, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { resetToSeed, seedDatabase, refresh, backend, error, jobs } = useJobs();
  const [confirming, setConfirming] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Workspace"
        subtitle="Branding, tax, and storage."
      />
      <div className="px-8 py-6 max-w-3xl space-y-5">
        {error && (
          <div className="bg-status-blocked-soft border border-status-blocked/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle
              className="h-4 w-4 text-status-blocked shrink-0 mt-0.5"
              strokeWidth={1.75}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-status-blocked mb-0.5">
                Storage error
              </div>
              <div className="text-xs text-text-secondary break-all">{error}</div>
            </div>
          </div>
        )}

        <Section title="Storage">
          <Field
            label="Backend"
            value={backend === "supabase" ? "Supabase (cloud)" : "localStorage (browser)"}
          />
          <Field label="Jobs loaded" value={String(jobs.length)} />
          {backend === "localStorage" && (
            <p className="text-xs text-text-tertiary col-span-2 mt-1 leading-relaxed">
              Set <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and{" "}
              <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              to switch this surface to Supabase. Each device currently has its own copy.
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
                className="inline-flex items-center gap-2 rounded-md bg-accent text-white px-3 py-1.5 text-xs font-medium hover:bg-accent-hover transition-colors duration-fast disabled:bg-text-disabled disabled:cursor-wait"
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

        <Section title="Company">
          <Field label="Name" value={COMPANY.name} />
          <Field label="Tagline" value={COMPANY.tagline} />
          <Field label="Address" value={COMPANY.address} />
          <Field label="Email" value={COMPANY.email} />
          <Field label="GST" value={COMPANY.gstNumber} mono />
          <p className="text-xs text-text-tertiary col-span-2 mt-1">
            Editing company details lands in M3 alongside the catalog and tax-rate UI.
          </p>
        </Section>

        <Section title="Tax">
          <Field label="Default rate" value={`${(TAX_RATE * 100).toFixed(0)}%`} />
          <Field
            label="Region"
            value="British Columbia (5% GST + 7% PST)"
          />
        </Section>

        <Section title="Reset">
          <p className="text-sm text-text-secondary col-span-2 mb-3 leading-relaxed">
            Resetting reloads the original 6 seed jobs and erases any edits, cost-line
            changes, and activity history. On Supabase this also wipes the cloud table.
            Cannot be undone.
          </p>
          <div className="col-span-2">
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium",
                  "text-text-secondary hover:border-status-blocked hover:text-status-blocked transition-colors duration-fast"
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Reset to seed jobs
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-status-blocked-soft border border-status-blocked/30 rounded-md p-3">
                <span className="text-sm text-status-blocked flex-1">
                  Reset will erase all edits. This cannot be undone.
                </span>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1.5 text-sm rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors duration-fast"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await resetToSeed();
                    setConfirming(false);
                  }}
                  className="px-3 py-1.5 text-sm rounded-md bg-status-blocked text-white hover:opacity-90 transition-opacity duration-fast"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border bg-surface-muted flex items-center gap-2">
        {title === "Storage" && (
          <Database className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        )}
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 p-5">
        {children}
      </dl>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-0.5">
        {label}
      </dt>
      <dd className={cn("text-sm text-text-primary", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
