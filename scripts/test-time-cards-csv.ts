/* eslint-disable no-console */
import assert from "node:assert/strict";
import { timeCardsToCsv } from "../features/labour/lib/timeCardsCsv";
import type { TimeCardCsvNames } from "../features/labour/lib/timeCardsCsv";
import type { TimeCardEntry } from "../features/labour/lib/timeCards";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

const names: TimeCardCsvNames = {
  worker: (id) => id ?? "Unassigned",
  job: (id) => id ?? "No job",
  code: (id) => id ?? "—",
};

function makeEntry(overrides: Partial<TimeCardEntry> = {}): TimeCardEntry {
  return {
    sessionId: "s1",
    date: "2026-06-20",
    workerId: "w1",
    jobId: "j1",
    operationId: "o1",
    ms: 3_600_000,
    ...overrides,
  };
}

// 1. Header row
check('header row is exactly "Date","Worker","Job","Code","Hours"', () => {
  const csv = timeCardsToCsv([], names);
  assert.equal(csv, '"Date","Worker","Job","Code","Hours"');
});

// 2a. 3_600_000 ms → Hours "1.00"
check("3_600_000 ms entry produces Hours field 1.00", () => {
  const csv = timeCardsToCsv([makeEntry({ ms: 3_600_000 })], names);
  const rows = csv.split("\r\n");
  assert.equal(rows.length, 2);
  const fields = rows[1].split(",");
  assert.equal(fields[4], '"1.00"');
});

// 2b. 5_400_000 ms → Hours "1.50"
check("5_400_000 ms entry produces Hours field 1.50", () => {
  const csv = timeCardsToCsv([makeEntry({ ms: 5_400_000 })], names);
  const rows = csv.split("\r\n");
  const fields = rows[1].split(",");
  assert.equal(fields[4], '"1.50"');
});

// 3. Comma in a name stays protected inside quotes
check("comma in job name is protected inside a quoted field", () => {
  const commaNames: TimeCardCsvNames = {
    worker: () => "Alice",
    job: () => "Smith, John",
    code: () => "ASM",
  };
  const csv = timeCardsToCsv([makeEntry()], commaNames);
  const rows = csv.split("\r\n");
  // The produced row must contain the field with surrounding quotes
  assert.ok(rows[1].includes('"Smith, John"'), `expected '"Smith, John"' in: ${rows[1]}`);
});

// 4. Double-quote in a name is escaped to doubled quotes
check('double-quote in worker name is escaped to ""', () => {
  const quoteNames: TimeCardCsvNames = {
    worker: () => 'Bob "the saw" Lee',
    job: () => "j1",
    code: () => "CUT",
  };
  const csv = timeCardsToCsv([makeEntry()], quoteNames);
  const rows = csv.split("\r\n");
  assert.ok(
    rows[1].includes('"Bob ""the saw"" Lee"'),
    `expected escaped double-quotes in: ${rows[1]}`
  );
});

// 5. Multiple entries produce correct row count
check("multiple entries produce header + N rows separated by CRLF", () => {
  const entries = [makeEntry({ sessionId: "s1", ms: 3_600_000 }), makeEntry({ sessionId: "s2", ms: 7_200_000 })];
  const csv = timeCardsToCsv(entries, names);
  const rows = csv.split("\r\n");
  assert.equal(rows.length, 3);
  assert.ok(rows[2].includes('"2.00"'));
});

console.log(`\n${passed} checks passed.`);
