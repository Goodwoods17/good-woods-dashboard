import { describe, it, expect } from "vitest";
import {
  assessTokenHealth,
  TOKEN_WARNING_DAYS,
  TOKEN_CRITICAL_DAYS,
  type TokenHealth,
} from "./qboTokenHealth";

function daysAgo(n: number, now: Date): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("assessTokenHealth", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  it("returns ok when the token was refreshed recently (1 day old)", () => {
    const health: TokenHealth = assessTokenHealth(daysAgo(1, now), now);
    expect(health.level).toBe("ok");
    expect(health.daysOld).toBe(1);
  });

  it("returns ok when the token is exactly TOKEN_WARNING_DAYS - 1 old", () => {
    const health = assessTokenHealth(daysAgo(TOKEN_WARNING_DAYS - 1, now), now);
    expect(health.level).toBe("ok");
    expect(health.daysOld).toBe(TOKEN_WARNING_DAYS - 1);
  });

  it("returns warning at exactly TOKEN_WARNING_DAYS old", () => {
    const health = assessTokenHealth(daysAgo(TOKEN_WARNING_DAYS, now), now);
    expect(health.level).toBe("warning");
    expect(health.daysOld).toBe(TOKEN_WARNING_DAYS);
    expect(health.message).toMatch(/aging|reconnecting/i);
  });

  it("returns warning between TOKEN_WARNING_DAYS and TOKEN_CRITICAL_DAYS", () => {
    const health = assessTokenHealth(daysAgo(90, now), now);
    expect(health.level).toBe("warning");
    expect(health.daysOld).toBe(90);
  });

  it("returns critical at exactly TOKEN_CRITICAL_DAYS old", () => {
    const health = assessTokenHealth(daysAgo(TOKEN_CRITICAL_DAYS, now), now);
    expect(health.level).toBe("critical");
    expect(health.daysOld).toBe(TOKEN_CRITICAL_DAYS);
    expect(health.message).toMatch(/reconnect now|expires/i);
  });

  it("returns critical beyond TOKEN_CRITICAL_DAYS", () => {
    const health = assessTokenHealth(daysAgo(100, now), now);
    expect(health.level).toBe("critical");
    expect(health.daysOld).toBe(100);
  });

  it("returns critical with null daysOld when lastActivityAt is null", () => {
    const health = assessTokenHealth(null, now);
    expect(health.level).toBe("critical");
    expect(health.daysOld).toBeNull();
    expect(health.message).toBeTruthy();
  });

  it("returns ok for a fresh token (0 days old)", () => {
    const health = assessTokenHealth(now, now);
    expect(health.level).toBe("ok");
    expect(health.daysOld).toBe(0);
  });

  it("uses the current time by default (no injected now)", () => {
    // Token refreshed just now — should always be ok.
    const justNow = new Date();
    const health = assessTokenHealth(justNow);
    expect(health.level).toBe("ok");
    expect(health.daysOld).toBe(0);
  });
});
