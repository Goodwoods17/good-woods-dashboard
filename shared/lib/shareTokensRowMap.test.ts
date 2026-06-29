import { describe, it, expect } from "vitest";
import {
  rowToShareToken,
  shareTokenToRow,
  toCapabilityType,
  type ShareTokenRow,
} from "./shareTokensRowMap";
import type { ShareToken } from "./types";

function baseRow(over: Partial<ShareTokenRow> = {}): ShareTokenRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    capability_type: "document_view",
    form_instance_id: null,
    job_id: null,
    document_id: "22222222-2222-4222-8222-222222222222",
    token: "tok_abc",
    recipient_name: "Jane Designer",
    viewed_at: null,
    revoked_at: null,
    expires_at: null,
    view_count: 0,
    ip: null,
    ua: null,
    created_at: "2026-06-29T00:00:00Z",
    created_by: "owner@goodwoods",
    state: { lockedFieldIds: ["f1"], progress: 50 },
    ...over,
  };
}

describe("toCapabilityType", () => {
  it("passes through valid capability types", () => {
    expect(toCapabilityType("document_view")).toBe("document_view");
    expect(toCapabilityType("document_request")).toBe("document_request");
    expect(toCapabilityType("form")).toBe("form");
    expect(toCapabilityType("schedule")).toBe("schedule");
  });

  it("coerces an unknown type to the safe default (document_view)", () => {
    expect(toCapabilityType("totally_unknown")).toBe("document_view");
  });
});

describe("shareTokensRowMap round-trip", () => {
  it("rowToShareToken maps snake_case → camelCase and preserves state", () => {
    const token = rowToShareToken(baseRow());
    expect(token.capabilityType).toBe("document_view");
    expect(token.documentId).toBe("22222222-2222-4222-8222-222222222222");
    expect(token.formInstanceId).toBeNull();
    expect(token.recipientName).toBe("Jane Designer");
    expect(token.state).toEqual({ lockedFieldIds: ["f1"], progress: 50 });
  });

  it("survives a full row → domain → row round-trip", () => {
    const row = baseRow();
    const back = shareTokenToRow(rowToShareToken(row));
    expect(back).toEqual(row);
  });
});

describe("shareTokensRowMap guards (lost-in-jsonb defaults re-added)", () => {
  it("coerces a null/garbage state to an empty object (never null)", () => {
    expect(rowToShareToken(baseRow({ state: null })).state).toEqual({});
    expect(rowToShareToken(baseRow({ state: "oops" })).state).toEqual({});
    // An array is not a valid state object either.
    expect(rowToShareToken(baseRow({ state: ["x"] })).state).toEqual({});
  });

  it("defaults a null view_count to 0", () => {
    expect(rowToShareToken(baseRow({ view_count: null })).viewCount).toBe(0);
  });

  it("writes an absent state back as an empty object", () => {
    const t: ShareToken = {
      ...rowToShareToken(baseRow()),
      state: undefined as unknown as ShareToken["state"],
    };
    expect(shareTokenToRow(t).state).toEqual({});
  });
});
