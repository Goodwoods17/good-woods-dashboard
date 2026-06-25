import { describe, expect, it } from "vitest";
import type { FormInstanceField, FormShareLink } from "@shared/lib/types";
import {
  filterLockedAnswers,
  generateShareToken,
  isShareLinkActive,
  lockedAnswerKeys,
} from "./shareLink";
import { rowToFormShareLink, formShareLinkToRow } from "./formShareLinksRowMap";

function field(id: string, over: Partial<FormInstanceField> = {}): FormInstanceField {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id,
    instanceId: "inst-1",
    label: `Field ${id}`,
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
    submittedAt: null,
    revokedAt: null,
    createdAt: now,
    createdBy: null,
    ...over,
  };
}

describe("generateShareToken", () => {
  it("produces an opaque url-safe string of at least 32 chars", () => {
    const t = generateShareToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different token each call (no collisions across a batch)", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateShareToken()));
    expect(tokens.size).toBe(500);
  });
});

describe("isShareLinkActive", () => {
  it("is active when not revoked", () => {
    expect(isShareLinkActive(link())).toBe(true);
  });

  it("is NOT active once revoked", () => {
    expect(isShareLinkActive(link({ revokedAt: "2026-06-26T00:00:00.000Z" }))).toBe(false);
  });
});

describe("filterLockedAnswers — server-side lock enforcement", () => {
  const fields = [field("a"), field("b"), field("c")];

  it("passes through answers for unlocked fields", () => {
    const incoming = { a: { checked: true }, b: { value: "hi" } };
    const out = filterLockedAnswers(incoming, link({ lockedFieldIds: [] }), fields);
    expect(out).toEqual(incoming);
  });

  it("REJECTS (drops) any answer aimed at a locked field id", () => {
    const incoming = { a: { checked: true }, b: { checked: true } };
    const out = filterLockedAnswers(incoming, link({ lockedFieldIds: ["b"] }), fields);
    expect(out).toEqual({ a: { checked: true } });
    expect(out).not.toHaveProperty("b");
  });

  it("drops answers for unknown field ids (not part of this instance)", () => {
    const incoming = { a: { checked: true }, zzz: { checked: true } };
    const out = filterLockedAnswers(incoming, link({ lockedFieldIds: [] }), fields);
    expect(out).toEqual({ a: { checked: true } });
  });

  it("never lets a locked field through even if it is the only answer", () => {
    const incoming = { b: { checked: true } };
    const out = filterLockedAnswers(incoming, link({ lockedFieldIds: ["b"] }), fields);
    expect(out).toEqual({});
  });
});

describe("lockedAnswerKeys — what was rejected (for an audit/diagnostic)", () => {
  const fields = [field("a"), field("b")];
  it("lists the locked ids that an incoming payload tried to set", () => {
    const incoming = { a: { checked: true }, b: { checked: true } };
    expect(lockedAnswerKeys(incoming, link({ lockedFieldIds: ["b"] }), fields)).toEqual(["b"]);
  });
  it("is empty when nothing locked was touched", () => {
    const incoming = { a: { checked: true } };
    expect(lockedAnswerKeys(incoming, link({ lockedFieldIds: ["b"] }), fields)).toEqual([]);
  });
});

describe("formShareLinksRowMap round-trip", () => {
  it("round-trips a link through row ↔ domain", () => {
    const l = link({ lockedFieldIds: ["a", "b"], recipientType: "customer" });
    expect(rowToFormShareLink(formShareLinkToRow(l))).toEqual(l);
  });

  it("coerces an unknown recipient_type to 'other'", () => {
    const row = formShareLinkToRow(link());
    row.recipient_type = "alien";
    expect(rowToFormShareLink(row).recipientType).toBe("other");
  });

  it("coerces a null/garbage locked_field_ids to []", () => {
    const row = formShareLinkToRow(link());
    row.locked_field_ids = null;
    expect(rowToFormShareLink(row).lockedFieldIds).toEqual([]);
  });
});
