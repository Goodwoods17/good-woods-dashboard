/**
 * S13 — Commitment ledger + two-level ownership + per-owner/sub reliability
 * (issue #101). Unit tests written before the implementation (TDD).
 *
 * The commitment ledger is the read-time projection of every date-promise on a
 * job: the client-committed install (owned by the shop) plus each phase's
 * internal commitment (owned by its assigned person/subtrade). Reliability is
 * tracked per owner — including subtrades — and earns extra buffer for owners
 * with a history of missing their dates.
 */
import { describe, it, expect } from "vitest";
import {
  SHOP_OWNER,
  ownerKey,
  buildCommitmentLedger,
  computeOwnerReliability,
  ownerReliabilityBufferDays,
  type OwnerReliabilityRecord,
} from "./commitmentLedger";
import type { Job, CommitmentOwner } from "@shared/lib/types";

// A minimal Job builder — only the fields the ledger reads.
function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1",
    code: "GW-2026-001",
    name: "Test Job",
    client: "Client",
    address: "1 Test Rd",
    template: "full_project",
    pipelineStatus: "in_production",
    healthStatus: "on_track",
    currentMilestone: "cnc",
    installDate: "2026-12-15",
    revenue: 0,
    costs: [],
    invoice: { number: "INV-1", issuedDate: "2026-01-01", dueDate: "2026-01-15", lineItems: [] },
    phaseTargetDates: {
      design: "2026-01-15",
      cnc: "2026-06-01",
      assembly: "2026-09-01",
    },
    internalTargetDate: "2026-12-01",
    bufferDays: 10,
    ...overrides,
  };
}

// ── ownerKey ──────────────────────────────────────────────────────────────────

describe("ownerKey", () => {
  it("keys by kind + id when an id is present", () => {
    const sub: CommitmentOwner = { kind: "subtrade", id: "sub-1", name: "Demo Sub Co." };
    expect(ownerKey(sub)).toBe("subtrade:sub-1");
  });

  it("falls back to kind + name when there is no id (e.g. the shop)", () => {
    expect(ownerKey(SHOP_OWNER)).toBe("shop:Good Woods");
  });

  it("gives two subtrades with the same name but different ids distinct keys", () => {
    const a: CommitmentOwner = { kind: "subtrade", id: "a", name: "Acme" };
    const b: CommitmentOwner = { kind: "subtrade", id: "b", name: "Acme" };
    expect(ownerKey(a)).not.toBe(ownerKey(b));
  });
});

// ── buildCommitmentLedger ─────────────────────────────────────────────────────

describe("buildCommitmentLedger", () => {
  // Mid-2026 anchor: design (Jan) is past + done; cnc (Jun) is current; assembly future.
  const today = new Date("2026-07-10T12:00:00.000Z");

  it("emits a client-level install commitment owned by the shop", () => {
    const ledger = buildCommitmentLedger(makeJob(), today);
    const client = ledger.find((e) => e.level === "client");
    expect(client).toBeDefined();
    expect(client!.phase).toBeNull();
    expect(client!.committedDate).toBe("2026-12-15");
    expect(client!.owner).toEqual(SHOP_OWNER);
  });

  it("emits one phase commitment per phase that has a target date", () => {
    const ledger = buildCommitmentLedger(makeJob(), today);
    const phases = ledger.filter((e) => e.level === "phase").map((e) => e.phase);
    expect(phases).toEqual(["design", "cnc", "assembly"]);
  });

  it("omits phases that have no target date", () => {
    const ledger = buildCommitmentLedger(makeJob(), today);
    const phases = ledger.filter((e) => e.level === "phase").map((e) => e.phase);
    expect(phases).not.toContain("finishing");
    expect(phases).not.toContain("install");
  });

  it("puts the client commitment first, then phases in milestone order", () => {
    const ledger = buildCommitmentLedger(makeJob(), today);
    expect(ledger[0].level).toBe("client");
    expect(ledger.slice(1).map((e) => e.phase)).toEqual(["design", "cnc", "assembly"]);
  });

  it("assigns the named per-phase owner when set, else the shop", () => {
    const sub: CommitmentOwner = { kind: "subtrade", id: "sub-1", name: "Demo Sub Co." };
    const person: CommitmentOwner = { kind: "person", id: "p-1", name: "Andrew" };
    const ledger = buildCommitmentLedger(
      makeJob({ phaseOwners: { cnc: sub, assembly: person } }),
      today
    );
    const cnc = ledger.find((e) => e.phase === "cnc");
    const assembly = ledger.find((e) => e.phase === "assembly");
    const design = ledger.find((e) => e.phase === "design");
    expect(cnc!.owner).toEqual(sub);
    expect(assembly!.owner).toEqual(person);
    // design has no explicit owner → shop owns it.
    expect(design!.owner).toEqual(SHOP_OWNER);
  });

  it("marks a passed phase (before the current milestone) as kept regardless of its date", () => {
    // design target is 2026-01-15 (past) but currentMilestone is cnc → design is done.
    const ledger = buildCommitmentLedger(makeJob(), today);
    const design = ledger.find((e) => e.phase === "design");
    expect(design!.status).toBe("kept");
  });

  it("marks the current phase as missed when its target date has passed", () => {
    // cnc target 2026-06-01 is before today (2026-07-10) and cnc is current → missed.
    const ledger = buildCommitmentLedger(makeJob(), today);
    const cnc = ledger.find((e) => e.phase === "cnc");
    expect(cnc!.status).toBe("missed");
  });

  it("marks a future commitment as open", () => {
    const ledger = buildCommitmentLedger(makeJob(), today);
    const assembly = ledger.find((e) => e.phase === "assembly");
    const client = ledger.find((e) => e.level === "client");
    expect(assembly!.status).toBe("open");
    expect(client!.status).toBe("open");
  });

  // Boundary equivalence after folding deriveStatus onto compareToTarget: for a
  // not-yet-complete commitment, yesterday → missed, today/tomorrow → open
  // (identical to the prior `committedDate < todayISO` string compare).
  it("flips a not-complete commitment to missed exactly the day after its date", () => {
    // assembly is after the current milestone (cnc) → never auto-complete, so
    // status is driven purely by the date boundary.
    const anchor = new Date("2026-09-02T12:00:00.000Z"); // todayISO = 2026-09-02
    const yesterday = buildCommitmentLedger(
      makeJob({ phaseTargetDates: { assembly: "2026-09-01" } }),
      anchor
    ).find((e) => e.phase === "assembly");
    const todayEntry = buildCommitmentLedger(
      makeJob({ phaseTargetDates: { assembly: "2026-09-02" } }),
      anchor
    ).find((e) => e.phase === "assembly");
    const tomorrow = buildCommitmentLedger(
      makeJob({ phaseTargetDates: { assembly: "2026-09-03" } }),
      anchor
    ).find((e) => e.phase === "assembly");
    expect(yesterday!.status).toBe("missed");
    expect(todayEntry!.status).toBe("open");
    expect(tomorrow!.status).toBe("open");
  });

  it("returns only the client commitment when no phase targets are set", () => {
    const ledger = buildCommitmentLedger(makeJob({ phaseTargetDates: null }), today);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].level).toBe("client");
  });
});

