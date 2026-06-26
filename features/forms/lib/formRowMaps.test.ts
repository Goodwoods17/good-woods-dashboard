import { describe, it, expect } from "vitest";
import {
  formInstanceFieldToRow,
  formInstanceToRow,
  rowToFormInstance,
  rowToFormInstanceField,
  type FormInstanceFieldRow,
  type FormInstanceRow,
} from "./formInstancesRowMap";
import {
  formTemplateFieldToRow,
  formTemplateToRow,
  rowToFormTemplate,
  rowToFormTemplateField,
  type FormTemplateFieldRow,
  type FormTemplateRow,
} from "./formTemplatesRowMap";
import { snapshotTemplate } from "./snapshot";
import { FIELD_REGISTRY } from "./fieldRegistry";
import type { FieldType, FormTemplate, FormTemplateField } from "@shared/lib/types";

const templateRow: FormTemplateRow = {
  id: "t1",
  name: "Pre-Install Check",
  description: "Everything the installer needs.",
  phase: "install",
  is_default: true,
  active: true,
  sort_order: 0,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
};

const templateFieldRow: FormTemplateFieldRow = {
  id: "tf1",
  template_id: "t1",
  label: "Hinges packed",
  type: "checkbox",
  config: {},
  sort_order: 2,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
};

const instanceRow: FormInstanceRow = {
  id: "i1",
  template_id: "t1",
  job_id: "job-1",
  title: "Pre-Install Check",
  phase: "install",
  status: "in_progress",
  signoff_path: null,
  completed_at: null,
  completed_by: null,
  sort_order: 0,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
};

const instanceFieldRow: FormInstanceFieldRow = {
  id: "if1",
  instance_id: "i1",
  label: "Hinges packed",
  type: "checkbox",
  config: {},
  value: null,
  checked: true,
  note: "two boxes",
  photo_url: null,
  sort_order: 0,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
};

describe("formTemplatesRowMap", () => {
  it("maps a template row to a FormTemplate", () => {
    const t = rowToFormTemplate(templateRow);
    expect(t.isDefault).toBe(true);
    expect(t.phase).toBe("install");
    expect(t.sortOrder).toBe(0);
  });
  it("round-trips a template", () => {
    expect(formTemplateToRow(rowToFormTemplate(templateRow))).toEqual(templateRow);
  });
  it("round-trips a template field", () => {
    expect(formTemplateFieldToRow(rowToFormTemplateField(templateFieldRow))).toEqual(
      templateFieldRow
    );
  });
  it("defaults a null phase to null and absent config to {}", () => {
    const t = rowToFormTemplate({ ...templateRow, phase: null });
    expect(t.phase).toBeNull();
    const f = rowToFormTemplateField({ ...templateFieldRow, config: null });
    expect(f.config).toEqual({});
  });
});

describe("formInstancesRowMap", () => {
  it("maps an instance row to a FormInstance", () => {
    const i = rowToFormInstance(instanceRow);
    expect(i.jobId).toBe("job-1");
    expect(i.status).toBe("in_progress");
    expect(i.phase).toBe("install");
  });
  it("round-trips an instance", () => {
    expect(formInstanceToRow(rowToFormInstance(instanceRow))).toEqual(instanceRow);
  });
  it("round-trips an instance field (answer preserved)", () => {
    expect(formInstanceFieldToRow(rowToFormInstanceField(instanceFieldRow))).toEqual(
      instanceFieldRow
    );
  });
  it("treats a standalone (null job) instance correctly", () => {
    const i = rowToFormInstance({ ...instanceRow, job_id: null });
    expect(i.jobId).toBeNull();
  });
});

