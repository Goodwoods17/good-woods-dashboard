import { describe, it, expect } from "vitest";
import { buildAuthUrl, callbackUrl, googleOAuthConfigured } from "./googleOAuth";
import { GOOGLE_CALENDAR_SCOPE } from "./googlePush";

describe("googleOAuthConfigured", () => {
  it("is false when any of client id / secret / enc key is missing or blank", () => {
    expect(googleOAuthConfigured({ clientId: undefined, clientSecret: "s" }, "k")).toBe(false);
    expect(googleOAuthConfigured({ clientId: "c", clientSecret: undefined }, "k")).toBe(false);
    expect(googleOAuthConfigured({ clientId: "c", clientSecret: "s" }, undefined)).toBe(false);
    expect(googleOAuthConfigured({ clientId: "  ", clientSecret: "s" }, "k")).toBe(false);
  });

  it("is true only when all three are present", () => {
    expect(googleOAuthConfigured({ clientId: "c", clientSecret: "s" }, "k")).toBe(true);
  });
});

describe("callbackUrl", () => {
  it("derives the redirect URI from the request origin", () => {
    expect(callbackUrl("https://dash.goodwoods.app")).toBe(
      "https://dash.goodwoods.app/api/scheduling/google/callback"
    );
  });
});

describe("buildAuthUrl", () => {
  it("requests offline access + consent + the minimal calendar.events scope", () => {
    const url = new URL(
      buildAuthUrl({ clientId: "client-123", origin: "https://x.test", state: "nonce" })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("nonce");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://x.test/api/scheduling/google/callback"
    );
  });
});
