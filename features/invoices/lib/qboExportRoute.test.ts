/**
 * QBO-H6 (#189) — the thin export route's gates.
 *
 * Proves the DoD's first bullet (route 404s when the flag is off) plus the auth
 * gate and the happy delegate, with `buildInvoiceQboExport` mocked so no DB is
 * touched. Lives under features/ so vitest's include glob picks it up; it imports
 * the real route handler by relative path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ buildInvoiceQboExport: vi.fn() }));
vi.mock("@features/invoices/lib/qboExportServer", () => ({
  buildInvoiceQboExport: mocks.buildInvoiceQboExport,
}));

import { GET } from "../../../src/app/api/invoices/[id]/export-qbo/route";

const FLAG = "NEXT_PUBLIC_INVOICES_QBO_ENABLED";
const prevFlag = process.env[FLAG];
const prevCron = process.env.CRON_SECRET;

function req(authToken?: string): Request {
  return new Request("http://localhost/api/invoices/x/export-qbo", {
    headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (prevFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prevFlag;
  if (prevCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevCron;
});

describe("GET /api/invoices/[id]/export-qbo — gates (QBO-H6)", () => {
  it("404s when the QBO flag is off, without touching the DB", async () => {
    delete process.env[FLAG];
    process.env.CRON_SECRET = "sekret";

    const res = await GET(req("sekret"), { params: { id: "abc" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.buildInvoiceQboExport).not.toHaveBeenCalled();
  });

  it("401s when the flag is on but the CRON_SECRET bearer is wrong", async () => {
    process.env[FLAG] = "true";
    process.env.CRON_SECRET = "sekret";

    const res = await GET(req("wrong"), { params: { id: "abc" } });
    expect(res.status).toBe(401);
    expect(mocks.buildInvoiceQboExport).not.toHaveBeenCalled();
  });

  it("delegates and returns the v3 Bill + reconciliation when flag on + bearer correct", async () => {
    process.env[FLAG] = "true";
    process.env.CRON_SECRET = "sekret";
    mocks.buildInvoiceQboExport.mockResolvedValue({
      status: "ok",
      bill: { VendorRef: { value: "V1" } },
      reconciliation: { balanced: true },
    });

    const res = await GET(req("sekret"), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The legacy flat `export` shape was removed (QBO-H11) — only the Bill remains.
    expect(body.export).toBeUndefined();
    expect(body.bill.VendorRef.value).toBe("V1");
    expect(body.reconciliation.balanced).toBe(true);
    expect(mocks.buildInvoiceQboExport).toHaveBeenCalledWith("abc");
  });

  it("maps a not_found delegate result to a 404", async () => {
    process.env[FLAG] = "true";
    process.env.CRON_SECRET = "sekret";
    mocks.buildInvoiceQboExport.mockResolvedValue({ status: "not_found" });

    const res = await GET(req("sekret"), { params: { id: "ghost" } });
    expect(res.status).toBe(404);
  });
});
