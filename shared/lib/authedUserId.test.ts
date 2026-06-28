/**
 * Unit tests for QBO-H5 — capture who pushed/voided (audit integrity, issue
 * #188). Written first (TDD, red → green).
 *
 * The push/void audit rows must record the authenticated actor. The actor id is
 * resolved from a Supabase user with `actorIdFromUser`; the server reader that
 * pulls the user out of the request cookies is a thin wrapper over it.
 */
import { describe, it, expect } from "vitest";
import { actorIdFromUser } from "./authedUserId";

describe("actorIdFromUser", () => {
  it("returns the user id for an authenticated user", () => {
    expect(actorIdFromUser({ id: "11111111-1111-4111-8111-111111111111" })).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("returns null when there is no user (cron / unauthenticated)", () => {
    expect(actorIdFromUser(null)).toBeNull();
    expect(actorIdFromUser(undefined)).toBeNull();
  });

  it("returns null when the user has no id", () => {
    expect(actorIdFromUser({})).toBeNull();
    expect(actorIdFromUser({ id: null })).toBeNull();
    expect(actorIdFromUser({ id: "" })).toBeNull();
  });
});
