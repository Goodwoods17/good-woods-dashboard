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