describe("snapshotTemplate (snapshot invariant)", () => {
  const template: FormTemplate = rowToFormTemplate(templateRow);
  const section: FormTemplateField = rowToFormTemplateField({
    ...templateFieldRow,
    id: "tf-sec",
    label: "Hardware",
    type: "section",
    sort_order: 0,
  });
  const checkbox: FormTemplateField = rowToFormTemplateField({
    ...templateFieldRow,
    sort_order: 5,
  });

  it("copies label/type/config from the template, ordered by sort_order", () => {
    const { instance, fields } = snapshotTemplate(template, [checkbox, section], "job-1");
    expect(instance.jobId).toBe("job-1");
    expect(instance.templateId).toBe("t1");
    expect(instance.status).toBe("draft");
    expect(instance.phase).toBe("install"); // phase snapshotted
    expect(fields.map((f) => f.label)).toEqual(["Hardware", "Hinges packed"]);
    expect(fields.map((f) => f.type)).toEqual(["section", "checkbox"]);
    expect(fields.map((f) => f.sortOrder)).toEqual([0, 1]);
  });

  it("freezes the snapshot — mutating instance config does not touch the master", () => {
    const { fields } = snapshotTemplate(template, [checkbox], "job-1");
    (fields[0].config as Record<string, unknown>).mutated = true;
    expect(checkbox.config).toEqual({}); // master untouched
  });

  it("starts answers empty", () => {
    const { fields } = snapshotTemplate(template, [checkbox], "job-1");
    expect(fields[0].checked).toBeNull();
    expect(fields[0].value).toBeNull();
  });

  it("supports standalone (null job) snapshots", () => {
    const { instance } = snapshotTemplate(template, [checkbox], null);
    expect(instance.jobId).toBeNull();
  });

  it("remaps a conditional field's showWhen.fieldId from template id to the new instance id", () => {
    const trigger: FormTemplateField = rowToFormTemplateField({
      ...templateFieldRow,
      id: "tf-trigger",
      label: "Has notes?",
      type: "yes_no",
      sort_order: 0,
      config: {},
    });
    const dependent: FormTemplateField = rowToFormTemplateField({
      ...templateFieldRow,
      id: "tf-dependent",
      label: "Notes",
      type: "short_text",
      sort_order: 1,
      config: { showWhen: { fieldId: "tf-trigger", operator: "is_checked" } },
    });

    const { fields } = snapshotTemplate(template, [trigger, dependent], "job-1");
    const [snapTrigger, snapDependent] = fields;
    const showWhen = (snapDependent.config as Record<string, unknown>).showWhen as {
      fieldId: string;
    };

    // Points at the NEW instance trigger id, not the stale template id.
    expect(showWhen.fieldId).toBe(snapTrigger.id);
    expect(showWhen.fieldId).not.toBe("tf-trigger");
    // Master condition untouched (frozen-copy invariant holds for nested config).
    expect((dependent.config as Record<string, unknown>).showWhen).toEqual({
      fieldId: "tf-trigger",
      operator: "is_checked",
    });
  });
});

