"use client";
import { useState } from "react";
import { Play, AlertTriangle, Check } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useLabour, type LabourWorker } from "@features/labour/lib/labourStore";
import { TaskTimer } from "@features/labour/components/TaskTimer";
import { suggestedMinutes } from "@features/labour/lib/pace";
import { useWorkCards, type WorkCard } from "../lib/workCardsStore";

export function WorkCardItem({ card, workers, now }: { card: WorkCard; workers: LabourWorker[]; now: number }) {
  const { startTimer, stopTimer, pauseTimer, resumeTimer, running, sessions, operationById } = useLabour();
  const { updateCard } = useWorkCards();
  const [pickWorker, setPickWorker] = useState("");

  // Sessions running against THIS card (many workers → many sessions).
  const cardRunning = running.filter((s) => s.cardId === card.id);
  const op = card.operationId ? operationById.get(card.operationId) : undefined;
  const completed = card.operationId ? sessions.filter((s) => s.operationId === card.operationId && s.endedAt) : [];

  function startFor(workerId: string) {
    if (!card.operationId) return; // uncoded cards can't time against a code yet (Task 7 lets you assign one)
    startTimer({
      operationId: card.operationId,
      workerId: workerId || null,
      jobId: card.jobId,
      cardId: card.id,
      targetQuantity: card.targetQuantity,
    });
    if (card.status === "todo") updateCard(card.id, { status: "doing" });
    setPickWorker("");
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-3 space-y-2 shadow-resting">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-text-primary">{card.description}</div>
          <div className="text-caption text-text-tertiary">
            {card.operationId ? (op?.code ?? "") : "uncoded"}
            {card.targetQuantity != null ? ` · target ${card.targetQuantity}` : ""}
          </div>
        </div>
        {card.status === "stuck" && (
          <span className="inline-flex items-center gap-1 text-caption text-status-at-risk">
            <AlertTriangle className="h-3 w-3" /> stuck
          </span>
        )}
      </div>

      {/* Running timers (one per worker) */}
      {cardRunning.map((s) => {
        const suggested = op ? suggestedMinutes(op, completed, s.targetQuantity, null) : { minutes: null, source: null, sampleCount: 0 };
        return (
          <TaskTimer
            key={s.id}
            session={s}
            title={card.description}
            meta={{ worker: workers.find((w) => w.id === s.workerId)?.name ?? null }}
            driverUnit={op?.driverUnit ?? null}
            suggested={suggested}
            estimateMinutes={null}
            now={now}
            onPause={() => pauseTimer(s.id)}
            onResume={() => resumeTimer(s.id)}
            onStop={(quantity) => stopTimer(s.id, quantity)}
          />
        );
      })}

      {/* Start control: pick a worker → Start (only for coded cards not done) */}
      {card.status !== "done" && card.operationId && (
        <div className="flex items-center gap-2">
          <select
            value={pickWorker}
            onChange={(e) => setPickWorker(e.target.value)}
            className="flex-1 rounded-md bg-surface-muted border border-border px-2 py-1 text-sm text-text-primary"
            aria-label="Pick a worker to start"
          >
            <option value="">Worker…</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button
            onClick={() => startFor(pickWorker)}
            disabled={!pickWorker}
            className="inline-flex items-center gap-1 rounded-full bg-ink-pill text-white px-3 py-1 text-sm disabled:bg-text-disabled disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        </div>
      )}

      {/* Status actions */}
      <div className="flex items-center gap-3 text-caption">
        {card.status !== "done" && (
          <button onClick={() => updateCard(card.id, { status: "done" })} className="inline-flex items-center gap-1 text-status-on-track">
            <Check className="h-3 w-3" /> Mark done
          </button>
        )}
        {card.status !== "stuck" ? (
          <button
            onClick={() => { const r = window.prompt("What's it waiting on?") ?? ""; updateCard(card.id, { status: "stuck", stuckReason: r }); }}
            className="text-status-at-risk"
          >Flag stuck</button>
        ) : (
          <button onClick={() => updateCard(card.id, { status: "doing", stuckReason: null })} className="text-text-tertiary">Unstick</button>
        )}
      </div>
    </div>
  );
}
