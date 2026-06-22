"use client";

import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { cn } from "@shared/lib/utils";
import { useLabour } from "@features/labour/lib/labourStore";
import { TimersBoard } from "./TimersBoard";
import { BottleneckAnalytics } from "./BottleneckAnalytics";
import { TimeCardsView } from "./TimeCardsView";
import { LabourSetup } from "./LabourSetup";

type Tab = "timers" | "analytics" | "timecards" | "setup";

export function LabourView() {
  const { running, suggestions, loading, error } = useLabour();
  const [tab, setTab] = useState<Tab>("timers");

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "timers", label: "Timers", count: running.length || undefined },
    { key: "analytics", label: "Bottlenecks", count: suggestions.length || undefined },
    { key: "timecards", label: "Time cards" },
    { key: "setup", label: "Setup" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Shop labour"
        title="Time &amp; bottlenecks"
        subtitle="Live timers per operation — find where the shop clogs, and feed real minutes back into the estimator."
      />
      <div className="max-w-5xl px-4 py-6 md:px-8">
        <div className="mb-5 inline-flex gap-1 rounded-full bg-surface-muted/70 p-1 shadow-floating">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-fast",
                tab === t.key
                  ? "bg-ink-pill text-white"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    tab === t.key ? "text-white/70" : "text-text-tertiary"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-4" aria-hidden>
            <div className="h-40 rounded-2xl bg-surface shadow-resting" />
            <div className="h-32 rounded-2xl bg-surface shadow-resting" />
          </div>
        ) : tab === "timers" ? (
          <TimersBoard />
        ) : tab === "analytics" ? (
          <BottleneckAnalytics />
        ) : tab === "timecards" ? (
          <TimeCardsView />
        ) : (
          <LabourSetup />
        )}
      </div>
    </>
  );
}
