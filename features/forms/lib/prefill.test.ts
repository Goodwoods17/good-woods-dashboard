import { describe, it, expect } from "vitest";
import {
  resolvePrefill,
  applyPrefill,
  PREFILL_SOURCE_KEYS,
  PREFILL_SOURCE_LABELS,
} from "./prefill";
import type { Job, JobPiece, FormInstanceField } from "@shared/lib/types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BASE_JOB: Job = {
  id: "job-1",
  code: "GW-001",
  name: "Smith Kitchen",
  client: "Alice Smith",
  address: "123 Maple St, Vancouver, BC",
  template: "full_project",
  pipelineStatus: "in_production",
  healthStatus: "on_track",
  currentMilestone: "assembly",
  installDate: "2026-08-15",
  revenue: 25000,
  costs: [],
  invoice: {
    number: "INV-001",
    issuedDate: "2026-06-01",
    dueDate: "2026-07-01",
    lineItems: [],
  },
  siteAccess: {
    buzzerCode: "4321",
    doorCode: "9876",
    lockboxCode: "5555",
    parkingNotes: "Visitor stall #3",
    siteContact: {
      name: "Bob Manager",
      phone: "604-555-1234",
      role: "property_manager",
    },
  },
};

const BASE_PIECE: JobPiece = {
  id: "p1",
  projectId: "job-1",
  kind: "cabinet",
  code: "R1C2",
  room: "Kitchen",
  label: "Base cab",
  status: "not_started",
  source: "manual",
  sortOrder: 0,
  createdAt: "2026-06-25T00:00:00Z",
};

const BLANK_FIELD: FormInstanceField = {
  id: "if1",
  instanceId: "i1",
  label: "Test field",
  type: "short_text",
  config: {},
  value: null,
  checked: null,
  note: null,
  photoUrl: null,
  sortOrder: 0,
  createdAt: "2026-06-25T00:00:00Z",
  updatedAt: "2026-06-25T00:00:00Z",
};

// ─── resolvePrefill — each source key ───────────────────────────────────────

describe("resolvePrefill — header sources", () => {
  it("client: resolves job.client", () => {
    expect(resolvePrefill("client", BASE_JOB, [])).toBe("Alice Smith");
  });

  it("address: resolves job.address", () => {
    expect(resolvePrefill("address", BASE_JOB, [])).toBe("123 Maple St, Vancouver, BC");
  });

  it("installDate: resolves job.installDate", () => {
    expect(resolvePrefill("installDate", BASE_JOB, [])).toBe("2026-08-15");
  });

  it("jobCode: resolves job.code", () => {
    expect(resolvePrefill("jobCode", BASE_JOB, [])).toBe("GW-001");
  });

  it("template: resolves the human label for the job template", () => {
    expect(resolvePrefill("template", BASE_JOB, [])).toBe("Full project");
    expect(resolvePrefill("template", { ...BASE_JOB, template: "refacing" }, [])).toBe("Refacing");
    expect(resolvePrefill("template", { ...BASE_JOB, template: "spray_finishing" }, [])).toBe(
      "Spray finishing"
    );
    expect(resolvePrefill("template", { ...BASE_JOB, template: "install_only" }, [])).toBe(
      "Install only"
    );
  });
});

describe("resolvePrefill — site contact & access", () => {
  it("siteContactName: resolves siteAccess.siteContact.name", () => {
    expect(resolvePrefill("siteContactName", BASE_JOB, [])).toBe("Bob Manager");
  });

  it("siteContactPhone: resolves siteAccess.siteContact.phone", () => {
    expect(resolvePrefill("siteContactPhone", BASE_JOB, [])).toBe("604-555-1234");
  });

  it("buzzerCode: resolves siteAccess.buzzerCode", () => {
    expect(resolvePrefill("buzzerCode", BASE_JOB, [])).toBe("4321");
  });

  it("doorCode: resolves siteAccess.doorCode", () => {
    expect(resolvePrefill("doorCode", BASE_JOB, [])).toBe("9876");
  });

  it("lockboxCode: resolves siteAccess.lockboxCode", () => {
    expect(resolvePrefill("lockboxCode", BASE_JOB, [])).toBe("5555");
  });

  it("parkingNotes: resolves siteAccess.parkingNotes", () => {
    expect(resolvePrefill("parkingNotes", BASE_JOB, [])).toBe("Visitor stall #3");
  });
});

