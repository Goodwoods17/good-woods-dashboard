/**
 * Unit tests for QBO S10 — un-push / void path (issue #156). Written first
 * (TDD, red→green).
 *
 * Pure functions only: no Supabase, no React, no QBO API calls. These cover the
 * parts of the guarded reversal that DON'T need a live sandbox:
 *   • the void gate (a bill is only voidable once it has actually been pushed),
 *   • parsing the Bill read (to recover the SyncToken delete requires),
 *   • building the QBO delete request body,
 *   • parsing the QBO delete response (Deleted vs anything else).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateBillVoid,
  voidBlockMessage,
  parseQboBillRead,
  buildVoidDeleteBody,
  parseQboDeleteResponse,
} from "./qboVoid";

describe("evaluateBillVoid — only a pushed bill can be voided", () => {
  it("is voidable when the invoice already carries a QBO Bill link", () => {
    const gate = evaluateBillVoid({ alreadyPushed: true });
    expect(gate.voidable).toBe(true);
    expect(gate.block).toBeNull();
  });

  it("is blocked (not_pushed) when nothing has been pushed yet", () => {
    const gate = evaluateBillVoid({ alreadyPushed: false });
    expect(gate.voidable).toBe(false);
    expect(gate.block).toBe("not_pushed");
  });
});

describe("voidBlockMessage", () => {
  it("returns null when voidable", () => {
    expect(voidBlockMessage(evaluateBillVoid({ alreadyPushed: true }))).toBeNull();
  });

  it("explains the not_pushed block in plain English", () => {
    const msg = voidBlockMessage(evaluateBillVoid({ alreadyPushed: false }));
    expect(msg).toMatch(/not.*sent|hasn't been sent|nothing to void/i);
  });
});

describe("parseQboBillRead — recover Id + SyncToken from a Bill GET", () => {
  it("extracts the id and sync token from a single-bill response", () => {
    const ref = parseQboBillRead({
      Bill: { Id: "145", SyncToken: "3", DocNumber: "INV-1" },
    });
    expect(ref).toEqual({ id: "145", syncToken: "3", docNumber: "INV-1" });
  });

  it("returns null when there is no Bill in the body", () => {
    expect(parseQboBillRead({})).toBeNull();
    expect(parseQboBillRead(null)).toBeNull();
    expect(parseQboBillRead({ Bill: { SyncToken: "3" } })).toBeNull();
  });

  it("tolerates a missing DocNumber", () => {
    expect(parseQboBillRead({ Bill: { Id: "9", SyncToken: "0" } })).toEqual({
      id: "9",
      syncToken: "0",
      docNumber: null,
    });
  });
});

describe("buildVoidDeleteBody — the QBO delete request body", () => {
  it("carries exactly the Id + SyncToken QBO needs to delete a Bill", () => {
    expect(buildVoidDeleteBody({ id: "145", syncToken: "3" })).toEqual({
      Id: "145",
      SyncToken: "3",
    });
  });
});

describe("parseQboDeleteResponse — confirm the delete actually happened", () => {
  it("returns the id when QBO reports the Bill as Deleted", () => {
    const res = parseQboDeleteResponse({ Bill: { Id: "145", status: "Deleted" } });
    expect(res).toEqual({ id: "145", deleted: true });
  });

  it("is not deleted when the status is anything else", () => {
    expect(parseQboDeleteResponse({ Bill: { Id: "145", status: "Whatever" } })).toEqual({
      id: "145",
      deleted: false,
    });
  });

  it("returns null when there is no Bill in the body", () => {
    expect(parseQboDeleteResponse({})).toBeNull();
    expect(parseQboDeleteResponse(null)).toBeNull();
  });
});
