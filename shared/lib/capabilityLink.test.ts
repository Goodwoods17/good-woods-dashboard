import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCapabilityRow } from "./capabilityLink";

type FakeRow = { revoked_at: string | null; viewed_at: string | null; token: string };

/**
 * A tiny fake matching the supabase-js chain shape the loader touches:
 *   sb.from(table).select("*").eq("token", token).maybeSingle()
 *   sb.from(table).update({ viewed_at }).eq("token", token)
 * `update` records the call so a test can assert whether a stamp was issued.
 */
function makeFakeClient(opts: { maybeSingle: { data: FakeRow | null; error: unknown } }) {
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn((_patch: { viewed_at: string }) => ({ eq: updateEq }));
  const maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingle);
  const select = vi.fn(() => ({ eq: () => ({ maybeSingle }) }));
  const from = vi.fn(() => ({ select, update }));
  const sb = { from } as unknown as SupabaseClient;
  return { sb, update, updateEq };
}

const TABLE = "form_share_links";
const TOKEN = "tok_123";

describe("loadCapabilityRow", () => {
  it("returns not_found on a missing row", async () => {
    const { sb, update } = makeFakeClient({ maybeSingle: { data: null, error: null } });
    const res = await loadCapabilityRow(sb, TABLE, TOKEN);
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns not_found on a DB error", async () => {
    const { sb } = makeFakeClient({
      maybeSingle: { data: null, error: { message: "boom" } },
    });
    const res = await loadCapabilityRow(sb, TABLE, TOKEN);
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns revoked when revoked_at is set (no stamp)", async () => {
    const { sb, update } = makeFakeClient({
      maybeSingle: {
        data: { revoked_at: "2026-01-01T00:00:00Z", viewed_at: null, token: TOKEN },
        error: null,
      },
    });
    const res = await loadCapabilityRow(sb, TABLE, TOKEN);
    expect(res).toEqual({ ok: false, reason: "revoked" });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns ok and stamps viewed_at on first view", async () => {
    const row: FakeRow = { revoked_at: null, viewed_at: null, token: TOKEN };
    const { sb, update, updateEq } = makeFakeClient({ maybeSingle: { data: row, error: null } });
    const res = await loadCapabilityRow<FakeRow>(sb, TABLE, TOKEN);
    expect(res).toEqual({ ok: true, row });
    expect(update).toHaveBeenCalledTimes(1);
    const stamp = update.mock.calls[0][0];
    expect(typeof stamp.viewed_at).toBe("string");
    expect(updateEq).toHaveBeenCalledWith("token", TOKEN);
  });

  it("does NOT stamp again when viewed_at is already set", async () => {
    const row: FakeRow = { revoked_at: null, viewed_at: "2026-01-01T00:00:00Z", token: TOKEN };
    const { sb, update } = makeFakeClient({ maybeSingle: { data: row, error: null } });
    const res = await loadCapabilityRow<FakeRow>(sb, TABLE, TOKEN);
    expect(res).toEqual({ ok: true, row });
    expect(update).not.toHaveBeenCalled();
  });

  it("issues no update when stampView is false", async () => {
    const row: FakeRow = { revoked_at: null, viewed_at: null, token: TOKEN };
    const { sb, update } = makeFakeClient({ maybeSingle: { data: row, error: null } });
    const res = await loadCapabilityRow<FakeRow>(sb, TABLE, TOKEN, { stampView: false });
    expect(res).toEqual({ ok: true, row });
    expect(update).not.toHaveBeenCalled();
  });
});

// ─── Generalized share_tokens behaviour (ADR 0022) ──────────────────────────
// A flexible fake: every chain link (`.eq(...)`) returns the same chain, so any
// number of filters compose; `.maybeSingle()` resolves the select, and an
// `update(...).eq(...)...` chain is itself awaitable (thenable) like supabase-js.
type ShareRow = {
  revoked_at: string | null;
  viewed_at: string | null;
  token: string;
  capability_type: string;
  expires_at: string | null;
};

function makeShareTokensClient(opts: { row: ShareRow | null; error?: unknown }) {
  const updatePatches: Array<Record<string, unknown>> = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: opts.row, error: opts.error ?? null });
      return chain;
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      updatePatches.push(patch);
      const chain: Record<string, unknown> = {};
      chain.eq = vi.fn(() => chain);
      // Awaited directly (no .maybeSingle()) → make the chain thenable.
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return chain;
    }),
  }));
  return { sb: { from } as unknown as SupabaseClient, updatePatches };
}

const SHARE_TABLE = "share_tokens";

function shareRow(over: Partial<ShareRow> = {}): ShareRow {
  return {
    revoked_at: null,
    viewed_at: null,
    token: TOKEN,
    capability_type: "document_view",
    expires_at: null,
    ...over,
  };
}

describe("loadCapabilityRow — capability_type (token type-confusion)", () => {
  it("rejects a foreign-type token as not_found (a schedule row read as a form token)", async () => {
    const { sb, updatePatches } = makeShareTokensClient({
      row: shareRow({ capability_type: "schedule" }),
    });
    const res = await loadCapabilityRow<ShareRow>(sb, SHARE_TABLE, TOKEN, {
      capabilityType: "form",
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    // No first-view stamp on a rejected wrong-type token.
    expect(updatePatches).toHaveLength(0);
  });

  it("returns ok (and stamps) when the row's capability_type matches", async () => {
    const { sb, updatePatches } = makeShareTokensClient({
      row: shareRow({ capability_type: "document_view" }),
    });
    const res = await loadCapabilityRow<ShareRow>(sb, SHARE_TABLE, TOKEN, {
      capabilityType: "document_view",
    });
    expect(res.ok).toBe(true);
    expect(updatePatches).toHaveLength(1);
    expect(typeof updatePatches[0].viewed_at).toBe("string");
  });
});

describe("loadCapabilityRow — expiry (NULL = never; opt-in)", () => {
  it("never expires when expires_at is NULL", async () => {
    const { sb } = makeShareTokensClient({ row: shareRow({ expires_at: null }) });
    const res = await loadCapabilityRow<ShareRow>(sb, SHARE_TABLE, TOKEN, {
      capabilityType: "document_view",
    });
    expect(res.ok).toBe(true);
  });

  it("rejects a token whose expires_at is in the past", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { sb, updatePatches } = makeShareTokensClient({
      row: shareRow({ expires_at: past }),
    });
    const res = await loadCapabilityRow<ShareRow>(sb, SHARE_TABLE, TOKEN, {
      capabilityType: "document_view",
    });
    expect(res).toEqual({ ok: false, reason: "expired" });
    expect(updatePatches).toHaveLength(0); // expired → never stamped
  });

  it("allows a token whose expires_at is in the future", async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    const { sb } = makeShareTokensClient({ row: shareRow({ expires_at: future }) });
    const res = await loadCapabilityRow<ShareRow>(sb, SHARE_TABLE, TOKEN, {
      capabilityType: "document_view",
    });
    expect(res.ok).toBe(true);
  });

  it("revoked beats expiry: a revoked token reads as revoked, not expired", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { sb } = makeShareTokensClient({
      row: shareRow({ revoked_at: "2026-01-01T00:00:00Z", expires_at: past }),
    });
    const res = await loadCapabilityRow<ShareRow>(sb, SHARE_TABLE, TOKEN, {
      capabilityType: "document_view",
    });
    expect(res).toEqual({ ok: false, reason: "revoked" });
  });
});
