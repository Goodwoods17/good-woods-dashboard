/**
 * QBO-H10 (issue #193) — the consolidated QBO REST client.
 *
 * These pin the one request shape every QBO server now shares: the environment
 * base host, the `/v3/company/{realmId}/…` path, the pinned `minorversion`, and
 * the `Bearer` / `Accept` headers. A drift here would silently change all eight
 * former call sites at once, so it's worth locking down.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QBO_MINOR_VERSION,
  qboUrl,
  qboFetch,
  qboQuery,
  qboMutate,
  type QboCallContext,
} from "./qboClient";

const ctx: QboCallContext = {
  accessToken: "tok-abc",
  realmId: "9341452000000001",
  environment: "sandbox",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("qboUrl", () => {
  it("targets the sandbox host with the company path + pinned minorversion", () => {
    const url = qboUrl({ environment: "sandbox", realmId: "R1", path: "bill" });
    expect(url).toBe(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/R1/bill?minorversion=${QBO_MINOR_VERSION}`
    );
  });

  it("targets the production host for a production connection", () => {
    const url = qboUrl({ environment: "production", realmId: "R1", path: "vendor" });
    expect(url.startsWith("https://quickbooks.api.intuit.com/v3/company/R1/vendor")).toBe(true);
  });

  it("merges extra query params and percent-encodes spaces as %20", () => {
    const url = qboUrl({
      environment: "sandbox",
      realmId: "R1",
      path: "query",
      query: { query: "SELECT * FROM Vendor" },
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("minorversion")).toBe(QBO_MINOR_VERSION);
    expect(parsed.searchParams.get("query")).toBe("SELECT * FROM Vendor");
    // Spaces must be %20 (encodeURIComponent), never + — matches the old URLs.
    expect(url).toContain("SELECT%20*%20FROM%20Vendor");
  });
});

describe("qboFetch", () => {
  it("sends Bearer + Accept on a GET and no Content-Type", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await qboFetch({ ...ctx, path: "query", query: { query: "SELECT 1" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url as string).searchParams.get("minorversion")).toBe(QBO_MINOR_VERSION);
    expect(init?.method).toBe("GET");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("adds Content-Type application/json for a string body", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await qboFetch({ ...ctx, path: "bill", method: "POST", body: JSON.stringify({ a: 1 }) });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("leaves Content-Type unset for a FormData body (multipart boundary)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const fd = new FormData();
    fd.append("file_content_01", new Blob(["x"]), "x.pdf");
    await qboFetch({ ...ctx, path: "upload", method: "POST", body: fd });

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

describe("qboQuery", () => {
  it("returns the parsed JSON body on a 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ QueryResponse: { Vendor: [] } }), { status: 200 })
      )
    );
    const body = await qboQuery(ctx, "SELECT * FROM Vendor");
    expect(body).toEqual({ QueryResponse: { Vendor: [] } });
  });

  it("throws with the supplied label on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401, statusText: "Unauthorized" }))
    );
    await expect(qboQuery(ctx, "SELECT * FROM Bill", "QBO bill query")).rejects.toThrow(
      "QBO bill query failed: 401 Unauthorized"
    );
  });
});

describe("qboMutate", () => {
  it("POSTs a JSON body and forwards extra query params (e.g. requestid)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ Bill: { Id: "1" } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await qboMutate(ctx, "bill", { DocNumber: "INV-1" }, { requestid: "abc" });
    expect(res.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("requestid")).toBe("abc");
    expect(parsed.searchParams.get("minorversion")).toBe(QBO_MINOR_VERSION);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ DocNumber: "INV-1" }));
  });
});
