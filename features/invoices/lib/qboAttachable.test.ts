/**
 * Unit tests for QBO S8 — attach source PDF to the pushed bill (Attachable).
 * Written first (TDD, red→green).
 *
 * Pure functions only: no Supabase, no network. These cover what the slice's
 * done-when hinges on without a live QBO sandbox:
 *   • Attachable metadata shape (EntityRef linked to the right Bill, correct mime)
 *   • Filename derivation from storage path + mime
 *   • Response parsing (extract the Attachable id)
 */
import { describe, it, expect } from "vitest";
import {
  buildAttachableMetadata,
  buildAttachableFilename,
  parseQboAttachableResponse,
} from "./qboAttachable";

describe("buildAttachableMetadata", () => {
  it("produces an EntityRef that links to the given Bill id", () => {
    const meta = buildAttachableMetadata("bill-42", "invoice.pdf", "application/pdf");
    expect(meta.AttachableRef).toHaveLength(1);
    expect(meta.AttachableRef[0].EntityRef.type).toBe("Bill");
    expect(meta.AttachableRef[0].EntityRef.value).toBe("bill-42");
    expect(meta.AttachableRef[0].IncludeOnSend).toBe(false);
  });

  it("threads the contentType and fileName straight through", () => {
    const meta = buildAttachableMetadata("bill-1", "inv.jpg", "image/jpeg");
    expect(meta.ContentType).toBe("image/jpeg");
    expect(meta.FileName).toBe("inv.jpg");
  });

  it("works with arbitrary bill ids (QBO numeric strings)", () => {
    const meta = buildAttachableMetadata("1234567890", "source.pdf", "application/pdf");
    expect(meta.AttachableRef[0].EntityRef.value).toBe("1234567890");
  });
});

describe("buildAttachableFilename", () => {
  it("returns 'invoice.pdf' for a PDF storage path with PDF mime", () => {
    expect(buildAttachableFilename("abc123/source.pdf", "application/pdf")).toBe("invoice.pdf");
  });

  it("returns 'invoice.jpg' when mime is image/jpeg", () => {
    expect(buildAttachableFilename("abc123/source.jpg", "image/jpeg")).toBe("invoice.jpg");
  });

  it("returns 'invoice.png' when mime is image/png", () => {
    expect(buildAttachableFilename("abc123/source.png", "image/png")).toBe("invoice.png");
  });

  it("falls back to path extension when mime is null", () => {
    expect(buildAttachableFilename("abc123/source.pdf", null)).toBe("invoice.pdf");
  });

  it("prefers mime-derived extension over path extension", () => {
    // If mime says jpeg but path says pdf, trust the mime (mime is set at upload time
    // from the File.type, which is authoritative).
    expect(buildAttachableFilename("abc123/source.pdf", "image/jpeg")).toBe("invoice.jpg");
  });

  it("strips special chars from mime subtype", () => {
    // e.g. image/heic → 'heic'
    expect(buildAttachableFilename("abc123/source.heic", "image/heic")).toBe("invoice.heic");
  });

  it("defaults to pdf when both path and mime are inconclusive", () => {
    expect(buildAttachableFilename("abc123/source", null)).toBe("invoice.pdf");
  });
});

describe("parseQboAttachableResponse", () => {
  it("extracts the Attachable id from a well-formed QBO upload response", () => {
    const body = {
      AttachableResponse: [
        {
          Attachable: { Id: "987", FileName: "invoice.pdf" },
        },
      ],
    };
    expect(parseQboAttachableResponse(body)).toBe("987");
  });

  it("returns null for an empty AttachableResponse array", () => {
    expect(parseQboAttachableResponse({ AttachableResponse: [] })).toBeNull();
  });

  it("returns null when AttachableResponse is missing", () => {
    expect(parseQboAttachableResponse({})).toBeNull();
    expect(parseQboAttachableResponse(null)).toBeNull();
    expect(parseQboAttachableResponse(undefined)).toBeNull();
  });

  it("returns null when the first entry has no Attachable", () => {
    expect(parseQboAttachableResponse({ AttachableResponse: [{}] })).toBeNull();
  });

  it("returns null when Attachable has no Id", () => {
    expect(parseQboAttachableResponse({ AttachableResponse: [{ Attachable: {} }] })).toBeNull();
  });
});
