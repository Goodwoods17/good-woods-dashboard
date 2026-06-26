import { describe, expect, it } from "vitest";
import type { FormShareLink } from "@shared/lib/types";
import {
  shareLinkStatus,
  shareLinkStatusLabel,
  stampSentAt,
  type ShareLinkStatus,
} from "./shareLinkStatus";

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
    submittedAt: null,
    revokedAt: null,
    createdAt: now,
    createdBy: null,
    ...over,
  };
}

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
