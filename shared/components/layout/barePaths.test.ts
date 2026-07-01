import { describe, it, expect } from "vitest";
import { isBarePath } from "./barePaths";

describe("isBarePath — no-login portals render chromeless (regression)", () => {
  // The bug: /d/ (Project Files) and /s/ (Scheduling) portals leaked the full
  // internal AppShell sidebar to anonymous share-link recipients because only
  // /login + /f/ were exempt. Every token-portal prefix must be chromeless.
  it.each([
    "/login",
    "/f/abc123",
    "/d/abc123", // Project Files document view/upload portal
    "/s/abc123", // Scheduling client portal
  ])("%s is chromeless (no app shell)", (path) => {
    expect(isBarePath(path)).toBe(true);
  });

  it.each(["/", "/jobs", "/jobs/job-123/drawings", "/invoices", "/reports", "/crm", "/partners"])(
    "%s keeps the app chrome",
    (path) => {
      expect(isBarePath(path)).toBe(false);
    }
  );

  it("tolerates null/undefined pathname", () => {
    expect(isBarePath(null)).toBe(false);
    expect(isBarePath(undefined)).toBe(false);
  });
});