describe("resolvePrefill — piecesSummary", () => {
  it("returns null when pieces is empty", () => {
    expect(resolvePrefill("piecesSummary", BASE_JOB, [])).toBeNull();
  });

  it("formats a single piece as 'Room — Code — label'", () => {
    const result = resolvePrefill("piecesSummary", BASE_JOB, [BASE_PIECE]);
    expect(result).toBe("Kitchen — R1C2 — Base cab");
  });

  it("joins multiple pieces with newlines, ordered by sortOrder", () => {
    const p2: JobPiece = {
      ...BASE_PIECE,
      id: "p2",
      code: "R2C1",
      room: "Bathroom",
      label: "Vanity",
      sortOrder: 1,
    };
    const result = resolvePrefill("piecesSummary", BASE_JOB, [p2, BASE_PIECE]);
    // Should be sorted by sortOrder: Kitchen first (0), then Bathroom (1).
    expect(result).toBe("Kitchen — R1C2 — Base cab\nBathroom — R2C1 — Vanity");
  });

  it("omits room/code when they are null/undefined", () => {
    const noRoom: JobPiece = { ...BASE_PIECE, room: null, code: null };
    const result = resolvePrefill("piecesSummary", BASE_JOB, [noRoom]);
    expect(result).toBe("Base cab");
  });

  it("omits room but keeps code when room is null", () => {
    const noRoom: JobPiece = { ...BASE_PIECE, room: null };
    const result = resolvePrefill("piecesSummary", BASE_JOB, [noRoom]);
    expect(result).toBe("R1C2 — Base cab");
  });
});

describe("resolvePrefill — null / missing values", () => {
  it("returns null for an unknown key", () => {
    expect(resolvePrefill("unknownKey", BASE_JOB, [])).toBeNull();
  });

  it("client returns null when empty string", () => {
    expect(resolvePrefill("client", { ...BASE_JOB, client: "" }, [])).toBeNull();
  });

  it("siteContactName returns null when siteAccess is absent", () => {
    const { siteAccess: _sa, ...noSiteAccess } = BASE_JOB;
    expect(resolvePrefill("siteContactName", noSiteAccess as Job, [])).toBeNull();
  });

  it("siteContactName returns null when siteContact.name is absent", () => {
    const job = { ...BASE_JOB, siteAccess: { ...BASE_JOB.siteAccess, siteContact: {} } };
    expect(resolvePrefill("siteContactName", job as Job, [])).toBeNull();
  });

  it("buzzerCode returns null when siteAccess is absent", () => {
    const { siteAccess: _sa, ...noSiteAccess } = BASE_JOB;
    expect(resolvePrefill("buzzerCode", noSiteAccess as Job, [])).toBeNull();
  });
});

// ─── applyPrefill ────────────────────────────────────────────────────────────

describe("applyPrefill", () => {
  it("fills value for a field with config.prefillFrom = 'address'", () => {
    const field: FormInstanceField = {
      ...BLANK_FIELD,
      config: { prefillFrom: "address" },
    };
    const [result] = applyPrefill([field], BASE_JOB, []);
    expect(result.value).toBe("123 Maple St, Vancouver, BC");
  });

  it("fills value for a field with config.prefillFrom = 'installDate'", () => {
    const field: FormInstanceField = {
      ...BLANK_FIELD,
      type: "date",
      config: { prefillFrom: "installDate" },
    };
    const [result] = applyPrefill([field], BASE_JOB, []);
    expect(result.value).toBe("2026-08-15");
  });

  it("fills piecesSummary into a long_text field", () => {
    const field: FormInstanceField = {
      ...BLANK_FIELD,
      type: "long_text",
      config: { prefillFrom: "piecesSummary" },
    };
    const [result] = applyPrefill([field], BASE_JOB, [BASE_PIECE]);
    expect(result.value).toBe("Kitchen — R1C2 — Base cab");
  });

  it("leaves a field unchanged when config.prefillFrom is absent", () => {
    const field: FormInstanceField = { ...BLANK_FIELD, config: {} };
    const [result] = applyPrefill([field], BASE_JOB, []);
    expect(result.value).toBeNull();
  });

  it("leaves a field unchanged when the resolved value is null", () => {
    const field: FormInstanceField = {
      ...BLANK_FIELD,
      config: { prefillFrom: "piecesSummary" }, // no pieces → null
    };
    const [result] = applyPrefill([field], BASE_JOB, []);
    expect(result.value).toBeNull();
  });

  it("fills only the matching fields, leaves others untouched", () => {
    const addressField: FormInstanceField = {
      ...BLANK_FIELD,
      id: "if1",
      config: { prefillFrom: "address" },
    };
    const plainField: FormInstanceField = {
      ...BLANK_FIELD,
      id: "if2",
      config: {},
    };
    const [r1, r2] = applyPrefill([addressField, plainField], BASE_JOB, []);
    expect(r1.value).toBe("123 Maple St, Vancouver, BC");
    expect(r2.value).toBeNull();
  });

  it("returns a new array (immutable — does not mutate the input)", () => {
    const field: FormInstanceField = {
      ...BLANK_FIELD,
      config: { prefillFrom: "address" },
    };
    const original = [field];
    const result = applyPrefill(original, BASE_JOB, []);
    expect(result).not.toBe(original);
    // Original field untouched.
    expect(original[0].value).toBeNull();
  });
});

// ─── Registry completeness ────────────────────────────────────────────────────

describe("PREFILL_SOURCE_KEYS completeness", () => {
  it("every source key has a display label", () => {
    for (const key of PREFILL_SOURCE_KEYS) {
      expect(PREFILL_SOURCE_LABELS[key]).toBeTruthy();
    }
  });
});
