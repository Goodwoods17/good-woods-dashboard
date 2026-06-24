import { describe, it, expect } from "vitest";
import {
  NOT_STARTED, DONE, lifecycle, nextStatus, prevStatus, progress,
  isCutTransition, STAGE_PIPELINES,
} from "./pipelines";

describe("pipelines", () => {
  it("cabinet lifecycle is bookended not_started..done", () => {
    const lc = lifecycle("cabinet");
    expect(lc[0]).toBe(NOT_STARTED);
    expect(lc[lc.length - 1]).toBe(DONE);
    expect(lc).toContain("assembled");
    expect(lc).toHaveLength(STAGE_PIPELINES.cabinet.length + 2);
  });

  it("part lifecycle uses the part stages", () => {
    expect(lifecycle("end_panel")).toContain("edgebanded");
    expect(lifecycle("end_panel")).not.toContain("assembled");
  });

  it("advances and regresses one step", () => {
    expect(nextStatus("cabinet", NOT_STARTED)).toBe("cut");
    expect(nextStatus("cabinet", "cut")).toBe("assembled");
    expect(prevStatus("cabinet", "cut")).toBe(NOT_STARTED);
  });

  it("nextStatus past done is null; prev before not_started is null", () => {
    expect(nextStatus("cabinet", DONE)).toBeNull();
    expect(prevStatus("cabinet", NOT_STARTED)).toBeNull();
  });

  it("progress is index/total", () => {
    expect(progress("cabinet", NOT_STARTED)).toEqual({ index: 0, total: lifecycle("cabinet").length - 1 });
    expect(progress("cabinet", DONE).index).toBe(lifecycle("cabinet").length - 1);
  });

  it("flags the cut transition (for the forced cut-method prompt)", () => {
    expect(isCutTransition("cabinet", NOT_STARTED, "cut")).toBe(true);
    expect(isCutTransition("cabinet", "cut", "assembled")).toBe(false);
  });
});
