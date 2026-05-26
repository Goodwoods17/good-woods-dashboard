import type { Contact, Job } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";

export type ContactRollup = {
  contact: Contact;
  /** Jobs where this contact is the payer. The economic story. */
  payerJobs: Job[];
  lifetimeRevenue: number;
  lifetimeMargin: number;
  activeJobCount: number;
  latestInstall: string | null;
  /** Days since last_touched_at, or null if never touched. */
  daysSinceTouch: number | null;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

export function rollupContact(contact: Contact, jobs: Job[], now: Date = new Date()): ContactRollup {
  const payerJobs = jobs.filter((j) => j.payerId === contact.id);
  const lifetimeRevenue = payerJobs.reduce((s, j) => s + j.revenue, 0);
  const lifetimeMargin = payerJobs.reduce(
    (s, j) => s + computeMargin(j).marginAmount,
    0
  );
  const installs = payerJobs
    .map((j) => j.installDate)
    .filter(Boolean)
    .sort()
    .reverse();
  return {
    contact,
    payerJobs,
    lifetimeRevenue,
    lifetimeMargin,
    activeJobCount: payerJobs.filter((j) => j.pipelineStatus !== "complete").length,
    latestInstall: installs[0] ?? null,
    daysSinceTouch: daysSince(contact.lastTouchedAt, now),
  };
}

/**
 * Anchors first (sorted by lifetime revenue desc), then everyone else
 * (also by lifetime revenue desc). The pinning is the visual contract
 * from /impeccable craft P1 #7: anchor rows get a left-edge clay dot.
 */
export function sortContactsForList(rollups: ContactRollup[]): ContactRollup[] {
  return [...rollups].sort((a, b) => {
    if (a.contact.isAnchor !== b.contact.isAnchor) {
      return a.contact.isAnchor ? -1 : 1;
    }
    return b.lifetimeRevenue - a.lifetimeRevenue;
  });
}

export function rollupContacts(contacts: Contact[], jobs: Job[], now: Date = new Date()): ContactRollup[] {
  const active = contacts.filter((c) => !c.archivedAt);
  return sortContactsForList(active.map((c) => rollupContact(c, jobs, now)));
}

/**
 * Contacts that were `introduced_by_id = this contact`. Used on the
 * contact detail page's "Introduced clients" subtable. Aggregates each
 * introduced contact's lifetime revenue so Andrew can see, e.g., how
 * much business Raubyn has steered into the shop.
 */
export function rollupIntroducedClients(
  contact: Contact,
  contacts: Contact[],
  jobs: Job[],
  now: Date = new Date()
): ContactRollup[] {
  const introduced = contacts.filter((c) => c.introducedById === contact.id);
  return sortContactsForList(introduced.map((c) => rollupContact(c, jobs, now)));
}
