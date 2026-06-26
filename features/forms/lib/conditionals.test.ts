import { describe, it, expect } from "vitest";
import type { FormInstanceField } from "@shared/lib/types";
import { isFieldVisible } from "./conditionals";

const now = "2026-06-26T00:00:00.000Z";

function field(id: string, over: Partial<FormInstanceField> = {}): FormInstanceField {
  return {
    id,
    instanceId: "inst-1",
    label: `Field ${id}`,
    type: "short_text",
    config: {},
    value: null,
    checked: null,
    note: null,
    photoUrl: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

// ─── no showWhen — always visible ────────────────────────────────────────────

describe("isFieldVisible — no showWhen", () => {
  it("is visible when config has no showWhen", () => {
    const f = field("a", { config: {} });
    expect(isFieldVisible(f, [f])).toBe(true);
  });

  it("is visible when config.showWhen is explicitly undefined", () => {
    const f = field("a", { config: { required: true } });
    expect(isFieldVisible(f, [f])).toBe(true);
  });
});

// ─── missing trigger — visible (forward-compat / graceful) ───────────────────

describe("isFieldVisible — missing trigger field", () => {
  it("is visible when the trigger field id does not exist in allFields", () => {
    const f = field("b", {
      config: {
        showWhen: { fieldId: "does-not-exist", operator: "equals", value: "yes" },
      },
    });
    expect(isFieldVisible(f, [f])).toBe(true);
  });
});

// ─── operator: equals ────────────────────────────────────────────────────────

describe("isFieldVisible — equals operator", () => {
  it("is visible when trigger.value equals the condition value", () => {
    const trigger = field("a", { value: "yes" });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "equals", value: "yes" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });

  it("is hidden when trigger.value does not equal the condition value", () => {
    const trigger = field("a", { value: "no" });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "equals", value: "yes" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });

  it("is hidden when trigger.value is null (no answer yet)", () => {
    const trigger = field("a", { value: null });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "equals", value: "yes" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });
});

// ─── operator: not_equals ────────────────────────────────────────────────────

describe("isFieldVisible — not_equals operator", () => {
  it("is visible when trigger.value differs from the condition value", () => {
    const trigger = field("a", { value: "no" });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "not_equals", value: "yes" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });

  it("is hidden when trigger.value matches the condition value", () => {
    const trigger = field("a", { value: "yes" });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "not_equals", value: "yes" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });
});

// ─── operator: is_checked ────────────────────────────────────────────────────

describe("isFieldVisible — is_checked operator (yes_no / checkbox trigger)", () => {
  it("is visible when trigger.checked is true", () => {
    const trigger = field("a", { type: "checkbox", checked: true });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });

  it("is hidden when trigger.checked is null (unticked)", () => {
    const trigger = field("a", { type: "checkbox", checked: null });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });

  it("is hidden when trigger.checked is false", () => {
    const trigger = field("a", { type: "checkbox", checked: false });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });

  it("treats yes_no 'yes' value as checked (value path)", () => {
    const trigger = field("a", { type: "yes_no", value: "yes", checked: null });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });

  it("treats yes_no 'no' value as NOT checked", () => {
    const trigger = field("a", { type: "yes_no", value: "no", checked: null });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });
});

// ─── operator: is_not_checked ────────────────────────────────────────────────

describe("isFieldVisible — is_not_checked operator", () => {
  it("is visible when trigger.checked is null (unticked)", () => {
    const trigger = field("a", { type: "checkbox", checked: null });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_not_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });

  it("is visible when trigger.checked is false", () => {
    const trigger = field("a", { type: "checkbox", checked: false });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_not_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });

  it("is hidden when trigger.checked is true", () => {
    const trigger = field("a", { type: "checkbox", checked: true });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_not_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(false);
  });

  it("treats yes_no 'no' as not checked (visible)", () => {
    const trigger = field("a", { type: "yes_no", value: "no", checked: null });
    const dependent = field("b", {
      config: { showWhen: { fieldId: "a", operator: "is_not_checked" } },
    });
    expect(isFieldVisible(dependent, [trigger, dependent])).toBe(true);
  });
});
