import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailDeliverer } from "./documentSendShareLinkServer";

// A tiny in-memory Supabase double: enough surface for
// sendDocumentShareLinkEmail's select/update chain on share_tokens + documents
// + jobs.
type Row = Record<string, unknown>;

function makeFakeSupabase(opts: {
  shareToken: Row | null;
  document: Row | null;
  job: Row | null;
  onUpdate?: (table: string, patch: Row) => void;
}) {
  return {
    from(table: string) {
      const builder: {
        _patch: Row | null;
        _selections: string[];
        select: (cols?: string) => typeof builder;
        update: (patch: Row) => typeof builder;
        eq: (...args: unknown[]) => typeof builder | Promise<{ data: null; error: null }>;
        maybeSingle: () => Promise<{ data: Row | null; error: null }>;
      } = {
        _patch: null as Row | null,
        _selections: [],
        select() {
          return builder;
        },
        update(patch: Row) {
          builder._patch = patch;
          return builder;
        },
        eq(..._args: unknown[]) {
          if (builder._patch) {
            opts.onUpdate?.(table, builder._patch);
            return Promise.resolve({ data: null, error: null });
          }
          return builder;
        },
        maybeSingle() {
          let data: Row | null = null;
          if (table === "share_tokens") data = opts.shareToken;
          else if (table === "documents") data = opts.document;
          else if (table === "jobs") data = opts.job;
          return Promise.resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

const fakeState: { sb: ReturnType<typeof makeFakeSupabase> | null } = { sb: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeState.sb,
}));

const SHARE_TOKEN_ROW = {
  id: "st1",
  capability_type: "document_view",
  form_instance_id: null,
  job_id: null,
  document_id: "doc1",
  token: "tok_abcdefghijklmnopqrstuvwxyz123456",
  recipient_name: "Dana Designer",
  viewed_at: null,
  revoked_at: null,
  expires_at: null,
  view_count: 0,
  ip: null,
  ua: null,
  created_at: "2026-06-29T00:00:00.000Z",
  created_by: null,
  state: {},
};

const DOCUMENT_ROW = {
  id: "doc1",
  project_id: "job1",
  kind: "designer",
  label: "Kitchen elevations",
};

const JOB_ROW = {
  id: "job1",
  name: "Saywell Kitchen",
};

describe("sendDocumentShareLinkEmail", () => {
  const OLD = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.RESEND_FROM;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...OLD };
  });

  it("returns unconfigured when RESEND_API_KEY is absent (mailto fallback path)", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendDocumentShareLinkEmail } = await import("./documentSendShareLinkServer");
    const res = await sendDocumentShareLinkEmail({
      shareTokenId: "st1",
      recipientEmail: "dana@example.com",
      origin: "https://app.test",
      deliver: async () => ({ id: "should-not-be-called", error: null }),
    });
    expect(res).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("sends and records state.sentAt on first successful send", async () => {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    fakeState.sb = makeFakeSupabase({
      shareToken: { ...SHARE_TOKEN_ROW },
      document: { ...DOCUMENT_ROW },
      job: { ...JOB_ROW },
      onUpdate: (table, patch) => updates.push({ table, patch }),
    });
    const deliver = vi.fn<EmailDeliverer>(async () => ({ id: "email_123", error: null }));

    const { sendDocumentShareLinkEmail } = await import("./documentSendShareLinkServer");
    const res = await sendDocumentShareLinkEmail({
      shareTokenId: "st1",
      recipientEmail: "dana@example.com",
      origin: "https://app.test",
      deliver,
    });

    expect(res).toEqual({ ok: true, emailId: "email_123" });
    // The email carried the /d/<token> URL built from the origin.
    expect(deliver).toHaveBeenCalledTimes(1);
    const call = deliver.mock.calls[0][0];
    expect(call.to).toBe("dana@example.com");
    expect(call.html).toContain("https://app.test/d/tok_abcdefghijklmnopqrstuvwxyz123456");
    expect(call.subject).toContain("Saywell Kitchen");
    // state.sentAt was stamped on the share_tokens table.
    const stamps = updates.filter(
      (u) => u.table === "share_tokens" && u.patch.state !== undefined
    );
    expect(stamps).toHaveLength(1);
    const state = stamps[0].patch.state as Record<string, unknown>;
    expect(typeof state.sentAt).toBe("string");
  });

  it("does NOT re-stamp state.sentAt when already set (idempotent)", async () => {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    fakeState.sb = makeFakeSupabase({
      shareToken: {
        ...SHARE_TOKEN_ROW,
        state: { sentAt: "2026-06-28T00:00:00.000Z" },
      },
      document: { ...DOCUMENT_ROW },
      job: { ...JOB_ROW },
      onUpdate: (table, patch) => updates.push({ table, patch }),
    });
    const deliver = vi.fn<EmailDeliverer>(async () => ({ id: "email_456", error: null }));

    const { sendDocumentShareLinkEmail } = await import("./documentSendShareLinkServer");
    const res = await sendDocumentShareLinkEmail({
      shareTokenId: "st1",
      recipientEmail: "dana@example.com",
      origin: "https://app.test",
      deliver,
    });

    expect(res).toEqual({ ok: true, emailId: "email_456" });
    // No state re-stamp — sentAt was already set.
    const stamps = updates.filter((u) => u.table === "share_tokens");
    expect(stamps).toHaveLength(0);
  });

  it("refuses to send on a revoked token", async () => {
    fakeState.sb = makeFakeSupabase({
      shareToken: { ...SHARE_TOKEN_ROW, revoked_at: "2026-06-21T00:00:00.000Z" },
      document: { ...DOCUMENT_ROW },
      job: { ...JOB_ROW },
    });
    const deliver = vi.fn(async () => ({ id: "nope", error: null }));
    const { sendDocumentShareLinkEmail } = await import("./documentSendShareLinkServer");
    const res = await sendDocumentShareLinkEmail({
      shareTokenId: "st1",
      recipientEmail: "dana@example.com",
      origin: "https://app.test",
      deliver,
    });
    expect(res).toEqual({ ok: false, reason: "revoked" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("returns not_found when the share token does not exist", async () => {
    fakeState.sb = makeFakeSupabase({ shareToken: null, document: null, job: null });
    const { sendDocumentShareLinkEmail } = await import("./documentSendShareLinkServer");
    const res = await sendDocumentShareLinkEmail({
      shareTokenId: "missing",
      recipientEmail: "dana@example.com",
      origin: "https://app.test",
      deliver: async () => ({ id: "x", error: null }),
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("maps a deliverer error to send_failed (no sentAt stamp)", async () => {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    fakeState.sb = makeFakeSupabase({
      shareToken: { ...SHARE_TOKEN_ROW },
      document: { ...DOCUMENT_ROW },
      job: { ...JOB_ROW },
      onUpdate: (table, patch) => updates.push({ table, patch }),
    });
    const { sendDocumentShareLinkEmail } = await import("./documentSendShareLinkServer");
    const res = await sendDocumentShareLinkEmail({
      shareTokenId: "st1",
      recipientEmail: "dana@example.com",
      origin: "https://app.test",
      deliver: async () => ({ id: null, error: "domain not verified" }),
    });
    expect(res).toEqual({ ok: false, reason: "send_failed" });
    expect(updates.filter((u) => u.table === "share_tokens")).toHaveLength(0);
  });
});
