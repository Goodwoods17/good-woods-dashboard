import { describe, expect, it } from "vitest";
import type { FormShareLink } from "@shared/lib/types";
import {
  daysSinceLabel,
  shareLinkStatus,
  shareLinkStatusLabel,
  shareLinkTracking,
  stampSentAt,
  type ShareLinkStatus,
} from "./shareLinkTracking";

function link(over: Partial<FormShareLink> = {}): FormShareLink {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id: "link-1",
    instanceId: "inst-1",
    token: "tok",
    recipientName: "Sam Designer",
    recipientType: "designer",
    lockedFieldIds: [],
    sentAt: null,
    viewedAt: null,
    startedAt: null,
    submittedAt: null,
    progress: null,
    revokedAt: null,
    submitIp: null,
    submitUserAgent: null,
    createdAt: now,
    createdBy: null,
    ...over,
  };
}

describe("daysSinceLabel — human days-since counter (Andrew's explicit ask)", () => {
  const now = new Date("2026-06-25T12:00:00.000Z");

  it("returns null for a null timestamp", () => {
    expect(daysSinceLabel(null, now)).toBeNull();
  });

  it("says 'Today' for the same calendar day", () => {
    expect(daysSinceLabel("2026-06-25T08:00:00.000Z", now)).toBe("Today");
  });

  it("says '1 day ago' for yesterday (singular)", () => {
    expect(daysSinceLabel("2026-06-24T08:00:00.000Z", now)).toBe("1 day ago");
  });

  it("says 'N days ago' for older dates (plural)", () => {
    expect(daysSinceLabel("2026-06-20T08:00:00.000Z", now)).toBe("5 days ago");
  });

  it("never produces a negative count for a near-future clock skew", () => {
    expect(daysSinceLabel("2026-06-25T18:00:00.000Z", now)).toBe("Today");
  });
});

describe("shareLinkTracking — owner-only status surface model", () => {
  it("derives 'draft' before sending", () => {
    expect(shareLinkTracking(link()).status).toBe("draft");
  });

  it("derives 'sent' once sentAt is set", () => {
    const t = shareLinkTracking(link({ sentAt: "2026-06-24T00:00:00.000Z" }));
    expect(t.status).toBe("sent");
  });

  it("derives 'opened' once viewedAt is set", () => {
    const t = shareLinkTracking(
      link({ sentAt: "2026-06-24T00:00:00.000Z", viewedAt: "2026-06-24T01:00:00.000Z" })
    );
    expect(t.status).toBe("opened");
  });

  it("derives 'started' once startedAt is set but not yet submitted", () => {
    const t = shareLinkTracking(
      link({
        sentAt: "2026-06-24T00:00:00.000Z",
        viewedAt: "2026-06-24T01:00:00.000Z",
        startedAt: "2026-06-24T02:00:00.000Z",
      })
    );
    expect(t.status).toBe("started");
  });

  it("derives 'submitted' once submittedAt is set (regardless of started)", () => {
    const t = shareLinkTracking(
      link({ startedAt: "2026-06-24T02:00:00.000Z", submittedAt: "2026-06-24T03:00:00.000Z" })
    );
    expect(t.status).toBe("submitted");
  });

  it("revoked takes precedence over everything", () => {
    const t = shareLinkTracking(
      link({ submittedAt: "2026-06-24T03:00:00.000Z", revokedAt: "2026-06-24T04:00:00.000Z" })
    );
    expect(t.status).toBe("revoked");
  });

  it("surfaces the sent date + days-since + opened date for the owner", () => {
    const now = new Date("2026-06-25T12:00:00.000Z");
    const t = shareLinkTracking(
      link({
        sentAt: "2026-06-23T09:00:00.000Z",
        viewedAt: "2026-06-24T15:00:00.000Z",
      }),
      now
    );
    expect(t.sentAt).toBe("2026-06-23T09:00:00.000Z");
    expect(t.daysSinceSent).toBe("2 days ago");
    expect(t.viewedAt).toBe("2026-06-24T15:00:00.000Z");
  });

  it("daysSinceSent is null before the link is sent", () => {
    expect(shareLinkTracking(link()).daysSinceSent).toBeNull();
  });
});

// Status derivation + label + stamp — folded in from the former shareLinkStatus
// module (Phase C consolidation). Behavior is unchanged; only the import path moved.
describe("shareLinkStatus — status derivation", () => {
  it("is 'draft' when sentAt is null", () => {
    const status: ShareLinkStatus = shareLinkStatus(link({ sentAt: null }));
    expect(status).toBe("draft");
  });

  it("is 'sent' when sentAt is set but viewedAt is null", () => {
    const status: ShareLinkStatus = shareLinkStatus(
      link({ sentAt: "2026-06-25T01:00:00.000Z", viewedAt: null })
    );
    expect(status).toBe("sent");
  });

  it("is 'opened' when sentAt + viewedAt are set but submittedAt is null", () => {
    const status: ShareLinkStatus = shareLinkStatus(
      link({
        sentAt: "2026-06-25T01:00:00.000Z",
        viewedAt: "2026-06-25T02:00:00.000Z",
        submittedAt: null,
      })
    );
    expect(status).toBe("opened");
  });

  it("is 'submitted' when submittedAt is set (regardless of sentAt/viewedAt)", () => {
    const status: ShareLinkStatus = shareLinkStatus(
      link({ submittedAt: "2026-06-25T03:00:00.000Z" })
    );
    expect(status).toBe("submitted");
  });

  it("is 'revoked' when revokedAt is set", () => {
    const status: ShareLinkStatus = shareLinkStatus(
      link({ revokedAt: "2026-06-25T04:00:00.000Z" })
    );
    expect(status).toBe("revoked");
  });

  it("revoked takes precedence over submitted", () => {
    const status: ShareLinkStatus = shareLinkStatus(
      link({
        submittedAt: "2026-06-25T03:00:00.000Z",
        revokedAt: "2026-06-25T04:00:00.000Z",
      })
    );
    expect(status).toBe("revoked");
  });
});

describe("shareLinkStatusLabel — human-readable label", () => {
  it("returns the correct label for each status", () => {
    expect(shareLinkStatusLabel("draft")).toBe("Draft");
    expect(shareLinkStatusLabel("sent")).toBe("Sent");
    expect(shareLinkStatusLabel("opened")).toBe("Opened");
    expect(shareLinkStatusLabel("submitted")).toBe("Submitted");
    expect(shareLinkStatusLabel("revoked")).toBe("Revoked");
  });
});

describe("stampSentAt — mark a link as shared", () => {
  it("stamps sentAt when currently null", () => {
    const before = link({ sentAt: null });
    const after = stampSentAt(before);
    expect(after.sentAt).not.toBeNull();
    // ISO 8601 string.
    expect(() => new Date(after.sentAt!).toISOString()).not.toThrow();
  });

  it("is idempotent — does NOT overwrite an existing sentAt", () => {
    const original = "2026-06-25T01:00:00.000Z";
    const before = link({ sentAt: original });
    const after = stampSentAt(before);
    expect(after.sentAt).toBe(original);
  });

  it("returns a new object (does not mutate)", () => {
    const before = link({ sentAt: null });
    const after = stampSentAt(before);
    expect(after).not.toBe(before);
    expect(before.sentAt).toBeNull();
  });
});
