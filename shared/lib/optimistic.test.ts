import { describe, it, expect, vi } from "vitest";
import { optimistic } from "./optimistic";

type Row = { id: string; n: number };

// A tiny stand-in for the ref + setState pair every store wires together.
function harness(initial: Row[]) {
  const ref = { current: initial };
  const setState = vi.fn((next: Row[]) => {
    ref.current = next;
  });
  return { ref, setState };
}

describe("optimistic", () => {
  it("applies the forward transform and pushes it to setState", async () => {
    const { ref, setState } = harness([{ id: "a", n: 0 }]);
    await optimistic({
      ref,
      setState,
      apply: (cur) => cur.map((x) => (x.id === "a" ? { ...x, n: 1 } : x)),
      rollback: (cur) => cur,
      persist: async () => {},
    });
    expect(ref.current).toEqual([{ id: "a", n: 1 }]);
    expect(setState).toHaveBeenCalledWith([{ id: "a", n: 1 }]);
  });

  it("does not roll back on success", async () => {
    const { ref, setState } = harness([{ id: "a", n: 0 }]);
    const rollback = vi.fn((cur: Row[]) => cur);
    await optimistic({
      ref,
      setState,
      apply: (cur) => cur.map((x) => ({ ...x, n: 9 })),
      rollback,
      persist: async () => {},
    });
    expect(rollback).not.toHaveBeenCalled();
    expect(ref.current).toEqual([{ id: "a", n: 9 }]);
  });

  it("adopts a corrected list returned by persist (insert id-swap)", async () => {
    const { ref, setState } = harness([]);
    await optimistic({
      ref,
      setState,
      apply: (cur) => [...cur, { id: "tmp", n: 1 }],
      rollback: (cur) => cur.filter((x) => x.id !== "tmp"),
      persist: async () => ref.current.map((x) => (x.id === "tmp" ? { id: "real", n: 1 } : x)),
    });
    expect(ref.current).toEqual([{ id: "real", n: 1 }]);
  });

  it("rolls back and re-throws when persist throws", async () => {
    const { ref, setState } = harness([{ id: "a", n: 0 }]);
    const boom = new Error("write failed");
    await expect(
      optimistic({
        ref,
        setState,
        apply: (cur) => cur.map((x) => (x.id === "a" ? { ...x, n: 5 } : x)),
        rollback: (cur) => cur.map((x) => (x.id === "a" ? { ...x, n: 0 } : x)),
        persist: async () => {
          throw boom;
        },
      })
    ).rejects.toThrow("write failed");
    expect(ref.current).toEqual([{ id: "a", n: 0 }]);
  });

  it("rollback reverts only the touched row — a concurrent change survives", async () => {
    const { ref, setState } = harness([
      { id: "a", n: 0 },
      { id: "b", n: 0 },
    ]);
    await expect(
      optimistic({
        ref,
        setState,
        apply: (cur) => cur.map((x) => (x.id === "a" ? { ...x, n: 1 } : x)),
        rollback: (cur) => cur.map((x) => (x.id === "a" ? { ...x, n: 0 } : x)),
        persist: async () => {
          // Simulate a concurrent mutation to a *different* row landing while
          // this write is in flight.
          ref.current = ref.current.map((x) => (x.id === "b" ? { ...x, n: 7 } : x));
          throw new Error("fail");
        },
      })
    ).rejects.toThrow();
    expect(ref.current).toEqual([
      { id: "a", n: 0 }, // reverted
      { id: "b", n: 7 }, // concurrent change preserved
    ]);
  });
});