describe("fieldRegistry", () => {
  const ALL_TYPES: FieldType[] = [
    "section",
    "checkbox",
    "short_text",
    "long_text",
    "number",
    "yes_no",
    "dropdown",
    "date",
    "photo",
    "signature",
  ];

  it("has an entry for every FieldType", () => {
    for (const t of ALL_TYPES) {
      expect(FIELD_REGISTRY[t]).toBeDefined();
      expect(FIELD_REGISTRY[t].type).toBe(t);
    }
  });

  it("wires every field type — section, checkbox, the 6 non-media types, photo + signature", () => {
    for (const t of ALL_TYPES) {
      expect(FIELD_REGISTRY[t].implemented).toBe(true);
    }
  });

  it("photo: complete once a photoUrl is set; incomplete when blank + required", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    expect(FIELD_REGISTRY.photo.isComplete({ ...base, type: "photo", photoUrl: "i1/f1.jpg" })).toBe(
      true
    );
    // Required + no photo → incomplete.
    expect(
      FIELD_REGISTRY.photo.isComplete({
        ...base,
        type: "photo",
        photoUrl: null,
        config: { required: true },
      })
    ).toBe(false);
    // Not required + no photo → complete (optional).
    expect(
      FIELD_REGISTRY.photo.isComplete({ ...base, type: "photo", photoUrl: null, config: {} })
    ).toBe(true);
  });

  it("signature: complete only with BOTH the PNG and a typed signer name", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    // PNG + signer name → complete.
    expect(
      FIELD_REGISTRY.signature.isComplete({
        ...base,
        type: "signature",
        photoUrl: "i1/f1.png",
        config: { signerName: "Andrew Chilton", signedAt: "2026-06-25T12:00:00Z" },
      })
    ).toBe(true);
    // PNG but no signer name → incomplete when required.
    expect(
      FIELD_REGISTRY.signature.isComplete({
        ...base,
        type: "signature",
        photoUrl: "i1/f1.png",
        config: { required: true },
      })
    ).toBe(false);
    // Signer name but no PNG → incomplete when required.
    expect(
      FIELD_REGISTRY.signature.isComplete({
        ...base,
        type: "signature",
        photoUrl: null,
        config: { required: true, signerName: "Andrew Chilton" },
      })
    ).toBe(false);
    // Not required + empty → complete (optional).
    expect(
      FIELD_REGISTRY.signature.isComplete({
        ...base,
        type: "signature",
        photoUrl: null,
        config: {},
      })
    ).toBe(true);
  });

  it("gates a checkbox on checked === true; a section is always complete", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    expect(FIELD_REGISTRY.checkbox.isComplete({ ...base, checked: true })).toBe(true);
    expect(FIELD_REGISTRY.checkbox.isComplete({ ...base, checked: null })).toBe(false);
    expect(FIELD_REGISTRY.section.isComplete({ ...base, type: "section" })).toBe(true);
  });

  it("text/number/date: complete when has a value; also complete when empty + not required", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    for (const t of ["short_text", "long_text", "number", "date"] as const) {
      // Answered → complete regardless of required flag.
      expect(FIELD_REGISTRY[t].isComplete({ ...base, type: t, value: "hello" })).toBe(true);
      // Required + empty → incomplete.
      expect(
        FIELD_REGISTRY[t].isComplete({ ...base, type: t, value: "", config: { required: true } })
      ).toBe(false);
      expect(
        FIELD_REGISTRY[t].isComplete({ ...base, type: t, value: null, config: { required: true } })
      ).toBe(false);
      // Not required + empty → complete (field is optional).
      expect(FIELD_REGISTRY[t].isComplete({ ...base, type: t, value: null, config: {} })).toBe(
        true
      );
    }
  });

  it("yes_no: complete on 'yes' or 'no'; incomplete when null + required", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    expect(FIELD_REGISTRY.yes_no.isComplete({ ...base, type: "yes_no", value: "yes" })).toBe(true);
    expect(FIELD_REGISTRY.yes_no.isComplete({ ...base, type: "yes_no", value: "no" })).toBe(true);
    expect(
      FIELD_REGISTRY.yes_no.isComplete({
        ...base,
        type: "yes_no",
        value: null,
        config: { required: true },
      })
    ).toBe(false);
    // Not required + unanswered → complete.
    expect(
      FIELD_REGISTRY.yes_no.isComplete({ ...base, type: "yes_no", value: null, config: {} })
    ).toBe(true);
  });

  it("dropdown: complete when a value is selected; incomplete when null + required", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    expect(
      FIELD_REGISTRY.dropdown.isComplete({ ...base, type: "dropdown", value: "Option A" })
    ).toBe(true);
    expect(
      FIELD_REGISTRY.dropdown.isComplete({
        ...base,
        type: "dropdown",
        value: null,
        config: { required: true },
      })
    ).toBe(false);
    // Not required + unanswered → complete.
    expect(
      FIELD_REGISTRY.dropdown.isComplete({ ...base, type: "dropdown", value: null, config: {} })
    ).toBe(true);
  });

  it("a non-required field with no value is considered complete", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    // When config.required is false/absent, unAnswered fields pass the gate.
    expect(
      FIELD_REGISTRY.short_text.isComplete({ ...base, type: "short_text", value: null, config: {} })
    ).toBe(true);
  });

  it("a required field with no value is NOT complete", () => {
    const base = rowToFormInstanceField(instanceFieldRow);
    expect(
      FIELD_REGISTRY.short_text.isComplete({
        ...base,
        type: "short_text",
        value: null,
        config: { required: true },
      })
    ).toBe(false);
  });
});
