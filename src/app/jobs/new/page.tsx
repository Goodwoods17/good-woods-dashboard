"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Search, Sparkles, X } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useContacts } from "@features/contacts/lib/contactsStore";
import { ContactCombobox } from "@features/contacts/components/ContactCombobox";
import { SiteAccessForm } from "@features/jobs/components/SiteAccessForm";
import { AddDocumentForm } from "@features/documents/components/AddDocumentForm";
import { useDocuments } from "@features/documents/lib/documentsStore";
import {
  type Contact,
  type DocumentKind,
  type Job,
  type PipelineStatus,
  type HealthStatus,
  type RoleTag,
  type SiteAccess,
  JOB_SOURCE_PRESETS,
  PIPELINE_LABELS,
  HEALTH_LABELS,
} from "@shared/lib/types";
import { newActivity } from "@features/jobs/lib/activity";
import { cn } from "@shared/lib/utils";

type IntakeMode = "quick" | "full";

type PendingDoc = {
  tempId: string;
  kind: DocumentKind;
  label: string;
  driveUrl: string;
  version: string | null;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function matchByPhone(query: string, contacts: Contact[]): Contact | null {
  const q = digitsOnly(query);
  if (q.length < 6) return null;
  return contacts.find((c) => c.phones.some((p) => digitsOnly(p.value).includes(q))) ?? null;
}

type OptionalSlot = "designer" | "architect" | "gc" | "homeowner";
const OPTIONAL_SLOTS: { key: OptionalSlot; label: string; role: RoleTag }[] = [
  { key: "designer", label: "Designer", role: "designer" },
  { key: "gc", label: "GC", role: "gc" },
  { key: "architect", label: "Architect", role: "architect" },
  { key: "homeowner", label: "Homeowner", role: "homeowner" },
];

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

const HEALTH_OPTIONS: HealthStatus[] = ["on_track", "at_risk", "blocked", "paused"];

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
  const { contacts } = useContacts();
  const { createDocument } = useDocuments();
  const router = useRouter();

  const [mode, setMode] = useState<IntakeMode>("quick");
  const [name, setName] = useState("");
  const [phoneLookup, setPhoneLookup] = useState("");
  const [payerId, setPayerId] = useState<string | null>(null);
  // Optional slots — visible only after the user opens them. P0 #1
  // contract: PRODUCT.md max-4-primary-options.
  const [openSlots, setOpenSlots] = useState<Set<OptionalSlot>>(new Set());
  const [designerId, setDesignerId] = useState<string | null>(null);
  const [architectId, setArchitectId] = useState<string | null>(null);
  const [gcId, setGcId] = useState<string | null>(null);
  const [homeownerId, setHomeownerId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [source, setSource] = useState("");
  const [template, setTemplate] = useState<Job["template"]>("full_project");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>("sold");
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("on_track");
  const [installDate, setInstallDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [estimatedRevenue, setEstimatedRevenue] = useState<string>("");
  const [revenue, setRevenue] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [siteAccess, setSiteAccess] = useState<SiteAccess>({});
  const [siteAccessOpen, setSiteAccessOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Phone-first contact lookup. Match by digit-substring; if a contact's
  // phone contains the typed digits, suggest auto-filling Payer + any
  // address/site contact the contact knows.
  const phoneMatch = useMemo(() => matchByPhone(phoneLookup, contacts), [phoneLookup, contacts]);
  function applyPhoneMatch() {
    if (!phoneMatch) return;
    setPayerId(phoneMatch.id);
    if (phoneMatch.address && !address) setAddress(phoneMatch.address);
    if (!siteAccess.siteContact?.phone && phoneMatch.phones[0]) {
      setSiteAccess((p) => ({
        ...p,
        siteContact: {
          ...p.siteContact,
          name: phoneMatch.name,
          phone: phoneMatch.phones[0].value,
        },
      }));
    }
  }

  // "Sold by designer" pre-fill — pick a designer and copy what we know
  // from their most recent project (homeowner slot, source attribution).
  const [designerPickerOpen, setDesignerPickerOpen] = useState(false);
  const designerContacts = useMemo(
    () =>
      contacts
        .filter((c) => !c.archivedAt && c.roleTags.includes("designer"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [contacts]
  );
  function applyDesignerTemplate(designer: Contact) {
    setDesignerId(designer.id);
    setSource((p) => p || designer.name);
    function open(slot: OptionalSlot) {
      setOpenSlots((p) => {
        const next = new Set(p);
        next.add(slot);
        return next;
      });
    }
    open("designer");
    // Find their most-recent prior project to copy the payer + homeowner.
    const priors = jobs
      .filter((j) => j.designerId === designer.id)
      .sort((a, b) => b.installDate.localeCompare(a.installDate));
    const prior = priors[0];
    if (prior) {
      if (prior.payerId && !payerId) setPayerId(prior.payerId);
      if (prior.homeownerId) {
        setHomeownerId(prior.homeownerId);
        open("homeowner");
      }
      if (prior.gcId) {
        setGcId(prior.gcId);
        open("gc");
      }
    }
    setDesignerPickerOpen(false);
  }

  const code = useMemo(() => nextJobCode(jobs), [jobs]);
  const canSubmit = name.trim().length > 0 && payerId !== null && source.trim().length > 0;
  const payerName = useMemo(
    () => contacts.find((c) => c.id === payerId)?.name ?? "",
    [contacts, payerId]
  );
  const slotIdFor = (slot: OptionalSlot): string | null => {
    if (slot === "designer") return designerId;
    if (slot === "architect") return architectId;
    if (slot === "gc") return gcId;
    return homeownerId;
  };
  const setSlotId = (slot: OptionalSlot, id: string | null) => {
    if (slot === "designer") setDesignerId(id);
    else if (slot === "architect") setArchitectId(id);
    else if (slot === "gc") setGcId(id);
    else setHomeownerId(id);
  };
  const availableSlots = OPTIONAL_SLOTS.filter((s) => !openSlots.has(s.key));

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
      // `client` text column kept as the legacy display fallback. Mirrors
      // the payer's name. Will be dropped in a follow-up migration once
      // every read path uses payerId lookups.
      client: payerName,
      payerId,
      designerId: designerId ?? null,
      architectId: architectId ?? null,
      gcId: gcId ?? null,
      homeownerId: homeownerId ?? null,
      address: address.trim(),
      template,
      pipelineStatus,
      healthStatus,
      currentMilestone: "sold",
      installDate,
      revenue: parseFloat(revenue) || 0,
      costs: [],
      activity: [newActivity("note", `Job created. ${name.trim()}`)],
      notes: notes.trim() || undefined,
      siteAccess,
      source: source.trim() || null,
      estimatedRevenue: estimatedRevenue.trim() ? parseFloat(estimatedRevenue) : null,
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
      // Save any pending documents now that the project_id exists.
      for (const pd of pendingDocs) {
        try {
          await createDocument({
            id: crypto.randomUUID(),
            projectId: id,
            kind: pd.kind,
            label: pd.label,
            driveUrl: pd.driveUrl,
            version: pd.version,
            isCurrent: true,
            notes: null,
            uploadedBy: null,
            createdAt: new Date().toISOString(),
          });
        } catch {
          // Don't fail the whole submit on a doc write — the user can
          // re-add from the project page. Log silently.
        }
      }
      router.push(`/jobs/${id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not create project.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="New project"
        subtitle={
          backend === "supabase"
            ? "Saves to Supabase. Visible on every device."
            : "Saves to local storage on this browser."
        }
      />
      <div className="px-8 py-6 max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-5"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to Pipeline
        </Link>

        {/* Intake mode toggle: 60-second quick capture vs full intake. */}
        <div className="mb-5 flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium">
            Intake
          </span>
          <div className="inline-flex items-center rounded-full bg-surface-muted p-1">
            <ModeBtn active={mode === "quick"} onClick={() => setMode("quick")}>
              Quick (60s)
            </ModeBtn>
            <ModeBtn active={mode === "full"} onClick={() => setMode("full")}>
              Full
            </ModeBtn>
          </div>
          <span className="text-xs text-text-tertiary">
            {mode === "quick"
              ? "On a call. Capture the essentials, finish on the project page later."
              : "Sold project. Fill everything that's known."}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Card title={`Project ${code}`}>
            {/* Phone-first contact lookup. The single most valuable input
                during a returning-client call: digits in, full context out. */}
            <Field label="Returning client? Look up by phone">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none"
                  strokeWidth={1.75}
                />
                <input
                  type="tel"
                  value={phoneLookup}
                  onChange={(e) => setPhoneLookup(e.target.value)}
                  placeholder="(250) 555 0182"
                  className="w-full text-sm bg-surface-muted border border-border rounded-md pl-9 pr-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
                />
              </div>
              {phoneMatch && (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-accent-soft px-3 py-2">
                  <div className="text-xs text-accent">
                    <span className="font-semibold">{phoneMatch.name}</span>
                    {phoneMatch.address && (
                      <span className="text-text-secondary">
                        {" . "}
                        {phoneMatch.address}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={applyPhoneMatch}
                    className="text-xs font-medium text-accent hover:text-accent-active"
                  >
                    Use this client
                  </button>
                </div>
              )}
            </Field>

            <Field label="Project name" required>
              <Input
                value={name}
                onChange={setName}
                placeholder="SayWell Phase 3 Suite Kitchens"
                autoFocus
              />
            </Field>
            <Field label="Payer" required>
              <ContactCombobox
                value={payerId}
                onChange={setPayerId}
                placeholder="Who pays for this project"
              />
            </Field>

            {/* Sold-by-designer template: pre-fill from a designer's last
                project (homeowner slot, source attribution, etc.). */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDesignerPickerOpen((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent hover:bg-accent-soft/80 px-3 py-1 text-xs font-medium transition-colors duration-fast"
              >
                <Sparkles className="h-3 w-3" strokeWidth={1.75} />
                {designerPickerOpen
                  ? "Close"
                  : "Sold by a designer? Pre-fill from their last project"}
              </button>
            </div>
            {designerPickerOpen && (
              <div className="rounded-md bg-surface-muted/60 p-3 -mt-2">
                {designerContacts.length === 0 ? (
                  <p className="text-xs text-text-tertiary">
                    No designers tagged yet. Tag a contact with the Designer role on the Clients
                    page.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {designerContacts.map((d) => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => applyDesignerTemplate(d)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white text-text-secondary hover:text-text-primary hover:bg-surface px-3 py-1 text-xs font-medium shadow-resting transition-colors duration-fast"
                      >
                        {d.isAnchor && (
                          <span
                            aria-hidden
                            className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                          />
                        )}
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Field label="How did they find us?" required>
              <SourcePicker value={source} onChange={setSource} />
            </Field>

            {/* P0 #1: optional contact slots live behind progressive disclosure. */}
            {OPTIONAL_SLOTS.filter((s) => openSlots.has(s.key)).map((s) => (
              <Field key={s.key} label={s.label}>
                <ContactCombobox
                  value={slotIdFor(s.key)}
                  onChange={(id) => setSlotId(s.key, id)}
                  rolePreference={[s.role]}
                  defaultCreateRole={s.role}
                  placeholder={`Search ${s.label.toLowerCase()}s`}
                />
              </Field>
            ))}

            {availableSlots.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {availableSlots.map((s) => (
                  <button
                    type="button"
                    key={s.key}
                    onClick={() =>
                      setOpenSlots((prev) => {
                        const next = new Set(prev);
                        next.add(s.key);
                        return next;
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted text-text-secondary hover:bg-surface-sunken hover:text-text-primary px-3 py-1 text-xs font-medium transition-colors duration-fast"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2} />
                    Add {s.label.toLowerCase()}
                  </button>
                ))}
              </div>
            )}

            <Field label="Address">
              <Input
                value={address}
                onChange={setAddress}
                placeholder="1042 Yates St, Victoria BC"
              />
            </Field>
          </Card>

          {mode === "full" && (
            <>
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
                      <div className="text-xs text-text-tertiary mt-0.5">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </Card>

              <CollapsibleCard
                title="Site & access"
                description="Codes, parking, pet, on-site backup. Skip if you don't know it yet, fill it from the project page later."
                open={siteAccessOpen}
                onToggle={() => setSiteAccessOpen((p) => !p)}
              >
                <SiteAccessForm value={siteAccess} onChange={setSiteAccess} />
              </CollapsibleCard>

              <CollapsibleCard
                title="Documents"
                description="Paste Google Drive links for designer drawings, Toolpath CNC files, appliance specs, etc."
                open={documentsOpen}
                onToggle={() => setDocumentsOpen((p) => !p)}
              >
                <NewProjectDocumentsBlock
                  pending={pendingDocs}
                  onAdd={(doc) =>
                    setPendingDocs((p) => [...p, { tempId: crypto.randomUUID(), ...doc }])
                  }
                  onRemove={(tempId) => setPendingDocs((p) => p.filter((d) => d.tempId !== tempId))}
                />
              </CollapsibleCard>

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
                  <Input type="date" value={installDate} onChange={setInstallDate} />
                </Field>
              </Card>

              <Card title="Pricing & notes">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Estimated revenue (CAD)">
                    <Input
                      type="number"
                      value={estimatedRevenue}
                      onChange={setEstimatedRevenue}
                      placeholder="e.g. 24000"
                      step="0.01"
                      min="0"
                    />
                  </Field>
                  <Field label="Final revenue (CAD)">
                    <Input
                      type="number"
                      value={revenue}
                      onChange={setRevenue}
                      placeholder="e.g. 21000"
                      step="0.01"
                      min="0"
                    />
                  </Field>
                </div>
                <p className="text-caption text-text-tertiary -mt-2">
                  Estimated stays fixed for quote-accuracy tracking. Final revenue updates as costs
                  land.
                </p>
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Anchor designer, milestone schedule, gotchas."
                    className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast resize-none"
                  />
                </Field>
              </Card>
            </>
          )}

          {mode === "quick" && (
            <div className="rounded-md bg-accent-soft/40 px-4 py-3 text-xs text-text-secondary">
              <strong className="text-text-primary">Quick mode.</strong> Saves with sensible
              defaults (Sold, On-track, install 30 days out, no revenue yet). Fill the rest from the
              project page when you&apos;re off the call.
            </div>
          )}

          {submitError && (
            <div className="bg-status-blocked-soft border border-status-blocked/30 rounded-md p-3 text-sm text-status-blocked">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              href="/"
              className="rounded-full px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors duration-fast"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={cn(
                "rounded-full bg-ink-pill text-white px-4 py-1.5 text-sm font-medium hover:bg-accent-active transition-colors duration-fast",
                "disabled:bg-text-disabled disabled:cursor-not-allowed"
              )}
            >
              {submitting ? "Creating" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast",
        active ? "bg-ink-pill text-white" : "text-text-secondary hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

function SourcePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(
    value && !(JOB_SOURCE_PRESETS as readonly string[]).includes(value)
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {JOB_SOURCE_PRESETS.map((preset) => {
          const isActive = !custom && value === preset;
          const isOther = preset === "Other";
          return (
            <button
              type="button"
              key={preset}
              onClick={() => {
                if (isOther) {
                  setCustom(true);
                  onChange("");
                } else {
                  setCustom(false);
                  onChange(preset);
                }
              }}
              aria-pressed={isActive || (custom && isOther) ? true : false}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast",
                isActive || (custom && isOther)
                  ? "bg-ink-pill text-white"
                  : "bg-surface-muted text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
              )}
            >
              {preset}
            </button>
          );
        })}
      </div>
      {custom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tell us how they found us"
          autoFocus
          className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
      )}
    </div>
  );
}

function NewProjectDocumentsBlock({
  pending,
  onAdd,
  onRemove,
}: {
  pending: PendingDoc[];
  onAdd: (doc: {
    kind: DocumentKind;
    label: string;
    driveUrl: string;
    version: string | null;
  }) => void;
  onRemove: (tempId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <AddDocumentForm onSave={onAdd} compact />
      {pending.length > 0 && (
        <ul className="space-y-1.5">
          {pending.map((p) => (
            <li
              key={p.tempId}
              className="flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-0.5">
                  {p.kind.replace(/_/g, " ")}
                  {p.version && ` . ${p.version}`}
                </div>
                <div className="font-medium text-text-primary truncate">{p.label}</div>
                <div className="text-xs text-text-tertiary truncate">{p.driveUrl}</div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(p.tempId)}
                className="text-text-tertiary hover:text-status-blocked transition-colors duration-fast p-1 rounded shrink-0"
                aria-label="Remove"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-text-tertiary">
        Documents save to the project after you click Create project.
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function CollapsibleCard({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface-muted hover:bg-surface-sunken transition-colors duration-fast text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            {open ? title : `${title} (optional)`}
          </h2>
          {description && !open && (
            <p className="text-xs text-text-tertiary mt-0.5 truncate">{description}</p>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" strokeWidth={1.75} />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-tertiary shrink-0" strokeWidth={1.75} />
        )}
      </button>
      {open && <div className="p-5">{children}</div>}
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
