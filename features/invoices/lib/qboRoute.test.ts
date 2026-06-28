/**
 * QBO-H10 (issue #193) — shared QBO route helpers.
 *
 * Pins the reason→status contract every QBO route now shares, and the dark-ship
 * 404 the flag guard returns when the sub-flag is off.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const invoicesQboEnabled = vi.fn();
vi.mock("./featureFlag", () => ({
  invoicesQboEnabled: () => invoicesQboEnabled(),
}));

import { statusForReason, requireQboEnabled } from "./qboRoute";

afterEach(() => {
  invoicesQboEnabled.mockReset();
});

describe("statusForReason", () => {
  it("maps each typed reason to its HTTP status", () => {
    expect(statusForReason("unconfigured")).toBe(503);
    expect(statusForReason("not_connected")).toBe(400);
    expect(statusForReason("not_found")).toBe(404);
    expect(statusForReason("qbo_error")).toBe(502);
  });

  it("defaults unknown reasons to 400", () => {
    expect(statusForReason("anything_else")).toBe(400);
    expect(statusForReason("missing_id")).toBe(400);
  });
});

describe("requireQboEnabled", () => {
  it("returns null when the sub-flag is on (proceed)", () => {
    invoicesQboEnabled.mockReturnValue(true);
    expect(requireQboEnabled()).toBeNull();
  });

  it("returns a 404 dark-ship response when the sub-flag is off", async () => {
    invoicesQboEnabled.mockReturnValue(false);
    const res = requireQboEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    expect(await res!.json()).toEqual({ ok: false, reason: "not_found" });
  });
});
