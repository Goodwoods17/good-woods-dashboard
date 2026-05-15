"use client";

import { AlertOctagon } from "lucide-react";
import type { AndonEvent } from "@features/shop/lib/shopStore";

export function AndonBanner({
  events,
  onResolve,
}: {
  events: AndonEvent[];
  onResolve: (id: string) => void;
}) {
  if (events.length === 0) return null;

  return (
    <div className="mb-4 bg-status-andon-soft border border-status-andon rounded-lg p-3 flex items-start gap-3">
      <AlertOctagon
        className="h-5 w-5 text-status-andon shrink-0 mt-0.5 animate-pulse"
        strokeWidth={2}
      />
      <div className="flex-1">
        <div className="text-sm font-semibold text-status-andon mb-1">
          {events.length} active andon{events.length === 1 ? "" : "s"}
        </div>
        <ul className="space-y-1">
          {events.map((a) => (
            <li
              key={a.id}
              className="text-xs text-status-andon flex items-center gap-2"
            >
              <span className="font-medium uppercase tracking-wider">{a.station}</span>
              <span>·</span>
              <span className="flex-1">{a.message}</span>
              <button
                onClick={() => onResolve(a.id)}
                className="text-text-secondary hover:text-status-on-track text-xs underline"
              >
                resolve
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
