import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailDeliverer } from "./sendShareLinkServer";

// A tiny in-memory Supabase double: enough surface for sendShareLinkEmail's
// select(...).eq(...).eq(...).maybeSingle() reads + the update(...).eq(...).eq(...)
// stamp. The builder is thenable so an awaited update chain (any number of eq()
// filters) resolves; the patch is recorded exactly once (first eq() after update).
type Row = Record<string, unknown>;

function makeFakeSupabase(opts: {
  link: Row | null;
  instance: Row | null;
  onUpdate?: (table: string, patch: Row) => void;
}) {
  return {
    from(table: string) {
      const builder = {
        _patch: null as Row | null,
        _applied: false,
        select() {
          return builder;
        },
        update(patch: Row) {
          builder._patch = patch;
          return builder;
        },
        eq() {
          if (builder._patch && !builder._applied) {
            builder._applied = true;
            opts.onUpdate?.(table, builder._patch);
          }
          return builder;
        },
        maybeSingle() {
          // S5b: the link READ is cut to share_tokens (capability_type=form).
          const data =
            table === "share_tokens"
              ? opts.link
              : table === "form_instances"
                ? opts.instance
                : null;
          return Promise.resolve({ data, error: null });
        },
        then<T>(resolve: (v: { data: null; error: null }) => T) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

// Mock the service-client factory + the supabase-js createClient so the module
// uses our double. We mock createClient at the @supabase/supabase-js boundary.
const fakeState: { sb: ReturnType<typeof makeFakeSupabase> | null } = { sb: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeState.sb,
}));

// S5b: a `share_tokens` row (capability_type=form) — the row the read path now
// returns. recipientType / lockedFieldIds / sentAt live in the state jsonb.
const LINK_ROW = {
  id: "l1",
  capability_type: "form",
  form_instance_id: "i1",
  job_id: null,
  document_id: null,
  token: "tok_abcdefghijklmnopqrstuvwxyz123456",
  recipient_name: "Casey Client",
  viewed_at: null,
  revoked_at: null,
  expires_at: null,
  view_count: 0,
  ip: null,
  ua: null,
  created_at: "2026-06-25T00:00:00.000Z",
  created_by: null,
  state: { recipientType: "customer", lockedFieldIds: [] },
};

const INSTANCE_ROW = {
  id: "i1",
  template_id: "t1",
  job_id: "j1",
  title: "Pre-Install Check",
  phase: null,
  status: "draft",
  signoff_path: null,
  completed_at: null,
  completed_by: null,
  sort_order: 0,
  created_at: "2026-06-25T00:00:00.000Z",
  updated_at: "2026-06-25T00:00:00.000Z",
};

describe("sendShareLinkEmail", () => {
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
    const { sendShareLinkEmail } = await import("./sendShareLinkServer");
    const res = await sendShareLinkEmail({
      linkId: "l1",
      recipientEmail: "casey@example.com",
      mode: "send",
      origin: "https://app.test",
      deliver: async () => ({ id: "should-not-be-called", error: null }),
    });
    expect(res).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("sends and stamps sent_at on first successful send", async () => {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    fakeState.sb = makeFakeSupabase({
      link: { ...LINK_ROW },
      instance: { ...INSTANCE_ROW },
      onUpdate: (table, patch) => updates.push({ table, patch }),
    });
    const deliver = vi.fn<EmailDeliverer>(async () => ({ id: "email_123", error: null }));

    const { sendShareLinkEmail } = await import("./sendShareLinkServer");
    const res = await sendShareLinkEmail({
      linkId: "l1",
      recipientEmail: "casey@example.com",
      mode: "send",
      origin: "https://app.test",
      deliver,
    });

    expect(res).toEqual({ ok: true, mode: "send", emailId: "email_123" });
    // The email carried the /f/<token> URL built from the origin.
    expect(deliver).toHaveBeenCalledTimes(1);
    const call = deliver.mock.calls[0][0];
    expect(call.to).toBe("casey@example.com");
    expect(call.html).toContain("https://app.test/f/tok_abcdefghijklmnopqrstuvwxyz123456");
    expect(call.subject).toContain("Pre-Install Check");
    // sentAt was stamped exactly once, into the share_tokens state jsonb.
    const stamps = updates.filter(
      (u) =>
        u.table === "share_tokens" &&
        (u.patch.state as Record<string, unknown> | undefined)?.sentAt != null
    );
    expect(stamps).toHaveLength(1);
  });

  it("does NOT re-stamp sent_at on a reminder (keeps the original sent date)", async () => {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    fakeState.sb = makeFakeSupabase({
      link: {
        ...LINK_ROW,
        state: { ...LINK_ROW.state, sentAt: "2026-06-20T00:00:00.000Z" },
      },
      instance: { ...INSTANCE_ROW },
      onUpdate: (table, patch) => updates.push({ table, patch }),
    });
    const deliver = vi.fn<EmailDeliverer>(async () => ({ id: "email_456", error: null }));

    const { sendShareLinkEmail } = await import("./sendShareLinkServer");
    const res = await sendShareLinkEmail({
      linkId: "l1",
      recipientEmail: "casey@example.com",
      mode: "reminder",
      origin: "https://app.test",
      deliver,
    });

    expect(res).toEqual({ ok: true, mode: "reminder", emailId: "email_456" });
    expect(deliver.mock.calls[0][0].subject).toMatch(/reminder/i);
    // No sentAt re-stamp — it was already set (no share_tokens state write).
    const stamps = updates.filter(
      (u) =>
        u.table === "share_tokens" &&
        (u.patch.state as Record<string, unknown> | undefined)?.sentAt != null
    );
    expect(stamps).toHaveLength(0);
  });

  it("refuses to send on a revoked link", async () => {
    fakeState.sb = makeFakeSupabase({
      link: { ...LINK_ROW, revoked_at: "2026-06-21T00:00:00.000Z" },
      instance: { ...INSTANCE_ROW },
    });
    const deliver = vi.fn(async () => ({ id: "nope", error: null }));
    const { sendShareLinkEmail } = await import("./sendShareLinkServer");
    const res = await sendShareLinkEmail({
      linkId: "l1",
      recipientEmail: "casey@example.com",
      mode: "send",
      origin: "https://app.test",
      deliver,
    });
    expect(res).toEqual({ ok: false, reason: "revoked" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("returns not_found when the link id does not exist", async () => {
    fakeState.sb = makeFakeSupabase({ link: null, instance: null });
    const { sendShareLinkEmail } = await import("./sendShareLinkServer");
    const res = await sendShareLinkEmail({
      linkId: "missing",
      recipientEmail: "casey@example.com",
      mode: "send",
      origin: "https://app.test",
      deliver: async () => ({ id: "x", error: null }),
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("maps a deliverer error to send_failed (no sent_at stamp)", async () => {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    fakeState.sb = makeFakeSupabase({
      link: { ...LINK_ROW },
      instance: { ...INSTANCE_ROW },
      onUpdate: (table, patch) => updates.push({ table, patch }),
    });
    const { sendShareLinkEmail } = await import("./sendShareLinkServer");
    const res = await sendShareLinkEmail({
      linkId: "l1",
      recipientEmail: "casey@example.com",
      mode: "send",
      origin: "https://app.test",
      deliver: async () => ({ id: null, error: "domain not verified" }),
    });
    expect(res).toEqual({ ok: false, reason: "send_failed" });
    expect(updates.filter((u) => u.table === "share_tokens")).toHaveLength(0);
  });
});
