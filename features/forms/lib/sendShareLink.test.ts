import { describe, expect, it } from "vitest";
import type { FormShareLink } from "@shared/lib/types";
import {
  buildShareEmail,
  canSendReminder,
  DEFAULT_RESEND_FROM,
  isValidEmail,
  resolveFromAddress,
  type SendMode,
} from "./sendShareLink";

function makeLink(over: Partial<FormShareLink> = {}): FormShareLink {
  return {
    id: "l1",
    instanceId: "i1",
    token: "tok_abcdefghijklmnopqrstuvwxyz123456",
    recipientName: "Casey Client",
    recipientType: "customer",
    lockedFieldIds: [],
    sentAt: null,
    viewedAt: null,
    startedAt: null,
    submittedAt: null,
    progress: null,
    revokedAt: null,
    submitIp: null,
    submitUserAgent: null,
    createdAt: "2026-06-25T00:00:00.000Z",
    createdBy: null,
    ...over,
  };
}

const URL = "https://app.goodwoods.test/f/tok_abcdefghijklmnopqrstuvwxyz123456";

describe("buildShareEmail", () => {
  it("addresses the recipient by name and embeds the share URL (initial send)", () => {
    const email = buildShareEmail({
      link: makeLink(),
      shareUrl: URL,
      mode: "send",
      formTitle: "Pre-Install Check",
    });
    expect(email.subject).toMatch(/Pre-Install Check/);
    expect(email.subject).not.toMatch(/reminder/i);
    expect(email.html).toContain(URL);
    expect(email.text).toContain(URL);
    expect(email.text).toMatch(/Casey Client/);
  });

  it("uses reminder wording when mode is reminder", () => {
    const email = buildShareEmail({
      link: makeLink({ sentAt: "2026-06-20T00:00:00.000Z" }),
      shareUrl: URL,
      mode: "reminder",
      formTitle: "Pre-Install Check",
    });
    expect(email.subject).toMatch(/reminder/i);
    expect(email.text).toMatch(/reminder/i);
    expect(email.html).toContain(URL);
  });

  it("falls back to a generic greeting when the recipient is unnamed", () => {
    const email = buildShareEmail({
      link: makeLink({ recipientName: null }),
      shareUrl: URL,
      mode: "send",
      formTitle: "Intake",
    });
    // No "Hi null" — a clean generic greeting instead.
    expect(email.text).not.toMatch(/null/);
    expect(email.html).not.toMatch(/null/);
  });

  it("escapes HTML in the recipient name and form title (no injection)", () => {
    const email = buildShareEmail({
      link: makeLink({ recipientName: "<script>x</script>" }),
      shareUrl: URL,
      mode: "send",
      formTitle: "<b>Title</b>",
    });
    expect(email.html).not.toContain("<script>x</script>");
    expect(email.html).not.toContain("<b>Title</b>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("canSendReminder", () => {
  it("is false before the link has ever been sent (use initial send instead)", () => {
    expect(canSendReminder(makeLink({ sentAt: null }))).toBe(false);
  });

  it("is true once sent and still outstanding (not submitted, not revoked)", () => {
    expect(canSendReminder(makeLink({ sentAt: "2026-06-20T00:00:00.000Z" }))).toBe(true);
  });

  it("is false once the recipient has submitted (nothing left to nudge)", () => {
    expect(
      canSendReminder(
        makeLink({ sentAt: "2026-06-20T00:00:00.000Z", submittedAt: "2026-06-21T00:00:00.000Z" })
      )
    ).toBe(false);
  });

  it("is false once revoked", () => {
    expect(
      canSendReminder(
        makeLink({ sentAt: "2026-06-20T00:00:00.000Z", revokedAt: "2026-06-21T00:00:00.000Z" })
      )
    ).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible address", () => {
    expect(isValidEmail("casey@example.com")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("resolveFromAddress", () => {
  it("uses RESEND_FROM when present", () => {
    expect(resolveFromAddress("forms@goodwoods.test")).toBe("forms@goodwoods.test");
  });
  it("defaults to the Resend onboarding sender when unset", () => {
    expect(resolveFromAddress(undefined)).toBe(DEFAULT_RESEND_FROM);
    expect(resolveFromAddress("")).toBe(DEFAULT_RESEND_FROM);
  });
});

// Type-only guard: SendMode is the two-value union the route + UI share.
const _modes: SendMode[] = ["send", "reminder"];
void _modes;
