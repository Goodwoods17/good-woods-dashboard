"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { Briefing, BriefingRow } from "@features/briefing/lib/types";
import { cn } from "@shared/lib/utils";

const SEVERITY_DOT = {
  red: "bg-status-blocked",
  yellow: "bg-status-at-risk",
  green: "bg-status-on-track",
} as const;

export function BriefingCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!hasSupabase()) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from("briefings")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setBriefing((data as BriefingRow | null) ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  if (!briefing) return null;

  const top = briefing.items.slice(0, 3);

  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4 mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-tertiary">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          Today&apos;s briefing
        </div>
        <Link
          href="/briefing"
          className="text-xs text-accent hover:text-accent-hover inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      <p className="text-sm text-text-primary mb-3 leading-relaxed">
        {briefing.summary}
      </p>
      {top.length > 0 && (
        <ul className="space-y-1.5">
          {top.map((item, i) => (
            <li
              key={`${item.job_id}-${i}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[item.severity])}
              />
              <Link
                href={`/jobs/${item.job_id}`}
                className="text-text-primary hover:underline"
              >
                {item.headline}
              </Link>
              <span className="text-text-tertiary text-xs ml-auto">
                {item.job_code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
