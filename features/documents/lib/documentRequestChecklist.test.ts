import { describe, it, expect } from "vitest";
import { buildRequestChecklist } from "./documentRequestChecklist";

describe("buildRequestChecklist — outstanding-items status for the upload portal", () => {
  it("is 'none' (gray) when nothing has been uploaded yet", () => {
    const c = buildRequestChecklist(["Sink elevation", "Hinge schedule"], []);
    expect(c.status).toBe("none");
    expect(c.outstandingCount).toBe(2);
    expect(c.items.map((i) => i.satisfied)).toEqual([false, false]);
  });

  it("is 'partial' (yellow) when some — but not all — requested items are satisfied", () => {
    const c = buildRequestChecklist(["Sink elevation", "Hinge schedule"], [{ requestIndex: 0 }]);
    expect(c.status).toBe("partial");
    expect(c.outstandingCount).toBe(1);
    expect(c.items[0].satisfied).toBe(true);
    expect(c.items[1].satisfied).toBe(false);
  });

  it("is 'complete' (green) when every requested item has at least one upload", () => {
    const c = buildRequestChecklist(
      ["Sink elevation", "Hinge schedule"],
      [{ requestIndex: 0 }, { requestIndex: 1 }, { requestIndex: 1 }]
    );
    expect(c.status).toBe("complete");
    expect(c.outstandingCount).toBe(0);
  });

  it("ignores submissions whose requestIndex is out of range or null (unfiled extras)", () => {
    const c = buildRequestChecklist(
      ["Sink elevation"],
      [{ requestIndex: null }, { requestIndex: 9 }]
    );
    expect(c.status).toBe("none");
    expect(c.outstandingCount).toBe(1);
    expect(c.extraCount).toBe(2);
  });

  it("with NO requested items, is 'complete' once anything is uploaded, else 'none'", () => {
    expect(buildRequestChecklist([], []).status).toBe("none");
    expect(buildRequestChecklist([], [{ requestIndex: null }]).status).toBe("complete");
  });
});
