import { describe, it, expect } from "vitest";
import { nextStatus, isJobItemDone } from "./statusCycle";

describe("nextStatus — tap-to-cycle order", () => {
  it("advances not_started → in_progress → blocked → done", () => {
    expect(nextStatus("not_started")).toBe("in_progress");
    expect(nextStatus("in_progress")).toBe("blocked");
    expect(nextStatus("blocked")).toBe("done");
  });

  it("wraps done → not_started so a tap is always repeatable", () => {
    expect(nextStatus("done")).toBe("not_started");
  });

  it("cycles back to the start after four taps", () => {
    let s = nextStatus("not_started");
    s = nextStatus(s);
    s = nextStatus(s);
    s = nextStatus(s);
    expect(s).toBe("not_started");
  });
});

describe("isJobItemDone — done normalisation", () => {
  it("is true only at status 'done'", () => {
    expect(isJobItemDone("done")).toBe(true);
    expect(isJobItemDone("not_started")).toBe(false);
    expect(isJobItemDone("in_progress")).toBe(false);
    expect(isJobItemDone("blocked")).toBe(false);
  });
});
