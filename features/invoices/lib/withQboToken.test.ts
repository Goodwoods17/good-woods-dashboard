/**
 * QBO-H10 (issue #193) — the shared token bootstrap wrapper.
 *
 * Pins the reason mapping every QBO server relied on: `unconfigured` stays
 * `unconfigured`; a missing connection or a `refresh_failed` both collapse to
 * `not_connected`; and a success runs `fn` with the token context.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getFreshAccessToken = vi.fn();
vi.mock("./qboConnectionServer", () => ({
  getFreshAccessToken: () => getFreshAccessToken(),
}));

import { withQboToken } from "./withQboToken";

afterEach(() => {
  getFreshAccessToken.mockReset();
});

describe("withQboToken", () => {
  it("runs fn with the token context on success", async () => {
    getFreshAccessToken.mockResolvedValue({
      ok: true,
      accessToken: "tok",
      realmId: "R1",
      environment: "sandbox",
    });

    const fn = vi.fn(async (t: { accessToken: string; realmId: string; environment: string }) => ({
      status: "ok" as const,
      seen: t,
    }));
    const result = await withQboToken(fn);

    expect(fn).toHaveBeenCalledWith({ accessToken: "tok", realmId: "R1", environment: "sandbox" });
    expect(result).toEqual({
      status: "ok",
      seen: { accessToken: "tok", realmId: "R1", environment: "sandbox" },
    });
  });

  it("short-circuits to unconfigured (fn never runs)", async () => {
    getFreshAccessToken.mockResolvedValue({ ok: false, reason: "unconfigured" });
    const fn = vi.fn();
    const result = await withQboToken(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "unconfigured" });
  });

  it("maps not_connected to not_connected", async () => {
    getFreshAccessToken.mockResolvedValue({ ok: false, reason: "not_connected" });
    expect(await withQboToken(vi.fn())).toEqual({ status: "not_connected" });
  });

  it("maps a refresh_failed to not_connected (needs re-consent)", async () => {
    getFreshAccessToken.mockResolvedValue({ ok: false, reason: "refresh_failed" });
    expect(await withQboToken(vi.fn())).toEqual({ status: "not_connected" });
  });
});
