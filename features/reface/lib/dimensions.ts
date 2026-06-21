/**
 * Dimension parsing + fraction formatting, ported from door-sizer.html.
 *
 * Pure and unit-testable. Used now for typed fraction entry ("23 3/4") and for
 * printing shop-convention fraction strings onto the Wood Doors order form;
 * {@link normalizeDictation} / {@link parseDictation} are kept for the later
 * voice-dictation phase (P3) but already work standalone.
 */

export type ParsedDimension = {
  /** Numeric inches. */
  decimal: number;
  /** Canonical shop string, e.g. "23 3/4". */
  display: string;
  kind: "fraction" | "decimal" | "integer";
};

// Longer phrases first so they win the regex race.
const FRACTION_PHRASES: [RegExp, string][] = [
  [/\bone\s+sixteenth\b/g, "1/16"],
  [/\ban?\s+sixteenth\b/g, "1/16"],
  [/\bthree\s+sixteenths?\b/g, "3/16"],
  [/\bfive\s+sixteenths?\b/g, "5/16"],
  [/\bseven\s+sixteenths?\b/g, "7/16"],
  [/\bnine\s+sixteenths?\b/g, "9/16"],
  [/\beleven\s+sixteenths?\b/g, "11/16"],
  [/\bthirteen\s+sixteenths?\b/g, "13/16"],
  [/\bfifteen\s+sixteenths?\b/g, "15/16"],
  [/\bone\s+eighth\b/g, "1/8"],
  [/\ban?\s+eighth\b/g, "1/8"],
  [/\bthree\s+eighths?\b/g, "3/8"],
  [/\bfive\s+eighths?\b/g, "5/8"],
  [/\bseven\s+eighths?\b/g, "7/8"],
  [/\bone\s+quarter\b/g, "1/4"],
  [/\ban?\s+quarter\b/g, "1/4"],
  [/\bthree\s+quarters?\b/g, "3/4"],
  [/\bone\s+half\b/g, "1/2"],
  [/\ban?\s+half\b/g, "1/2"],
  // standalone fallbacks
  [/\bsixteenth\b/g, "1/16"],
  [/\beighth\b/g, "1/8"],
  [/\bquarter\b/g, "1/4"],
  [/\bhalf\b/g, "1/2"],
];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** Normalize spoken dimensions into a parseable "W by H location" string. */
export function normalizeDictation(raw: string): string {
  let s = (raw || "").toLowerCase().trim();
  if (!s) return "";

  // strip light punctuation, normalize hyphens ("twenty-three" -> "twenty three")
  s = s.replace(/[,;:!?"]/g, " ");
  s = s.replace(/-/g, " ");

  // unit / orientation noise
  s = s.replace(/\binches?\b/g, " ");
  s = s.replace(/\binch\b/g, " ");

  // separators: x, times, by all collapse to "by"
  s = s.replace(/\bx\b/g, " by ");
  s = s.replace(/\btimes\b/g, " by ");

  // labelled form: "width X height Y" -> "X by Y"
  s = s.replace(/\bwidth\b/g, " ");
  s = s.replace(/\bheight\b/g, " by ");
  s = s.replace(/\bwide\b/g, " ");
  s = s.replace(/\btall\b/g, " ");
  s = s.replace(/\bhigh\b/g, " ");

  // fraction phrases -> digit fractions
  for (const [re, rep] of FRACTION_PHRASES) s = s.replace(re, rep);

  // "twenty three" -> "23" (do compounds before standalone)
  for (const t of TENS) {
    for (const u of UNITS) {
      const v = NUMBER_WORDS[t] + NUMBER_WORDS[u];
      s = s.replace(new RegExp(`\\b${t}\\s+${u}\\b`, "g"), String(v));
    }
  }
  for (const w of Object.keys(NUMBER_WORDS)) {
    s = s.replace(new RegExp(`\\b${w}\\b`, "g"), String(NUMBER_WORDS[w]));
  }

  // "23 point 7 5" or "23 point 75" -> "23.75"
  s = s.replace(
    /(\d+)\s+point\s+(\d+(?:\s+\d+)*)/g,
    (_m, intp, dec) => intp + "." + String(dec).replace(/\s+/g, "")
  );

  // "and" used as connector ("23 and 3/4")
  s = s.replace(/\band\b/g, " ");

  return s.replace(/\s+/g, " ").trim();
}

/** Parse a single dimension token: "23 3/4", "3/4", "23.75", or "23". */
export function parseDimensionString(str: string): ParsedDimension | null {
  if (!str) return null;
  const s = str.trim();

  // mixed: "23 3/4"
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) {
    const whole = +m[1],
      num = +m[2],
      den = +m[3];
    if (den === 0) return null;
    return { decimal: whole + num / den, display: `${whole} ${num}/${den}`, kind: "fraction" };
  }
  // pure fraction: "3/4"
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) {
    const num = +m[1],
      den = +m[2];
    if (den === 0) return null;
    return { decimal: num / den, display: `${num}/${den}`, kind: "fraction" };
  }
  // decimal: "23.75"
  m = s.match(/^(\d+\.\d+)$/);
  if (m) return { decimal: +m[1], display: m[1], kind: "decimal" };
  // integer: "23"
  m = s.match(/^(\d+)$/);
  if (m) return { decimal: +m[1], display: m[1], kind: "integer" };

  return null;
}

export type DictationResult =
  | {
      ok: true;
      normalized: string;
      width: ParsedDimension;
      height: ParsedDimension;
      location: string;
    }
  | { ok: false; normalized: string; error: string };

/** Parse a full spoken/typed "W by H [location]" phrase. */
export function parseDictation(raw: string): DictationResult {
  const normalized = normalizeDictation(raw);
  if (!normalized) return { ok: false, normalized, error: "empty" };

  const parts = normalized.split(/\s+by\s+/);
  if (parts.length < 2) {
    return { ok: false, normalized, error: 'no "by" separator found' };
  }

  const width = parseDimensionString(parts[0].trim());

  // Peel a dimension off the front of the tail; the remainder is the location.
  const tail = parts[1].trim();
  const dimMatch = tail.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+)\b\s*(.*)$/);
  let height: ParsedDimension | null = null;
  let location = "";
  if (dimMatch) {
    height = parseDimensionString(dimMatch[1]);
    location = dimMatch[2].trim();
  } else {
    height = parseDimensionString(tail);
  }

  if (!width || !height) {
    return { ok: false, normalized, error: "could not parse one or both dimensions" };
  }
  if (width.decimal <= 0 || height.decimal <= 0) {
    return { ok: false, normalized, error: "dimension must be > 0" };
  }
  return { ok: true, normalized, width, height, location };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Format a decimal as a 1/16-rounded mixed fraction when it lands cleanly,
 * otherwise as a trimmed decimal: 21 -> "21", 38.75 -> "38 3/4", 3.5 -> "3 1/2".
 * Returns "" for null/non-finite so order-form cells stay blank.
 */
export function formatFraction(decimal: number | null | undefined): string {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return "";
  const sixteenths = Math.round(decimal * 16);
  if (Math.abs(sixteenths / 16 - decimal) < 0.0005) {
    const whole = Math.floor(sixteenths / 16);
    const num = sixteenths - whole * 16;
    if (num === 0) return String(whole);
    const g = gcd(num, 16);
    const frac = num / g + "/" + 16 / g;
    return whole === 0 ? frac : whole + " " + frac;
  }
  return decimal.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
