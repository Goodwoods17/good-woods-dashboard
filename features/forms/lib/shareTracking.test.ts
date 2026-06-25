import { describe, expect, it } from "vitest";
import type { FormInstanceField, FormShareLink } from "@shared/lib/types";
import {
  recipientStatus,
  daysSince,
  daysSinceLabel,
  statusLabel,
  computeProgress,
} from "./shareTracking";

function fld(over: Partial<FormInstanceField> = {}): FormInstanceField {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id: "f",
    instanceId: "inst-1",
    label: "Field",
    type: "checkbox",
    config: {},
    value: null,
    checked: null,
    note: null,
    photoUrl: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

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
    signatureAffirmed: null,
    signedIp: null,
    signedUserAgent: null,
    revokedAt: null,
    createdAt: now,
    createdBy: null,
    ...over,
  };
}

describe("recipientStatus — the owner-private lifecycle pill", () => {
  it("is 'created' when only minted (no stamps)", () => {
    expect(recipientStatus(link())).toBe("created");
  });

  it("is 'sent' once sent_at is stamped", () => {
    expect(recipientStatus(link({ sentAt: "2026-06-25T01:00:00.000Z" }))).toBe("sent");
  });

  it("is 'opened' once viewed_at is stamped (even if sent_at is null)", () => {
    // Open-tracking is server-side and reliable; a link can be opened from a URL
    // that was shared out-of-band, so viewed implies the funnel regardless of sent.
    expect(recipientStatus(link({ viewedAt: "2026-06-25T02:00:00.000Z" }))).toBe("opened");
  });

  it("is 'started' once started_at is stamped", () => {
    expect(
      recipientStatus(
        link({ viewedAt: "2026-06-25T02:00:00.000Z", startedAt: "2026-06-25T02:05:00.000Z" })
      )
    ).toBe("started");
  });

  it("is 'submitted' once submitted_at is stamped (the terminal state)", () => {
    expect(
      recipientStatus(
        link({
          viewedAt: "2026-06-25T02:00:00.000Z",
          startedAt: "2026-06-25T02:05:00.000Z",
          submittedAt: "2026-06-25T02:10:00.000Z",
        })
      )
    ).toBe("submitted");
  });

  it("submitted wins even if earlier stamps are somehow absent (ordering by furthest reached)", () => {
    expect(recipientStatus(link({ submittedAt: "2026-06-25T02:10:00.000Z" }))).toBe("submitted");
  });
});

describe("daysSince — whole days between two ISO instants", () => {
  const now = new Date("2026-06-25T12:00:00.000Z");

  it("is 0 for the same day (under 24h)", () => {
    expect(daysSince("2026-06-25T01:00:00.000Z", now)).toBe(0);
  });

  it("counts full 24h windows", () => {
    expect(daysSince("2026-06-23T12:00:00.000Z", now)).toBe(2);
  });

  it("never goes negative for a future instant", () => {
    expect(daysSince("2026-06-30T12:00:00.000Z", now)).toBe(0);
  });

  it("returns null for a null instant", () => {
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("daysSinceLabel — human 'N days ago'", () => {
  const now = new Date("2026-06-25T12:00:00.000Z");

  it("says 'today' for 0 days", () => {
    expect(daysSinceLabel("2026-06-25T01:00:00.000Z", now)).toBe("today");
  });

  it("says '1 day ago' (singular)", () => {
    expect(daysSinceLabel("2026-06-24T11:00:00.000Z", now)).toBe("1 day ago");
  });

  it("says 'N days ago' (plural)", () => {
    expect(daysSinceLabel("2026-06-20T11:00:00.000Z", now)).toBe("5 days ago");
  });

  it("is empty for a null instant", () => {
    expect(daysSinceLabel(null, now)).toBe("");
  });
});

describe("computeProgress — owner-visible completion %", () => {
  it("is 0 when there are no answerable fields", () => {
    expect(computeProgress([fld({ type: "section" })])).toBe(0);
  });

  it("ignores layout (section) fields in the denominator", () => {
    const fields = [
      fld({ id: "h", type: "section" }),
      fld({ id: "a", type: "checkbox", checked: true }),
      fld({ id: "b", type: "checkbox", checked: null }),
    ];
    // 1 of 2 answerable answered.
    expect(computeProgress(fields)).toBe(50);
  });

  it("counts a non-empty value as answered", () => {
    const fields = [
      fld({ id: "a", type: "short_text", value: "hi" }),
      fld({ id: "b", type: "short_text", value: "" }),
    ];
    expect(computeProgress(fields)).toBe(50);
  });

  it("counts a stored photo/signature path as answered", () => {
    const fields = [fld({ id: "a", type: "signature", photoUrl: "form-photos/x.png" })];
    expect(computeProgress(fields)).toBe(100);
  });

  it("is 100 when every answerable field is answered", () => {
    const fields = [
      fld({ id: "a", type: "checkbox", checked: true }),
      fld({ id: "b", type: "yes_no", value: "yes" }),
    ];
    expect(computeProgress(fields)).toBe(100);
  });

  it("rounds to the nearest whole percent", () => {
    const fields = [
      fld({ id: "a", type: "checkbox", checked: true }),
      fld({ id: "b", type: "checkbox", checked: null }),
      fld({ id: "c", type: "checkbox", checked: null }),
    ];
    // 1/3 → 33
    expect(computeProgress(fields)).toBe(33);
  });
});

describe("statusLabel — display text per status", () => {
  it("maps each status to a capitalized label", () => {
    expect(statusLabel("created")).toBe("Created");
    expect(statusLabel("sent")).toBe("Sent");
    expect(statusLabel("opened")).toBe("Opened");
    expect(statusLabel("started")).toBe("Started");
    expect(statusLabel("submitted")).toBe("Submitted");
  });
});
