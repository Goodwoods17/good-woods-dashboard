import { describe, expect, it } from "vitest";
import {
  buildDocumentShareEmail,
  DEFAULT_RESEND_FROM,
  isValidEmail,
  resolveFromAddress,
  NOTIFY_PREF_LABELS,
  type NotifyPreference,
} from "./documentSendShareLink";

const URL = "https://app.goodwoods.test/d/tok_abcdefghijklmnopqrstuvwxyz123456";

describe("buildDocumentShareEmail", () => {
  it("includes the job name in the subject and body", () => {
    const email = buildDocumentShareEmail({
      recipientName: "Casey Client",
      jobName: "Saywell Kitchen",
      shareUrl: URL,
    });
    expect(email.subject).toContain("Saywell Kitchen");
    expect(email.html).toContain("Saywell Kitchen");
    expect(email.text).toContain("Saywell Kitchen");
  });

  it("embeds the share URL in the body", () => {
    const email = buildDocumentShareEmail({
      recipientName: null,
      jobName: "Saywell Kitchen",
      shareUrl: URL,
    });
    expect(email.html).toContain(URL);
    expect(email.text).toContain(URL);
  });

  it("addresses the recipient by name when provided", () => {
    const email = buildDocumentShareEmail({
      recipientName: "Dana Designer",
      jobName: "Saywell Kitchen",
      shareUrl: URL,
    });
    expect(email.text).toMatch(/Dana Designer/);
    expect(email.html).toMatch(/Dana Designer/);
  });

  it("falls back to a generic greeting when the recipient is unnamed", () => {
    const email = buildDocumentShareEmail({
      recipientName: null,
      jobName: "Saywell Kitchen",
      shareUrl: URL,
    });
    expect(email.text).not.toMatch(/null/);
    expect(email.html).not.toMatch(/null/);
    expect(email.text).toContain("Hi,");
  });

  it("escapes HTML in the recipient name and job name (no injection)", () => {
    const email = buildDocumentShareEmail({
      recipientName: "<script>x</script>",
      jobName: "<b>Kitchen</b>",
      shareUrl: URL,
    });
    expect(email.html).not.toContain("<script>x</script>");
    expect(email.html).not.toContain("<b>Kitchen</b>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible address", () => {
    expect(isValidEmail("dana@example.com")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("resolveFromAddress", () => {
  it("uses RESEND_FROM when present", () => {
    expect(resolveFromAddress("docs@goodwoods.test")).toBe("docs@goodwoods.test");
  });
  it("defaults to the Resend onboarding sender when unset", () => {
    expect(resolveFromAddress(undefined)).toBe(DEFAULT_RESEND_FROM);
    expect(resolveFromAddress("")).toBe(DEFAULT_RESEND_FROM);
  });
});

describe("NOTIFY_PREF_LABELS", () => {
  it("has a label for every preference value", () => {
    const prefs: NotifyPreference[] = ["everything", "major", "digest"];
    for (const p of prefs) {
      expect(typeof NOTIFY_PREF_LABELS[p]).toBe("string");
      expect(NOTIFY_PREF_LABELS[p].length).toBeGreaterThan(0);
    }
  });
});
