import { describe, it, expect } from "vitest";
import {
  formShareLinkToShareTokenRow,
  formShareLinkToShareTokenState,
  shareTokenRowToFormShareLink,
} from "./formShareTokenMap";
import type { ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import type { FormShareLink } from "@shared/lib/types";

function baseLink(over: Partial<FormShareLink> = {}): FormShareLink {
  return {
    id: "f5b00000-0000-4000-8000-000000000001",
    instanceId: "f1100000-0000-4000-8000-000000000001",
    token: "e2eformsharetokensonly0000000000000ab",
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
    createdAt: "2026-06-29T00:00:00.000Z",
    createdBy: "owner@goodwoods",
    ...over,
  };
}

describe("formShareLinkToShareTokenRow", () => {
  it("anchors on form_instance_id with capability_type=form and no other anchor", () => {
    const row = formShareLinkToShareTokenRow(baseLink());
    expect(row.capability_type).toBe("form");
    expect(row.form_instance_id).toBe("f1100000-0000-4000-8000-000000000001");
    expect(row.job_id).toBeNull();
    expect(row.document_id).toBeNull();
  });

  it("never expires (expires_at null) — form links live until manually revoked", () => {
    const row = formShareLinkToShareTokenRow(baseLink());
    expect(row.expires_at).toBeNull();
  });

  it("maps submit_ip/submit_user_agent onto the shared ip/ua columns", () => {
    const row = formShareLinkToShareTokenRow(
      baseLink({ submitIp: "203.0.113.7", submitUserAgent: "Mozilla/5.0" })
    );
    expect(row.ip).toBe("203.0.113.7");
    expect(row.ua).toBe("Mozilla/5.0");
  });

  it("preserves the id (parity with the legacy row) and shared columns verbatim", () => {
    const row = formShareLinkToShareTokenRow(
      baseLink({ viewedAt: "2026-06-29T12:00:00.000Z", revokedAt: "2026-06-30T00:00:00.000Z" })
    );
    expect(row.id).toBe("f5b00000-0000-4000-8000-000000000001");
    expect(row.token).toBe("e2eformsharetokensonly0000000000000ab");
    expect(row.recipient_name).toBe("Casey Client");
    expect(row.viewed_at).toBe("2026-06-29T12:00:00.000Z");
    expect(row.revoked_at).toBe("2026-06-30T00:00:00.000Z");
    expect(row.created_at).toBe("2026-06-29T00:00:00.000Z");
    expect(row.created_by).toBe("owner@goodwoods");
    expect(row.view_count).toBe(0);
  });
});

describe("formShareLinkToShareTokenState", () => {
  it("always carries lockedFieldIds + recipientType (the always-present bits)", () => {
    const state = formShareLinkToShareTokenState(
      baseLink({ lockedFieldIds: ["a", "b"], recipientType: "designer" })
    );
    expect(state.lockedFieldIds).toEqual(["a", "b"]);
    expect(state.recipientType).toBe("designer");
  });

  it("omits the nullable stamps when null (so the progress jsonb guard never sees a null)", () => {
    const state = formShareLinkToShareTokenState(baseLink());
    expect("sentAt" in state).toBe(false);
    expect("startedAt" in state).toBe(false);
    expect("submittedAt" in state).toBe(false);
    expect("progress" in state).toBe(false);
  });

  it("includes the stamps when present", () => {
    const state = formShareLinkToShareTokenState(
      baseLink({
        sentAt: "2026-06-25T00:00:00.000Z",
        startedAt: "2026-06-26T00:00:00.000Z",
        submittedAt: "2026-06-27T00:00:00.000Z",
        progress: 75,
      })
    );
    expect(state.sentAt).toBe("2026-06-25T00:00:00.000Z");
    expect(state.startedAt).toBe("2026-06-26T00:00:00.000Z");
    expect(state.submittedAt).toBe("2026-06-27T00:00:00.000Z");
    expect(state.progress).toBe(75);
  });
});

describe("shareTokenRowToFormShareLink", () => {
  function baseRow(over: Partial<ShareTokenRow> = {}): ShareTokenRow {
    return {
      id: "f5b00000-0000-4000-8000-000000000001",
      capability_type: "form",
      form_instance_id: "f1100000-0000-4000-8000-000000000001",
      job_id: null,
      document_id: null,
      token: "e2eformsharetokensonly0000000000000ab",
      recipient_name: "Casey Client",
      viewed_at: null,
      revoked_at: null,
      expires_at: null,
      view_count: 0,
      ip: null,
      ua: null,
      created_at: "2026-06-29T00:00:00.000Z",
      created_by: "owner@goodwoods",
      state: { lockedFieldIds: [], recipientType: "customer" },
      ...over,
    };
  }

  it("round-trips a freshly minted link", () => {
    const link = baseLink({
      lockedFieldIds: ["fld-1"],
      recipientType: "designer",
      sentAt: "2026-06-25T00:00:00.000Z",
      startedAt: "2026-06-26T00:00:00.000Z",
      submittedAt: "2026-06-27T00:00:00.000Z",
      progress: 60,
      viewedAt: "2026-06-26T01:00:00.000Z",
      submitIp: "203.0.113.7",
      submitUserAgent: "Mozilla/5.0",
    });
    expect(shareTokenRowToFormShareLink(formShareLinkToShareTokenRow(link))).toEqual(link);
  });

  it("reads instanceId from form_instance_id and stamps back out of state", () => {
    const link = shareTokenRowToFormShareLink(
      baseRow({
        state: {
          lockedFieldIds: ["x"],
          recipientType: "designer",
          startedAt: "2026-06-26T00:00:00.000Z",
          progress: 40,
        },
        viewed_at: "2026-06-26T00:00:00.000Z",
      })
    );
    expect(link.instanceId).toBe("f1100000-0000-4000-8000-000000000001");
    expect(link.lockedFieldIds).toEqual(["x"]);
    expect(link.recipientType).toBe("designer");
    expect(link.startedAt).toBe("2026-06-26T00:00:00.000Z");
    expect(link.progress).toBe(40);
    expect(link.submittedAt).toBeNull();
    expect(link.viewedAt).toBe("2026-06-26T00:00:00.000Z");
  });

  it("defaults a missing/garbage state safely (lockedFieldIds=[], recipientType=other)", () => {
    const link = shareTokenRowToFormShareLink(baseRow({ state: null }));
    expect(link.lockedFieldIds).toEqual([]);
    expect(link.recipientType).toBe("other");
    expect(link.progress).toBeNull();
    expect(link.sentAt).toBeNull();
  });

  it("coerces an unknown recipient_type to other and non-string locks to []", () => {
    const link = shareTokenRowToFormShareLink(
      baseRow({ state: { recipientType: "alien", lockedFieldIds: [1, "ok", null] } })
    );
    expect(link.recipientType).toBe("other");
    expect(link.lockedFieldIds).toEqual(["ok"]);
  });
});
