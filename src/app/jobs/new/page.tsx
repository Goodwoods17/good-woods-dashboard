"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import {
  type Job,
  type PipelineStatus,
  type HealthStatus,
  PIPELINE_LABELS,
  HEALTH_LABELS,
} from "@/lib/types";
import { newActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

const TEMPLATE_OPTIONS: { value: Job["template"]; label: string; hint: string }[] = [
  {
    value: "full_project",
    label: "Full Project",
    hint: "Kitchen, multi-room, milestone payments",
  },
  {
    value: "refacing",
    label: "Refacing",
    hint: "New doors + finish + hinges + install",
  },
  {
    value: "spray_finishing",
    label: "Spray Finishing",
    hint: "Customer drops off raw doors",
  },
  {
    value: "install_only",
    label: "Install Only",
    hint: "No fab; just install someone else's product",
  },
];

const PIPELINE_OPTIONS: PipelineStatus[] = [
  "new",
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

const HEALTH_OPTIONS: HealthStatus[] = [
  "on_track",
  "at_risk",
  "blocked",
  "paused",
];

function nextJobCode(existing: Job[]): string {
  const year = new Date().getFullYear();
  const prefix = `GW-${year}-`;
  const max = existing
    .map((j) => j.code)
    .filter((c) => c.startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export default function NewJobPage() {
  const { jobs, createJob, backend } = useJobs();
  const router = useRouter();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [address, setAddress] = useState("");
  const [template, setTemplate] = useState<Job["template"]>("full_project");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>("sold");
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("on_track");
  const [installDate, setInstallDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [revenue, setRevenue] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const code = useMemo(() => nextJobCode(jobs), [jobs]);
  const canSubmit = name.trim().length > 0 && client.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const job: Job = {
      id,
      code,
      name: name.trim(),
      client: client.trim(),
      address: address.trim(),
      template,
      pipelineStatus,
      healthStatus,
      currentMilestone: "sold",
      installDate,
      revenue: parseFloat(revenue) || 0,
      costs: [],
      activity: [
        newActivity("note", `Job created — ${name.trim()}`),
      ],
      notes: notes.trim() || undefined,
      invoice: {
        number: `INV-${code.slice(3)}`,
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          return d.toISOString().slice(0, 10);
        })(),
        lineItems: [
          {
            description: name.trim(),
            qty: 1,
            unitPrice: parseFloat(revenue) || 0,
          },
        ],
      },
    };

    try {
      await createJob(job);
      router.push(`/jobs/${id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not create job.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="New job"
        subtitle={
          backend === "supabase"
            ? "Saves to Supabase — visible on every device."
            : "Saves to local storage on this browser."
        }
      />
      <div className="px-8 py-6 max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-5"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to Jobs
        </Link>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Card title={`Job ${code}`}>
            <Field label="Name" required>
              <Input
                value={name}
                onChange={setName}
                placeholder="e.g. SayWell — Phase 3 Suite Kitchens"
                autoFocus
              />
            </Field>
            <Field label="Client" required>
              <Input
                value={client}
                onChange={setClient}
                placeholder="e.g. SayWell Developments"
              />
            </Field>
            <Field label="Address">
              <Input
                value={address}
                onChange={setAddress}
                placeholder="e.g. 1042 Yates St, Victoria BC"
              />
            </Field>
          </Card>

          <Card title="Template">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TEMPLATE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setTemplate(opt.value)}
                  className={cn(
                    "text-left rounded-md border px-3 py-2.5 transition-colors duration-fast",
                    template === opt.value
                      ? "border-accent bg-accent-soft text-text-primary"
                      : "border-border bg-surface hover:border-border-strong text-text-secondary"
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Status & schedule">
            <Field label="Pipeline">
              <Select
                value={pipelineStatus}
                onChange={(v) => setPipelineStatus(v as PipelineStatus)}
                options={PIPELINE_OPTIONS.map((s) => ({
                  value: s,
                  label: PIPELINE_LABELS[s],
                }))}
              />
            </Field>
            <Field label="Health">
              <Select
                value={healthStatus}
                onChange={(v) => setHealthStatus(v as HealthStatus)}
                options={HEALTH_OPTIONS.map((s) => ({
                  value: s,
                  label: HEALTH_LABELS[s],
                }))}
              />
            </Field>
            <Field label="Install date">
              <Input
                type="date"
                value={installDate}
                onChange={setInstallDate}
              />
            </Field>
          </Card>

          <Card title="Pricing & notes">
            <Field label="Starting revenue (CAD)">
              <Input
                type="number"
                value={revenue}
                onChange={setRevenue}
                placeholder="e.g. 21000"
                step="0.01"
                min="0"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anchor designer, milestone schedule, gotchas…"
                className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-none"
              />
            </Field>
          </Card>

          {submitError && (
            <div className="bg-status-blocked-soft border border-status-blocked/30 rounded-md p-3 text-sm text-status-blocked">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              href="/"
              className="px-4 py-2 text-sm rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary transition-colors duration-fast"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md text-white transition-colors duration-fast",
                "bg-accent hover:bg-accent-hover active:bg-accent-active",
                "disabled:bg-text-disabled disabled:cursor-not-allowed"
              )}
            >
              {submitting ? "Creating…" : "Create job"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  step,
  min,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  min?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      autoFocus={autoFocus}
      className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
