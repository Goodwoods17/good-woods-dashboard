import { describe, it, expect } from "vitest";
import {
  parsePhotoTag,
  serializePhotoTag,
  newPhotoIssue,
  upsertIssue,
  removeIssue,
  type PhotoTag,
  type PhotoIssue,
} from "./photoTagging";

describe("parsePhotoTag", () => {
  it("returns null for null notes", () => {
    expect(parsePhotoTag(null)).toBeNull();
  });

  it("returns null for undefined notes", () => {
    expect(parsePhotoTag(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePhotoTag("")).toBeNull();
  });

  it("returns null for free-text notes (non-JSON)", () => {
    expect(parsePhotoTag("some plain note")).toBeNull();
  });

  it("returns null for valid JSON without milestone/position", () => {
    expect(parsePhotoTag(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null when milestone is invalid", () => {
    expect(
      parsePhotoTag(JSON.stringify({ milestone: "magic", position: "before" }))
    ).toBeNull();
  });

  it("returns null when position is invalid", () => {
    expect(
      parsePhotoTag(JSON.stringify({ milestone: "install", position: "during" }))
    ).toBeNull();
  });

  it("parses a valid before tag with no issues", () => {
    const tag = parsePhotoTag(
      JSON.stringify({ milestone: "install", position: "before" })
    );
    expect(tag).toEqual({ milestone: "install", position: "before", issues: [] });
  });

  it("parses a valid after tag with issues", () => {
    const issues: PhotoIssue[] = [
      {
        id: "abc",
        box: { x: 0.1, y: 0.2, w: 0.05, h: 0.05 },
        note: "scratch on door",
      },
    ];
    const tag = parsePhotoTag(
      JSON.stringify({ milestone: "assembly", position: "after", issues })
    );
    expect(tag?.milestone).toBe("assembly");
    expect(tag?.position).toBe("after");
    expect(tag?.issues).toHaveLength(1);
    expect(tag?.issues[0].note).toBe("scratch on door");
  });

  it("defaults issues to [] when missing from JSON", () => {
    const tag = parsePhotoTag(
      JSON.stringify({ milestone: "delivery", position: "after" })
    );
    expect(tag?.issues).toEqual([]);
  });

  it("accepts all valid milestone stages", () => {
    const stages = ["design", "cnc", "assembly", "finishing", "delivery", "install"] as const;
    for (const milestone of stages) {
      const tag = parsePhotoTag(JSON.stringify({ milestone, position: "before" }));
      expect(tag?.milestone).toBe(milestone);
    }
  });
});

describe("serializePhotoTag", () => {
  it("round-trips a tag through parse → serialize", () => {
    const tag: PhotoTag = {
      milestone: "install",
      position: "after",
      issues: [{ id: "x1", box: { x: 0, y: 0, w: 0.1, h: 0.1 }, note: "test" }],
    };
    const serialized = serializePhotoTag(tag);
    const parsed = parsePhotoTag(serialized);
    expect(parsed).toEqual(tag);
  });
});

describe("newPhotoIssue", () => {
  it("returns an issue with a non-empty id", () => {
    const box = { x: 0.1, y: 0.2, w: 0.05, h: 0.05 };
    const issue = newPhotoIssue(box);
    expect(issue.id).toBeTruthy();
    expect(issue.box).toEqual(box);
    expect(issue.note).toBe("");
  });

  it("accepts a custom note", () => {
    const issue = newPhotoIssue({ x: 0, y: 0, w: 0.1, h: 0.1 }, "door gap");
    expect(issue.note).toBe("door gap");
  });

  it("generates unique ids across calls", () => {
    const a = newPhotoIssue({ x: 0, y: 0, w: 0.1, h: 0.1 });
    const b = newPhotoIssue({ x: 0, y: 0, w: 0.1, h: 0.1 });
    expect(a.id).not.toBe(b.id);
  });
});

describe("upsertIssue", () => {
  const base: PhotoTag = {
    milestone: "install",
    position: "after",
    issues: [{ id: "i1", box: { x: 0, y: 0, w: 0.1, h: 0.1 }, note: "original" }],
  };

  it("adds a new issue when id is not found", () => {
    const newIssue: PhotoIssue = { id: "i2", box: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, note: "new" };
    const result = upsertIssue(base, newIssue);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[1].id).toBe("i2");
  });

  it("replaces an existing issue by id", () => {
    const updated: PhotoIssue = { id: "i1", box: { x: 0, y: 0, w: 0.1, h: 0.1 }, note: "updated" };
    const result = upsertIssue(base, updated);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].note).toBe("updated");
  });

  it("does not mutate the original tag", () => {
    const newIssue: PhotoIssue = { id: "i3", box: { x: 0, y: 0, w: 0.1, h: 0.1 }, note: "" };
    upsertIssue(base, newIssue);
    expect(base.issues).toHaveLength(1);
  });
});

describe("removeIssue", () => {
  const base: PhotoTag = {
    milestone: "install",
    position: "after",
    issues: [
      { id: "i1", box: { x: 0, y: 0, w: 0.1, h: 0.1 }, note: "one" },
      { id: "i2", box: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, note: "two" },
    ],
  };

  it("removes the matching issue", () => {
    const result = removeIssue(base, "i1");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe("i2");
  });

  it("no-ops when id is not found", () => {
    const result = removeIssue(base, "missing");
    expect(result.issues).toHaveLength(2);
  });

  it("does not mutate the original tag", () => {
    removeIssue(base, "i1");
    expect(base.issues).toHaveLength(2);
  });
});