// ── computeOwnerReliability ───────────────────────────────────────────────────

describe("computeOwnerReliability", () => {
  const records: OwnerReliabilityRecord[] = [
    // Demo Sub Co.: 1 of 2 missed → 50%.
    {
      ownerKind: "subtrade",
      ownerId: "sub-1",
      ownerName: "Demo Sub Co.",
      committedDate: "2026-03-01",
      actualDate: "2026-03-05",
      missed: true,
    },
    {
      ownerKind: "subtrade",
      ownerId: "sub-1",
      ownerName: "Demo Sub Co.",
      committedDate: "2026-04-01",
      actualDate: "2026-04-01",
      missed: false,
    },
    // The shop: 0 of 1 missed → perfect.
    {
      ownerKind: "shop",
      ownerId: null,
      ownerName: "Good Woods",
      committedDate: "2026-05-01",
      actualDate: "2026-05-01",
      missed: false,
    },
  ];

  it("groups by owner and computes per-owner miss rate", () => {
    const summaries = computeOwnerReliability(records);
    const sub = summaries.find((s) => s.ownerKey === "subtrade:sub-1");
    const shop = summaries.find((s) => s.ownerKey === "shop:Good Woods");
    expect(sub).toMatchObject({ total: 2, kept: 1, missed: 1, missRate: 0.5 });
    expect(shop).toMatchObject({ total: 1, kept: 1, missed: 0, missRate: 0 });
  });

  it("sorts worst (highest miss rate) first", () => {
    const summaries = computeOwnerReliability(records);
    expect(summaries[0].ownerKey).toBe("subtrade:sub-1");
  });

  it("returns an empty array for no records", () => {
    expect(computeOwnerReliability([])).toEqual([]);
  });

  it("tracks subtrade owners alongside shop/person owners (per-owner, including subs)", () => {
    const summaries = computeOwnerReliability(records);
    const kinds = summaries.map((s) => s.ownerKind);
    expect(kinds).toContain("subtrade");
    expect(kinds).toContain("shop");
  });
});

// ── ownerReliabilityBufferDays ────────────────────────────────────────────────

describe("ownerReliabilityBufferDays", () => {
  it("returns 0 with no records", () => {
    expect(ownerReliabilityBufferDays([])).toBe(0);
  });

  it("earns no buffer for a perfectly reliable owner", () => {
    const records: OwnerReliabilityRecord[] = [
      {
        ownerKind: "subtrade",
        ownerId: "sub-1",
        ownerName: "Sub",
        committedDate: "2026-04-01",
        actualDate: "2026-04-01",
        missed: false,
      },
    ];
    expect(ownerReliabilityBufferDays(records)).toBe(0);
  });

  it("earns ceil(missRate × base) days for an unreliable owner", () => {
    // 1 of 2 missed → 50% × 3 = 1.5 → ceil = 2.
    const records: OwnerReliabilityRecord[] = [
      {
        ownerKind: "subtrade",
        ownerId: "sub-1",
        ownerName: "Sub",
        committedDate: "2026-03-01",
        actualDate: null,
        missed: true,
      },
      {
        ownerKind: "subtrade",
        ownerId: "sub-1",
        ownerName: "Sub",
        committedDate: "2026-04-01",
        actualDate: "2026-04-01",
        missed: false,
      },
    ];
    expect(ownerReliabilityBufferDays(records, 3)).toBe(2);
  });

  it("sums the contingency across distinct owners (including a subtrade and the shop)", () => {
    const records: OwnerReliabilityRecord[] = [
      // Sub: 100% miss → ceil(1 × 3) = 3.
      {
        ownerKind: "subtrade",
        ownerId: "sub-1",
        ownerName: "Sub",
        committedDate: "2026-03-01",
        actualDate: null,
        missed: true,
      },
      // Shop: 100% miss → ceil(1 × 3) = 3.
      {
        ownerKind: "shop",
        ownerId: null,
        ownerName: "Good Woods",
        committedDate: "2026-03-01",
        actualDate: null,
        missed: true,
      },
    ];
    expect(ownerReliabilityBufferDays(records, 3)).toBe(6);
  });
});
