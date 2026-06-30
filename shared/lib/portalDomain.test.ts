import { describe, it, expect } from "vitest";
import {
  isPortalBrandedHost,
  isPortalPath,
  PORTAL_BRANDED_DOMAIN,
  PORTAL_PATH_PREFIXES,
} from "./portalDomain";

describe("isPortalBrandedHost", () => {
  it("matches the branded domain exactly", () => {
    expect(isPortalBrandedHost(PORTAL_BRANDED_DOMAIN)).toBe(true);
  });

  it("strips port before comparing — branded domain with port matches", () => {
    expect(isPortalBrandedHost(`${PORTAL_BRANDED_DOMAIN}:443`)).toBe(true);
  });

  it("rejects the main app Vercel domain", () => {
    expect(isPortalBrandedHost("good-woods-dashboard.vercel.app")).toBe(false);
  });

  it("rejects localhost (dev origin)", () => {
    expect(isPortalBrandedHost("localhost")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isPortalBrandedHost("")).toBe(false);
  });

  it("is case-sensitive — uppercase domain is rejected", () => {
    expect(isPortalBrandedHost(PORTAL_BRANDED_DOMAIN.toUpperCase())).toBe(false);
  });
});

describe("isPortalPath", () => {
  it("recognizes /d/<token> as a portal path (document view)", () => {
    expect(isPortalPath("/d/abc123")).toBe(true);
  });

  it("recognizes /f/<token> as a portal path (form fill)", () => {
    expect(isPortalPath("/f/xyz789")).toBe(true);
  });

  it("recognizes /s/<token> as a portal path (schedule)", () => {
    expect(isPortalPath("/s/sometoken")).toBe(true);
  });

  it("recognizes the bare prefix itself", () => {
    expect(isPortalPath("/d")).toBe(true);
  });

  it("does NOT treat / as a portal path", () => {
    expect(isPortalPath("/")).toBe(false);
  });

  it("does NOT treat /dashboard as a portal path", () => {
    expect(isPortalPath("/dashboard")).toBe(false);
  });

  it("does NOT match a path that begins with /d but is not /d or /d/…", () => {
    // Edge: /docs should not match just because it starts with /d.
    expect(isPortalPath("/docs")).toBe(false);
  });

  it("covers every PORTAL_PATH_PREFIXES entry", () => {
    for (const prefix of PORTAL_PATH_PREFIXES) {
      expect(isPortalPath(`${prefix}/sometoken`)).toBe(true);
    }
  });
});
