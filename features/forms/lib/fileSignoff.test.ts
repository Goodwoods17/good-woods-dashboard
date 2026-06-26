import { describe, it, expect } from "vitest";
import type { FormInstance } from "@shared/lib/types";
import {
  buildSignoffDocumentRow,
  signoffDocumentLabel,
  type SignoffJobContext,
} from "./fileSignoff";

function instance(over: Partial<FormInstance> = {}): FormInstance {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id: "inst-1",
    templateId: "tmpl-1",
    jobId: "job-1",
    title: "Pre-Install Check",
    phase: null,
    status: "complete",
    signoffPath: null,
    completedAt: now,
    completedBy: "owner@example.com",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("signoffDocumentLabel", () => {
  it("includes the form title", () => {
    expect(signoffDocumentLabel("Pre-Install Check")).toBe("Pre-Install Check — Signoff");
  });

  it("trims leading/trailing whitespace from the title", () => {
    expect(signoffDocumentLabel("  Design Review  ")).toBe("Design Review — Signoff");
  });

  it("falls back to 'Form Signoff' when the title is empty", () => {
    expect(signoffDocumentLabel("   ")).toBe("Form Signoff");
    expect(signoffDocumentLabel("")).toBe("Form Signoff");
  });
});

describe("buildSignoffDocumentRow", () => {
  const storagePath = "inst-1/signoff.pdf";
  const jobCtx: SignoffJobContext = { jobId: "job-1", code: "GW-2026-001", name: "Smith Kitchen" };

  it("builds a well-formed ProjectDocument row", () => {
    const doc = buildSignoffDocumentRow(instance(), storagePath, jobCtx);
    expect(doc.projectId).toBe("job-1");
    expect(doc.kind).toBe("other");
    expect(doc.label).toBe("Pre-Install Check — Signoff");
    expect(doc.source).toBe("upload");
    expect(doc.storagePath).toBe(storagePath);
    expect(doc.mime).toBe("application/pdf");
    expect(doc.isCurrent).toBe(true);
    expect(doc.uploadedBy).toBe("owner@example.com");
    expect(typeof doc.id).toBe("string");
    expect(doc.id.length).toBeGreaterThan(0);
  });

  it("notes carry the job code + form phase when set", () => {
    const inst = instance({ phase: "install", jobId: "job-1" });
    const doc = buildSignoffDocumentRow(inst, storagePath, jobCtx);
    expect(doc.notes).toContain("GW-2026-001");
    expect(doc.notes).toContain("install");
  });

  it("notes omit phase when null", () => {
    const doc = buildSignoffDocumentRow(instance({ phase: null }), storagePath, jobCtx);
    expect(doc.notes).not.toMatch(/phase/i);
  });

  it("records the completedBy as uploadedBy", () => {
    const doc = buildSignoffDocumentRow(
      instance({ completedBy: "client@example.com" }),
      storagePath,
      jobCtx
    );
    expect(doc.uploadedBy).toBe("client@example.com");
  });

  it("uploadedBy is null when completedBy is null", () => {
    const doc = buildSignoffDocumentRow(instance({ completedBy: null }), storagePath, jobCtx);
    expect(doc.uploadedBy).toBeNull();
  });
});
