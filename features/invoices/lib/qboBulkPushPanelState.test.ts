import { describe, expect, it } from "vitest";
import type { TokenHealth } from "./qboTokenHealth";
import {
  LOAD_ERROR_MESSAGE,
  deriveLoadErrorState,
  deriveLoadState,
  derivePushErrorState,
} from "./qboBulkPushPanelState";

const tokenHealth: TokenHealth = {
  level: "warning",
  daysOld: 82,
  message: "QuickBooks token is 82 days old — reconnect soon.",
};

describe("deriveLoadState (QBO-H9 — stop the silent vanish)", () => {
  it("hides on the 'no panel' statuses (flag off / not connected — Settings handles onboarding)", () => {
    for (const status of [400, 403, 404, 503]) {
      expect(deriveLoadState({ status, ok: false, data: { ok: false } })).toEqual({
        phase: "hidden",
      });
    }
  });

  it("shows a RETRYABLE error (not hidden) on a transient server failure", () => {
    // The bug: a 500 used to collapse to phase:"hidden" → whole bar vanished.
    expect(deriveLoadState({ status: 500, ok: false, data: null })).toEqual({
      phase: "error",
      message: LOAD_ERROR_MESSAGE,
    });
    expect(deriveLoadState({ status: 502, ok: false, data: null }).phase).toBe("error");
  });

  it("treats a 200 with ok:false as an error, not a silent hide", () => {
    expect(deriveLoadState({ status: 200, ok: true, data: { ok: false } })).toEqual({
      phase: "error",
      message: LOAD_ERROR_MESSAGE,
    });
  });

  it("goes idle with the count + token health on a healthy 200", () => {
    expect(
      deriveLoadState({
        status: 200,
        ok: true,
        data: { ok: true, count: 4, tokenHealth },
      })
    ).toEqual({ phase: "idle", count: 4, tokenHealth });
  });

  it("defaults count to 0 and token health to null when omitted", () => {
    expect(deriveLoadState({ status: 200, ok: true, data: { ok: true } })).toEqual({
      phase: "idle",
      count: 0,
      tokenHealth: null,
    });
  });

  it("deriveLoadErrorState (network/throw) is a retryable error, never hidden", () => {
    expect(deriveLoadErrorState()).toEqual({ phase: "error", message: LOAD_ERROR_MESSAGE });
  });
});

describe("derivePushErrorState (QBO-H9 — show the reason, not a silent reset)", () => {
  it("maps a known not_connected reason to a reconnect-in-Settings message", () => {
    const state = derivePushErrorState("not_connected");
    expect(state.phase).toBe("error");
    if (state.phase === "error") {
      expect(state.message).toMatch(/Settings/);
      expect(state.message).toMatch(/retry/i);
    }
  });

  it("maps unconfigured to a configure-in-Settings message", () => {
    const state = derivePushErrorState("unconfigured");
    if (state.phase === "error") {
      expect(state.message).toMatch(/Settings/);
    }
  });

  it("falls back to a generic retry message for an unknown/missing reason", () => {
    expect(derivePushErrorState(undefined)).toEqual({
      phase: "error",
      message: expect.stringMatching(/retry/i),
    });
    expect(derivePushErrorState(null).phase).toBe("error");
    expect(derivePushErrorState("boom").phase).toBe("error");
  });
});
