import { describe, it, expect } from "vitest";
import { checkCutoverReadiness } from "./qboCutoverCheck";

// All tests use the overrides API so process.env is never mutated.

const PROD_FULL: Parameters<typeof checkCutoverReadiness>[0] = {
  QBO_ENVIRONMENT: "production",
  QBO_OAUTH_CLIENT_ID: "prod-client-id",
  QBO_OAUTH_CLIENT_SECRET: "prod-client-secret",
  QBO_TOKEN_ENC_KEY: "aabbccddeeff00112233445566778899",
  NEXT_PUBLIC_INVOICES_QBO_ENABLED: "true",
};

describe("checkCutoverReadiness", () => {
  describe("default (sandbox) environment", () => {
    it("reports environment:sandbox and ready:false when QBO_ENVIRONMENT is unset", () => {
      const result = checkCutoverReadiness({
        QBO_ENVIRONMENT: undefined,
        QBO_OAUTH_CLIENT_ID: "id",
        QBO_OAUTH_CLIENT_SECRET: "secret",
        QBO_TOKEN_ENC_KEY: "key",
        NEXT_PUBLIC_INVOICES_QBO_ENABLED: "true",
      });
      expect(result.environment).toBe("sandbox");
      expect(result.ready).toBe(false);
    });

    it("reports environment:sandbox even when other items pass", () => {
      const result = checkCutoverReadiness({ ...PROD_FULL, QBO_ENVIRONMENT: "sandbox" });
      expect(result.environment).toBe("sandbox");
      expect(result.ready).toBe(false);
    });
  });

  describe("production environment — all items pass", () => {
    it("reports ready:true and environment:production when all four items are satisfied", () => {
      const result = checkCutoverReadiness(PROD_FULL);
      expect(result.environment).toBe("production");
      expect(result.ready).toBe(true);
    });

    it("all checklist items pass in the full-prod config", () => {
      const result = checkCutoverReadiness(PROD_FULL);
      for (const item of result.items) {
        expect(item.pass).toBe(true);
      }
    });

    it("returns exactly 4 checklist items", () => {
      const result = checkCutoverReadiness(PROD_FULL);
      expect(result.items).toHaveLength(4);
    });
  });

  describe("individual item failures", () => {
    it("flags missing client id/secret", () => {
      const result = checkCutoverReadiness({
        ...PROD_FULL,
        QBO_OAUTH_CLIENT_ID: "",
        QBO_OAUTH_CLIENT_SECRET: "",
      });
      expect(result.ready).toBe(false);
      const credsItem = result.items.find((i) => i.label.includes("CLIENT_ID"));
      expect(credsItem?.pass).toBe(false);
    });

    it("flags missing encryption key", () => {
      const result = checkCutoverReadiness({ ...PROD_FULL, QBO_TOKEN_ENC_KEY: "" });
      expect(result.ready).toBe(false);
      const encItem = result.items.find((i) => i.label.includes("ENC_KEY"));
      expect(encItem?.pass).toBe(false);
    });

    it("flags QBO_ENVIRONMENT not set to production", () => {
      const result = checkCutoverReadiness({ ...PROD_FULL, QBO_ENVIRONMENT: "dev" });
      expect(result.ready).toBe(false);
      const envItem = result.items.find((i) => i.label.includes("QBO_ENVIRONMENT=production"));
      expect(envItem?.pass).toBe(false);
    });

    it("flags QBO feature flag disabled", () => {
      const result = checkCutoverReadiness({
        ...PROD_FULL,
        NEXT_PUBLIC_INVOICES_QBO_ENABLED: "false",
      });
      expect(result.ready).toBe(false);
      const flagItem = result.items.find((i) => i.label.includes("INVOICES_QBO_ENABLED"));
      expect(flagItem?.pass).toBe(false);
    });
  });

  describe("detail strings", () => {
    it("mentions the current environment in the QBO_ENVIRONMENT detail text when not production", () => {
      const result = checkCutoverReadiness({ ...PROD_FULL, QBO_ENVIRONMENT: "sandbox" });
      const envItem = result.items.find((i) => i.label.includes("QBO_ENVIRONMENT=production"))!;
      expect(envItem.detail).toContain("sandbox");
    });

    it("mentions openssl in the enc key detail text for discoverability", () => {
      const result = checkCutoverReadiness(PROD_FULL);
      const encItem = result.items.find((i) => i.label.includes("ENC_KEY"))!;
      expect(encItem.detail).toContain("openssl");
    });
  });

  describe("encryption key length (≥32 chars / 256-bit)", () => {
    const encItemOf = (key: string) =>
      checkCutoverReadiness({ ...PROD_FULL, QBO_TOKEN_ENC_KEY: key }).items.find((i) =>
        i.label.includes("ENC_KEY")
      )!;

    it("fails a non-empty but too-short key (31 chars)", () => {
      const short = "a".repeat(31);
      expect(encItemOf(short).pass).toBe(false);
      expect(checkCutoverReadiness({ ...PROD_FULL, QBO_TOKEN_ENC_KEY: short }).ready).toBe(false);
    });

    it("passes a key of exactly 32 chars", () => {
      expect(encItemOf("a".repeat(32)).pass).toBe(true);
    });

    it("passes a 64-char hex key (openssl rand -hex 32)", () => {
      expect(encItemOf("a".repeat(64)).pass).toBe(true);
    });

    it("does not count leading/trailing whitespace toward the length", () => {
      expect(encItemOf(`  ${"a".repeat(31)}  `).pass).toBe(false);
    });
  });
});
