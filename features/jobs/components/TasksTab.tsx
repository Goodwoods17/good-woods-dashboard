"use client";

import { useState } from "react";
import { Check, Circle, ArrowRight } from "lucide-react";
import {
  MILESTONE_STAGES,
  type Job,
  type JobBlocker,
  type MilestoneStage,
} from "@shared/lib/types";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useJobBlockers } from "@features/jobs/lib/jobBlockersStore";
import { phaseGatingBlocker, partyLabel } from "@features/jobs/lib/jobBlockers";
import { useContacts } from "@features/contacts/lib/contactsStore";
import { cn } from "@shared/lib/utils";

const STAGE_HINTS: Record<MilestoneStage, string> = {
  design: "Client sign-off on approved shop drawings, contract & estimate",
  cnc: "Sheet goods cut, parts machined and labelled",
  assembly: "Carcasses + drawers assembled, hardware bored",
  finishing: "Spray, sand, top-coat — 100% cure before pack",
  delivery: "All parts delivered to site",
  install: "On site, scribed, levelled, hardware adjusted, walk-through",
};

export function TasksTab({ job }: { job: Job }) {
  const { updateJob } = useJobs();
  const { activeForJob } = useJobBlockers();
  const { contacts } = useContacts();
  const [pendingStage, setPendingStage] = useState<MilestoneStage | null>(null);
  const [gatingBlocker, setGatingBlocker] = useState<JobBlocker | null>(null);
  const currentIdx = MILESTONE_STAGES.findIndex((s) => s.key === job.currentMilestone);

  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name;
  const stageLabel = (s: MilestoneStage) => MILESTONE_STAGES.find((m) => m.key === s)?.label ?? s;

  function advanceTo(stage: MilestoneStage) {
    const gating = phaseGatingBlocker(activeForJob(job.id), stage);
    if (gating) {
      setPendingStage(stage);
      setGatingBlocker(gating);
    } else {
      updateJob(job.id, { currentMilestone: stage });
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <header className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Build progress</h2>
        <p className="text-sm text-text-secondary">
          Tap a step to mark it done — the active milestone advances and an activity log entry is
          written automatically.
        </p>
      </header>

      {pendingStage && gatingBlocker && (
        <div className="flex flex-wrap items-center gap-3 min-h-[44px] rounded-lg border border-border bg-surface px-4 py-2.5">
          <span className="text-sm text-text-primary flex-1 min-w-[200px]">
            ⏳ {stageLabel(pendingStage)} is externally blocked — waiting on{" "}
            {partyLabel(gatingBlocker, contactName)}. Advance anyway?
          </span>
          <button
            onClick={() => {
              setPendingStage(null);
              setGatingBlocker(null);
            }}
            className="inline-flex items-center min-h-[44px] rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              updateJob(job.id, { currentMilestone: pendingStage });
              setPendingStage(null);
              setGatingBlocker(null);
            }}
            className="inline-flex items-center min-h-[44px] rounded-full bg-text-primary text-white px-4 py-1.5 text-sm font-medium hover:bg-status-blocked-soft hover:text-status-blocked transition-colors duration-fast"
          >
            Advance
          </button>
        </div>
      )}

      <ol className="space-y-2">
        {MILESTONE_STAGES.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <li key={stage.key}>
              <button
                onClick={() => advanceTo(stage.key)}
                className={cn(
                  "w-full text-left bg-surface border rounded-lg p-4 flex items-start gap-3 transition-all duration-fast",
                  isCurrent && "border-accent shadow-sm",
                  isPast && "border-border bg-surface-muted/40",
                  isFuture && "border-border hover:border-border-strong"
                )}
              >
                <div
                  className={cn(
                    "h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 transition-colors duration-fast",
                    isPast && "bg-status-on-track text-white",
                    isCurrent && "bg-white text-text-primary ring-2 ring-accent",
                    isFuture && "bg-surface border border-border text-text-tertiary"
                  )}
                >
                  {isPast ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : isCurrent ? (
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <Circle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isPast && "text-text-secondary",
                        isCurrent && "text-text-primary",
                        isFuture && "text-text-tertiary"
                      )}
                    >
                      {idx + 1}. {stage.label}
                    </span>
                    {isCurrent && (
                      <span className="text-micro uppercase tracking-wider text-accent font-semibold">
                        Active
                      </span>
                    )}
                    {isPast && (
                      <span className="text-micro uppercase tracking-wider text-status-on-track">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                    {STAGE_HINTS[stage.key]}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="text-xs text-text-tertiary px-1">
        Custom checklists per job arrive in M4 alongside the SOPs module.
      </div>
    </div>
  );
}
