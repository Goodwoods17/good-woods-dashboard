"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Download, Rss } from "lucide-react";

/**
 * Client-side "add to calendar" buttons for the public schedule portal (S21,
 * issue #109). Three ways to take the firm install day + milestone weeks with
 * you:
 *
 *  • Subscribe (webcal://) — the calendar AUTO-UPDATES when a date shifts. The
 *    star option; works in Apple Calendar / Outlook.
 *  • Add to Google Calendar — Google's subscribe-by-URL endpoint.
 *  • Download .ics — a one-time snapshot for any calendar app.
 *
 * The absolute host is only known in the browser, so this is a small client
 * island; the rest of the portal stays a server component. The feed itself is
 * served by the tokenized `/s/<token>/feed.ics` route — there is no private data
 * here, only the same client-safe view rendered above.
 */
export function AddToCalendar({ token }: { token: string }) {
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Relative URL works for the plain download even before hydration.
  const feedPath = `/s/${token}/feed.ics`;
  const host = origin ? origin.replace(/^https?:\/\//, "") : null;
  const webcalUrl = host ? `webcal://${host}${feedPath}` : null;
  const httpsFeed = origin ? `${origin}${feedPath}` : feedPath;
  const googleUrl = httpsFeed
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsFeed)}`
    : null;

  return (
    <section
      className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-resting"
      data-testid="client-add-to-calendar"
    >
      <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Add to your calendar</p>
      <p className="mt-1 text-sm text-text-secondary">
        Subscribe and your calendar updates automatically if a date changes.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          data-testid="client-calendar-subscribe"
          href={webcalUrl ?? feedPath}
          className="inline-flex items-center gap-2 rounded-full bg-status-on-track px-4 py-2 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90"
        >
          <Rss className="h-3.5 w-3.5" strokeWidth={2} />
          Subscribe (auto-updates)
        </a>

        {googleUrl ? (
          <a
            data-testid="client-calendar-google"
            href={googleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-border-strong hover:text-text-primary"
          >
            <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Google Calendar
          </a>
        ) : null}

        <a
          data-testid="client-calendar-download"
          href={feedPath}
          download="good-woods-schedule.ics"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-border-strong hover:text-text-primary"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Download .ics
        </a>
      </div>
    </section>
  );
}
