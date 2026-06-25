"use client";

import type { FormInstance } from "@shared/lib/types";
import { useFormInstances } from "../lib/formInstancesStore";
import {
  RECIPIENT_STATUS_ORDER,
  daysSinceLabel,
  recipientStatus,
  statusLabel,
} from "../lib/shareTracking";
import { formatDate } from "@shared/lib/format";

/**
 * Owner-private tracking surface (Forms P2 · Slice 3). For each share link minted
 * from this instance, shows a Sent → Opened → Started → Submitted pill track plus
 * the date sent + an "N days ago" counter (Andrew's explicit ask) and the date the
 * recipient opened it. Never rendered on the public /f/<token> page — this reads
 * the authenticated owner's store, which the public path never mounts.
 */
export function RecipientStatusList({ instance }: { instance: FormInstance }) {
  const { shareLinksForInstance } = useFormInstances();
  const links = shareLinksForInstance(instance.id);
  if (links.length === 0) return null;

  return (
    <div className="mt-3 space-y-2" data-testid="recipient-status-list">
      {links.map((link) => {
        const status = recipientStatus(link);
        const reached = RECIPIENT_STATUS_ORDER.indexOf(status);
        // A sent date drives the "N days ago" counter; fall back to created so the
        // owner always sees an age even before a link is explicitly marked sent.
        const sentRef = link.sentAt ?? link.createdAt;
        return (
          <div
            key={link.id}
            data-testid="recipient-status-row"
            className="rounded-lg border border-border bg-surface-muted/40 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-text-primary">
                {link.recipientName || "Recipient"}
              </span>
              <span
                className="shrink-0 rounded-full bg-ink-pill px-2 py-0.5 text-[11px] font-medium text-white"
                data-testid="recipient-status-pill"
              >
                {statusLabel(status)}
              </span>
            </div>

            {/* The ordered funnel track; each reached step fills in. */}
            <div className="mt-1.5 flex items-center gap-1">
              {RECIPIENT_STATUS_ORDER.map((step, i) => (
                <div key={step} className="flex flex-1 items-center gap-1">
                  <span
                    className={
                      "h-1.5 w-1.5 shrink-0 rounded-full " +
                      (i <= reached ? "bg-ink-pill" : "bg-border")
                    }
                    aria-hidden
                  />
                  <span
                    className={
                      "text-[10px] " + (i <= reached ? "text-text-secondary" : "text-text-tertiary")
                    }
                  >
                    {statusLabel(step)}
                  </span>
                </div>
              ))}
            </div>

            <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-tertiary">
              <div className="flex gap-1">
                <dt>Sent</dt>
                <dd className="text-text-secondary" data-testid="recipient-sent">
                  {formatDate(sentRef.slice(0, 10))} · {daysSinceLabel(sentRef)}
                </dd>
              </div>
              {link.viewedAt && (
                <div className="flex gap-1">
                  <dt>Opened</dt>
                  <dd className="text-text-secondary" data-testid="recipient-opened">
                    {formatDate(link.viewedAt.slice(0, 10))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
