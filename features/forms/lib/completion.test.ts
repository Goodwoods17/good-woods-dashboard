import { describe, it, expect } from "vitest";
import { incompleteRequiredFields, isInstanceComplete, signoffFileName } from "./completion";
import { rowToFormInstanceField, type FormInstanceFieldRow } from "./formInstancesRowMap";
import type { FormInstanceField } from "@shared/lib/types";

const baseRow: FormInstanceFieldRow = {
  id: "if1",
  instance_id: "i1",
  label: "Field",
  type: "short_text",
  config: {},
  value: null,
  checked: null,
  note: null,
  photo_url: null,
  sort_order: 0,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
};

function field(patch: Partial<FormInstanceFieldRow>): FormInstanceField {
  return rowToFormInstanceField({ ...baseRow, ...patch });
}

describe("isInstanceComplete (the completion gate)", () => {
  it("is complete when every required field passes its registry isComplete check", () => {
    const fields = [
      field({ id: "a", type: "section", label: "Heading" }),
      field({ id: "b", type: "checkbox", checked: true }),
      field({ id: "c", type: "short_text", value: "answered", config: { required: true } }),
    ];
    expect(isInstanceComplete(fields)).toBe(true);
  });

  it("is NOT complete when a required field is blank", () => {
    const fields = [
      field({ id: "a", type: "short_text", value: null, config: { required: true } }),
    ];
    expect(isInstanceComplete(fields)).toBe(false);
  });

  it("treats an optional blank field as fine — only required fields gate", () => {
    const fields = [
      field({ id: "a", type: "short_text", value: null, config: {} }),
      field({ id: "b", type: "yes_no", value: "yes" }),
    ];
    expect(isInstanceComplete(fields)).toBe(true);
  });

  it("gates a required signature on BOTH the PNG and the typed signer name", () => {
    const png = "i1/sig.png";
    const incomplete = [
      field({ id: "s", type: "signature", photo_url: png, config: { required: true } }),
    ];
    expect(isInstanceComplete(incomplete)).toBe(false);
    const complete = [
      field({
        id: "s",
        type: "signature",
        photo_url: png,
        config: { required: true, signerName: "Andrew", signedAt: "2026-06-25T12:00:00Z" },
      }),
    ];
    expect(isInstanceComplete(complete)).toBe(true);
  });

  it("an empty form (no fields) is complete — nothing to satisfy", () => {
    expect(isInstanceComplete([])).toBe(true);
  });

  it("a checkbox left unchecked blocks completion (checkbox is always required)", () => {
    expect(isInstanceComplete([field({ id: "c", type: "checkbox", checked: null })])).toBe(false);
  });
});

describe("incompleteRequiredFields (what is blocking the lock)", () => {
  it("lists only the fields failing the gate, by label", () => {
    const fields = [
      field({
        id: "a",
        type: "short_text",
        label: "Client",
        value: null,
        config: { required: true },
      }),
      field({ id: "b", type: "short_text", label: "Notes", value: "ok", config: {} }),
      field({ id: "c", type: "checkbox", label: "Hinges", checked: null }),
      field({ id: "d", type: "section", label: "Heading" }),
    ];
    expect(incompleteRequiredFields(fields).map((f) => f.label)).toEqual(["Client", "Hinges"]);
  });

  it("returns empty when everything passes", () => {
    const fields = [field({ id: "b", type: "short_text", value: "ok", config: {} })];
    expect(incompleteRequiredFields(fields)).toEqual([]);
  });
});

describe("signoffFileName", () => {
  it("builds a safe, dated filename from the title", () => {
    const name = signoffFileName("Pre-Install Check!", "2026-06-25T12:34:00Z");
    expect(name).toBe("Pre_Install_Check_signoff_2026-06-25.pdf");
  });

  it("falls back to 'form' when the title is empty", () => {
    expect(signoffFileName("   ", "2026-06-25T00:00:00Z")).toBe("form_signoff_2026-06-25.pdf");
  });
});
