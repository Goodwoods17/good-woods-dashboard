/**
 * #169 — /api/invoices/process auth model.
 *
 * The "Process now" button must NOT ship the cron secret in the browser bundle.
 * The route therefore accepts EITHER:
 *   - the CRON_SECRET bearer (headless home-machine sweep), OR
 *   - an authenticated Supabase user session (the button — user is logged in).
 *
 * These tests mock the heavy engine/processor/supabase deps so only the auth
 * gate is exercised. `getAuthedUserId` (the cookie-aware @supabase/ssr reader)
 * is mocked to simulate "logged in" vs "anonymous".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runSweep: vi.fn(),
  extractInvoice: vi.fn(),
  getAuthedUserId: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@features/invoices/lib/engine", () => ({
  extractInvoice: mocks.extractInvoice,
}));
vi.mock("@features/invoices/lib/processor", () => ({
  runSweep: mocks.runSweep,
}));
vi.mock("@shared/lib/authedUserServer", () => ({
  getAuthedUserId: mocks.getAuthedUserId,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { POST } from "../../../src/app/api/invoices/process/route";

const prevCron = process.env.CRON_SECRET;
const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function req(authToken?: string): Request {
  return new Request("http://localhost/api/invoices/process", {
    method: "POST",
    headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "sekret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  // Default: anonymous (no session) unless a test opts in.
  mocks.getAuthedUserId.mockResolvedValue(null);
  mocks.createClient.mockReturnValue({});
  mocks.runSweep.mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 });
});

afterEach(() => {
  if (prevCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevCron;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
});

describe("POST /api/invoices/process — auth (#169)", () => {
  it("401s when there is neither a cron bearer nor an authenticated user", async () => {
    mocks.getAuthedUserId.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mocks.runSweep).not.toHaveBeenCalled();
  });

  it("401s when the cron bearer is wrong and there is no user", async () => {
    mocks.getAuthedUserId.mockResolvedValue(null);
    const res = await POST(req("wrong"));
    expect(res.status).toBe(401);
    expect(mocks.runSweep).not.toHaveBeenCalled();
  });

  it("runs the sweep when the CRON_SECRET bearer is correct (headless)", async () => {
    mocks.getAuthedUserId.mockResolvedValue(null);
    const res = await POST(req("sekret"));
    expect(res.status).toBe(200);
    expect(mocks.runSweep).toHaveBeenCalledTimes(1);
  });

  it("runs the sweep for an authenticated user WITHOUT any bearer (the button)", async () => {
    mocks.getAuthedUserId.mockResolvedValue("user-123");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mocks.runSweep).toHaveBeenCalledTimes(1);
  });

  it("does not consult the user session when a valid cron bearer is present", async () => {
    mocks.getAuthedUserId.mockResolvedValue(null);
    const res = await POST(req("sekret"));
    expect(res.status).toBe(200);
    // Cron path short-circuits — no need to hit Supabase auth.
    expect(mocks.getAuthedUserId).not.toHaveBeenCalled();
  });
});
