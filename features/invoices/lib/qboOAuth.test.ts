import { describe, it, expect } from "vitest";
import {
  QBO_ACCOUNTING_SCOPE,
  QBO_SANDBOX_API_BASE,
  QBO_PRODUCTION_API_BASE,
  basicAuthHeader,
  buildAuthUrl,
  callbackUrl,
  qboApiBaseUrl,
  qboOAuthConfigured,
  readQboEnvironment,
} from "./qboOAuth";

describe("qboOAuth", () => {
  describe("readQboEnvironment", () => {
    it("defaults to sandbox when unset or anything but production", () => {
      expect(readQboEnvironment(undefined)).toBe("sandbox");
      expect(readQboEnvironment("")).toBe("sandbox");
      expect(readQboEnvironment("dev")).toBe("sandbox");
      expect(readQboEnvironment("sandbox")).toBe("sandbox");
    });
    it("returns production only for an explicit production value (case/space tolerant)", () => {
      expect(readQboEnvironment("production")).toBe("production");
      expect(readQboEnvironment("  PRODUCTION  ")).toBe("production");
    });
  });

  describe("qboApiBaseUrl", () => {
    it("targets the sandbox host by default", () => {
      expect(qboApiBaseUrl("sandbox")).toBe(QBO_SANDBOX_API_BASE);
    });
    it("targets the production host when explicitly production", () => {
      expect(qboApiBaseUrl("production")).toBe(QBO_PRODUCTION_API_BASE);
    });
  });

  describe("qboOAuthConfigured", () => {
    const full = { clientId: "id", clientSecret: "secret", environment: "sandbox" as const };
    it("is true only when client id + secret + enc key are all present", () => {
      expect(qboOAuthConfigured(full, "enc-key")).toBe(true);
    });
    it("is false when any of the three is missing or blank", () => {
      expect(qboOAuthConfigured({ ...full, clientId: undefined }, "enc-key")).toBe(false);
      expect(qboOAuthConfigured({ ...full, clientSecret: "  " }, "enc-key")).toBe(false);
      expect(qboOAuthConfigured(full, undefined)).toBe(false);
      expect(qboOAuthConfigured(full, "")).toBe(false);
    });
  });

  describe("callbackUrl", () => {
    it("derives the QBO callback path from the origin", () => {
      expect(callbackUrl("https://app.goodwoods.app")).toBe(
        "https://app.goodwoods.app/api/invoices/qbo/callback"
      );
    });
  });

  describe("basicAuthHeader", () => {
    it("base64-encodes clientId:clientSecret with the Basic scheme", () => {
      const header = basicAuthHeader("abc", "xyz");
      expect(header.startsWith("Basic ")).toBe(true);
      const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
      expect(decoded).toBe("abc:xyz");
    });
  });

  describe("buildAuthUrl", () => {
    it("requests the single accounting scope with the anti-CSRF state and callback redirect", () => {
      const url = new URL(
        buildAuthUrl({
          clientId: "client-123",
          origin: "https://app.goodwoods.app",
          state: "nonce-xyz",
        })
      );
      expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
      expect(url.searchParams.get("client_id")).toBe("client-123");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe(QBO_ACCOUNTING_SCOPE);
      expect(url.searchParams.get("state")).toBe("nonce-xyz");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://app.goodwoods.app/api/invoices/qbo/callback"
      );
    });
  });
});
