import { describe, it, expect } from "vitest";
import { versionBadgeLabel } from "./versionBadge";

describe("versionBadgeLabel", () => {
  it("renders the brand and a major.minor version prefixed with v", () => {
    expect(versionBadgeLabel("0.1.0")).toBe("Good Woods · v0.1");
  });

  it("drops the patch segment so the badge stays compact", () => {
    expect(versionBadgeLabel("0.7.3")).toBe("Good Woods · v0.7");
  });

  it("tolerates a missing patch segment", () => {
    expect(versionBadgeLabel("2.5")).toBe("Good Woods · v2.5");
  });

  it("falls back to v0.0 when the version string is unparseable", () => {
    expect(versionBadgeLabel("")).toBe("Good Woods · v0.0");
    expect(versionBadgeLabel("notaversion")).toBe("Good Woods · v0.0");
  });

  it("defaults to the package.json version (currently v0.1)", () => {
    expect(versionBadgeLabel()).toBe("Good Woods · v0.1");
  });
});
