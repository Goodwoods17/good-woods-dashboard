/* eslint-disable no-console */
import assert from "node:assert/strict";
import { visibleAttrs, setAttr, removeAttr } from "../features/catalog/lib/attributes";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

check("visibleAttrs excludes reserved coats for finish, coerces to string, sorts", () => {
  const r = visibleAttrs({ coats: 2, sheen: "matte", grit: 220 }, "finish");
  assert.deepEqual(r, [["grit", "220"], ["sheen", "matte"]]);
});
check("visibleAttrs keeps all keys for non-finish kinds", () => {
  const r = visibleAttrs({ finish: "nickel", overlay: "full" }, "hardware");
  assert.deepEqual(r, [["finish", "nickel"], ["overlay", "full"]]);
});
check("setAttr upserts + trims key, returns new object", () => {
  const a = { finish: "nickel" };
  const b = setAttr(a, "  overlay ", "full");
  assert.deepEqual(b, { finish: "nickel", overlay: "full" });
  assert.notEqual(a, b); // immutable
  assert.equal(setAttr(b, "overlay", "half").overlay, "half"); // update
});
check("setAttr ignores blank key", () => {
  const a = { x: "1" };
  assert.deepEqual(setAttr(a, "   ", "v"), a);
});
check("removeAttr deletes the key immutably", () => {
  const a = { finish: "nickel", overlay: "full" };
  const b = removeAttr(a, "overlay");
  assert.deepEqual(b, { finish: "nickel" });
  assert.notEqual(a, b);
});
console.log(`\n${passed} checks passed.`);
