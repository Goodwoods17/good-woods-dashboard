/**
 * QBO-H1 (issue #184) — idempotency under concurrency.
 *
 * The worst failure mode: two simultaneous push POSTs both read
 * `existingBillId = null`, both pass the gate, both miss the DocNumber query,
 * and both POST → **two real Bills in QuickBooks**. The local link unique
 * constraint only dedupes the link ROW, not the QBO Bill.
 *
 * Fix proven here: `createQboBill` sends a deterministic `requestid` query
 * param. QBO dedupes server-side — concurrent (or retried) POSTs carrying the
 * SAME RequestId collapse to a single Bill. This test stands up a fake QBO bill
 * endpoint that honours `requestid` exactly as Intuit does, then fires two
 * concurrent creates and asserts exactly ONE Bill was created.
 *
 * These exercise the network seam (`createQboBill`) with a stubbed global
 * fetch; no live sandbox, no Supabase.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQboBill } from "./qboBillPushServer";
import { qboBillRequestId } from "./qboBillPush";

/**
 * A minimal in-memory QBO bill endpoint that mirrors Intuit's RequestId
 * idempotency: a POST whose `requestid` was seen before returns the SAME Bill
 * instead of creating a second one.
 */
function makeFakeQbo() {
  const byRequestId = new Map<string, { Id: string; DocNumber: string }>();
  let nextId = 100;
  let createCount = 0;

  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const requestId = new URL(url).searchParams.get("requestid") ?? "";

    // Simulate a little server-side latency so two concurrent calls genuinely
    // overlap before either resolves.
    await new Promise((r) => setTimeout(r, 5));

    const seen = byRequestId.get(requestId);
    if (seen) {
      return new Response(JSON.stringify({ Bill: seen }), { status: 200 });
    }
    createCount += 1;
    const bill = { Id: String(nextId++), DocNumber: "INV-184" };
    byRequestId.set(requestId, bill);
    return new Response(JSON.stringify({ Bill: bill }), { status: 200 });
  });

  return {
    fetchImpl,
    get createCount() {
      return createCount;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createQboBill — RequestId idempotency (QBO-H1)", () => {
  const realm = "9341452000000001";
  const invoiceId = "00000000-0000-4000-8000-0000000184a1";
  const env = "sandbox" as const;
  const body = { DocNumber: "INV-184", Line: [] };

  it("a forced concurrent double-push creates exactly ONE bill", async () => {
    const qbo = makeFakeQbo();
    vi.stubGlobal("fetch", qbo.fetchImpl);

    const requestId = qboBillRequestId(realm, invoiceId);

    // Two pushes race — both believe no bill exists yet (existingBillId=null).
    const [a, b] = await Promise.all([
      createQboBill("token", realm, env, body, requestId),
      createQboBill("token", realm, env, body, requestId),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Both resolve to the SAME QBO Bill id…
    if (a.ok && b.ok) expect(a.ref.id).toBe(b.ref.id);
    // …and QBO created exactly one Bill.
    expect(qbo.createCount).toBe(1);
  });

  it("re-pushing after success still no-ops (same bill, no new create)", async () => {
    const qbo = makeFakeQbo();
    vi.stubGlobal("fetch", qbo.fetchImpl);

    const requestId = qboBillRequestId(realm, invoiceId);

    const first = await createQboBill("token", realm, env, body, requestId);
    const second = await createQboBill("token", realm, env, body, requestId);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.ref.id).toBe(second.ref.id);
    expect(qbo.createCount).toBe(1);
  });

  it("distinct invoices get distinct RequestIds → distinct bills", async () => {
    const qbo = makeFakeQbo();
    vi.stubGlobal("fetch", qbo.fetchImpl);

    const r1 = qboBillRequestId(realm, invoiceId);
    const r2 = qboBillRequestId(realm, "00000000-0000-4000-8000-0000000184a2");

    const a = await createQboBill("token", realm, env, body, r1);
    const b = await createQboBill("token", realm, env, body, r2);

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.ref.id).not.toBe(b.ref.id);
    expect(qbo.createCount).toBe(2);
  });

  it("sends the requestid query param on the create POST", async () => {
    const qbo = makeFakeQbo();
    vi.stubGlobal("fetch", qbo.fetchImpl);

    const requestId = qboBillRequestId(realm, invoiceId);
    await createQboBill("token", realm, env, body, requestId);

    const calledUrl = qbo.fetchImpl.mock.calls[0][0] as string;
    expect(new URL(calledUrl).searchParams.get("requestid")).toBe(requestId);
  });
});
