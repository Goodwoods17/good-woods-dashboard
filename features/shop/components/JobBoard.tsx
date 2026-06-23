"use client";
import { useLabour, useNow } from "@features/labour/lib/labourStore";
import { PHASE_ORDER, PHASE_LABELS, type PhaseId } from "@features/job-costing/lib/costCodes";
import { useWorkCards } from "../lib/workCardsStore";
import { WorkCardItem } from "./WorkCardItem";
import { useJobBlockers } from "@features/jobs/lib/jobBlockersStore";
import { partyLabel, blockerAgeDays, phaseGatingBlocker } from "@features/jobs/lib/jobBlockers";
import { useContacts } from "@features/contacts/lib/contactsStore";

export function JobBoard({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { cardsForJob } = useWorkCards();
  const { workers } = useLabour();
  const now = useNow();
  const cards = cardsForJob(jobId);

  const { activeForJob } = useJobBlockers();
  const { contacts } = useContacts();
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name;
  const nowDate = new Date(now);
  const active = activeForJob(jobId);
  const wholeJobBlockers = active.filter((b) => b.gatedPhaseId === null);

  return (
    <div>
      <h2 className="text-base font-semibold text-text-primary mb-3">{jobName}</h2>
      {wholeJobBlockers.map((b) => (
        <span
          key={b.id}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-status-blocked-soft px-2.5 py-1 text-xs font-medium text-status-blocked"
        >
          ⏳ externally blocked — waiting on {partyLabel(b, contactName)} ·{" "}
          {blockerAgeDays(b, nowDate)}d
        </span>
      ))}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PHASE_ORDER.map((phase: PhaseId) => {
          const inPhase = cards.filter((c) => c.phaseId === phase).sort((a, b) => a.sort - b.sort);
          const gating = phaseGatingBlocker(active, phase);
          return (
            <div key={phase} className="bg-surface-muted/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-caption font-medium uppercase tracking-[0.04em] text-text-secondary">
                  {PHASE_LABELS[phase]}
                </h3>
                <span className="text-caption text-text-tertiary">{inPhase.length}</span>
              </div>
              {gating && (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-status-blocked-soft px-2.5 py-1 text-xs font-medium text-status-blocked">
                  ⏳ waiting on {partyLabel(gating, contactName)} ·{" "}
                  {blockerAgeDays(gating, nowDate)}d
                </span>
              )}
              <div className="space-y-2">
                {inPhase.length === 0 ? (
                  <p className="text-caption text-text-tertiary">No cards.</p>
                ) : (
                  inPhase.map((card) => (
                    <WorkCardItem key={card.id} card={card} workers={workers} now={now} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
