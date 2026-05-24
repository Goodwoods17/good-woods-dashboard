"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { Briefing, BriefingRow } from "@features/briefing/lib/types";

// Slim, single-line briefing strip — replaces the prior 4-line card.
// Lives at the top of `/` above the Hitlist as a recessive context line,
// not as a competing focal point. The full briefing remains at /briefing.

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

  const itemCount = briefing.items.length;
  // Use the summary if present, otherwise lean on the count.
  const teaser =
    briefing.summary && briefing.summary.length > 0
      ? briefing.summary
      : `${itemCount} thing${itemCount === 1 ? "" : "s"} to look at today.`;

  return (
    <Link
      href="/briefing"
      className="group flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-fast mb-2"
      aria-label="Open today's briefing"
    >
      <Sparkles
        className="h-3.5 w-3.5 text-accent shrink-0"
        strokeWidth={1.75}
      />
      <span className="text-xs uppercase tracking-[0.06em] text-text-tertiary shrink-0">
        Today
      </span>
      <span className="text-text-tertiary shrink-0">·</span>
      <span className="truncate min-w-0 italic font-serif text-base text-text-secondary group-hover:text-text-primary transition-colors duration-fast">
        {teaser}
      </span>
      <ArrowRight
        className="h-3 w-3 text-text-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all duration-fast shrink-0"
        strokeWidth={2}
      />
    </Link>
  );
}
