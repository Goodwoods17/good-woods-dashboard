"use client";

import Link from "next/link";
import { Users, Plus } from "lucide-react";

/**
 * Locked from /impeccable craft review P1 #10: teach the next action.
 * Serif headline + body + ink-pill CTA. Not a dead "no data" placeholder.
 */
export function EmptyState() {
  return (
    <div className="bg-white rounded-xl shadow-resting p-10 text-center">
      <Users
        className="h-7 w-7 text-text-tertiary mx-auto mb-4"
        strokeWidth={1.5}
      />
      <h2 className="font-serif text-title font-medium text-text-primary">
        No contacts yet
      </h2>
      <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
        Track a designer, GC, or homeowner before the next job lands. Anchor
        relationships get pinned to the top and surface in the daily briefing
        when they go quiet.
      </p>
      <Link
        href="/crm/new"
        className="inline-flex items-center gap-1.5 mt-6 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Create contact
      </Link>
    </div>
  );
}
