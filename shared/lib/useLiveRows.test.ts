import { describe, it, expect } from "vitest";
import { mergeRow, type RealtimeMergeEvent } from "./useLiveRows";

type Row = { id: string; n: number; job: string };

const getId = (r: Row) => r.id;
const upsert = (model: Row): RealtimeMergeEvent<Row> => ({ type: "UPSERT", model });
const del = (id: string | undefined): RealtimeMergeEvent<Row> => ({ type: "DELETE", id });

describe("mergeRow", () => {
  it("appends a new id by default", () => {
    const out = mergeRow([{ id: "a", n: 1, job: "j" }], upsert({ id: "b", n: 2, job: "j" }), {
      getId,
    });
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("prepends a new id when order is 'prepend' (timeline newest-first)", () => {
    const out = mergeRow([{ id: "a", n: 1, job: "j" }], upsert({ id: "b", n: 2, job: "j" }), {
      getId,
      order: "prepend",
    });
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("replaces in place on upsert of an existing id (idempotent echo)", () => {
    const out = mergeRow([{ id: "a", n: 1, job: "j" }], upsert({ id: "a", n: 9, job: "j" }), {
      getId,
    });
    expect(out).toEqual([{ id: "a", n: 9, job: "j" }]);
    expect(out).toHaveLength(1);
  });

  it("removes by id on DELETE", () => {
    const out = mergeRow(
      [
        { id: "a", n: 1, job: "j" },
        { id: "b", n: 2, job: "j" },
      ],
      del("a"),
      { getId }
    );
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("returns the same list unchanged on DELETE with no id", () => {
    const cur = [{ id: "a", n: 1, job: "j" }];
    expect(mergeRow(cur, del(undefined), { getId })).toBe(cur);
  });

  it("drops an upsert that fails the accept predicate (board's tracked-set filter)", () => {
    const cur = [{ id: "a", n: 1, job: "j1" }];
    const out = mergeRow(cur, upsert({ id: "b", n: 2, job: "j2" }), {
      getId,
      accept: (r) => r.job === "j1",
    });
    expect(out).toBe(cur); // untouched
  });

  it("accepts an upsert that passes the predicate", () => {
    const out = mergeRow([{ id: "a", n: 1, job: "j1" }], upsert({ id: "b", n: 2, job: "j1" }), {
      getId,
      accept: (r) => r.job === "j1",
    });
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
