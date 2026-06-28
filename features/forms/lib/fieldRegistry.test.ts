import { describe, expect, it } from "vitest";
import type { FormInstanceField } from "@shared/lib/types";
import {
  answerableFields,
  FIELD_REGISTRY,
  FIELD_TYPES,
  IMPLEMENTED_TYPES,
  isFieldRequired,
} from "./fieldRegistry";

function field(over: Partial<FormInstanceField> = {}): FormInstanceField {
  return {
    id: "f1",
    instanceId: "i1",
    label: "Field",
    type: "short_text",
    config: {},
    value: null,
    checked: null,
    note: null,
    photoUrl: null,
    sortOrder: 0,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...over,
  };
}

describe("isFieldRequired", () => {
  it("is true only when config.required === true", () => {
    expect(isFieldRequired(field({ config: { required: true } }))).toBe(true);
  });

  it("is false when required is absent, false, or non-boolean-truthy", () => {
    expect(isFieldRequired(field({ config: {} }))).toBe(false);
    expect(isFieldRequired(field({ config: { required: false } }))).toBe(false);
    expect(isFieldRequired(field({ config: { required: "yes" } }))).toBe(false);
  });

  it("works on a bare { config } object (template-editor draft state)", () => {
    expect(isFieldRequired({ config: { required: true } })).toBe(true);
    expect(isFieldRequired({ config: undefined })).toBe(false);
  });
});

describe("IMPLEMENTED_TYPES", () => {
  it("equals the registry-order filter of implemented types", () => {
    expect(IMPLEMENTED_TYPES).toEqual(FIELD_TYPES.filter((t) => FIELD_REGISTRY[t].implemented));
  });

  it("contains only implemented types", () => {
    expect(IMPLEMENTED_TYPES.every((t) => FIELD_REGISTRY[t].implemented)).toBe(true);
  });
});

describe("answerableFields", () => {
  it("drops layout (section) fields and keeps answerable ones", () => {
    const fields = [
      field({ id: "sec", type: "section" }),
      field({ id: "txt", type: "short_text" }),
      field({ id: "chk", type: "checkbox" }),
    ];
    expect(answerableFields(fields).map((f) => f.id)).toEqual(["txt", "chk"]);
  });

  it("keeps an unknown/forward-compat type (only known layout types are filtered)", () => {
    const fields = [field({ id: "future", type: "wormhole" as FormInstanceField["type"] })];
    expect(answerableFields(fields).map((f) => f.id)).toEqual(["future"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(answerableFields([])).toEqual([]);
  });
});
