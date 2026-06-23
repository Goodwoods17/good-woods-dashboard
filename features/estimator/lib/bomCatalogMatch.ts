// Match a Mozaik BOM line to a catalog item by name (ADR 0012 Slice 2 follow-on).
// Mozaik gives us material/hardware names + quantities; the app owns the money,
// so we match each BOM line to the catalog to pull a real unit price (+ supplier
// + catalogId for the price-history hook). Unmatched lines surface on the review
// screen and land at $0 for manual pricing — never a silent guess.
//
// Pure + deterministic so it can be unit-tested and reused by the modal (display)
// and the apply step (set prices).

import type { MozaikBomLine } from "./mozaikImport";

export type CatalogLite = {
  id: string;
  name: string;
  unit: string; // estimator Unit ("ea" | "sqft" | "lf" | ...)
  unitPrice: number; // surfaced price
  supplier?: string;
};

export type MatchConfidence = "exact" | "fuzzy" | "none";

export type BomMatch = {
  line: MozaikBomLine;
  match: CatalogLite | null;
  confidence: MatchConfidence;
  score: number; // 0..1
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(s: string): Set<string> {
  // Drop 1-char tokens (the "5"/"8" in 5/8, lone letters) — they add noise.
  return new Set(norm(s).split(" ").filter((t) => t.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter++;
  });
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

// Similarity 0..1 between a BOM name and a catalog name. Exact normalized match
// = 1; whole-string containment is boosted (a short catalog name inside a long
// Mozaik description, or vice-versa); otherwise token Jaccard.
export function nameSimilarity(bomName: string, catName: string): number {
  const a = norm(bomName);
  const b = norm(catName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let score = jaccard(tokenSet(bomName), tokenSet(catName));
  if (a.includes(b) || b.includes(a)) score = Math.max(score, 0.85);
  return score;
}

const FUZZY_THRESHOLD = 0.5;

export function matchBomLine(line: MozaikBomLine, catalog: CatalogLite[]): BomMatch {
  let best: CatalogLite | null = null;
  let bestScore = 0;
  for (const c of catalog) {
    const s = nameSimilarity(line.name, c.name);
    // Tie-break toward a catalog item whose unit matches the line's mapped unit.
    const adjusted = s + (unitsAgree(line.unit, c.unit) ? 0.001 : 0);
    if (adjusted > bestScore) {
      bestScore = adjusted;
      best = c;
    }
  }
  const score = best ? nameSimilarity(line.name, best.name) : 0;
  let confidence: MatchConfidence = "none";
  if (score >= 1) confidence = "exact";
  else if (score >= FUZZY_THRESHOLD) confidence = "fuzzy";
  return {
    line,
    match: confidence === "none" ? null : best,
    confidence,
    score: Math.round(score * 100) / 100,
  };
}

export function matchBomToCatalog(
  bom: MozaikBomLine[],
  catalog: CatalogLite[],
): BomMatch[] {
  return bom.map((line) => matchBomLine(line, catalog));
}

// Loose unit agreement between a Mozaik unit (#/SqFt/Ft) and a catalog Unit.
function unitsAgree(mozaikUnit: string, catalogUnit: string): boolean {
  const m = mozaikUnit.trim().toLowerCase();
  const c = catalogUnit.trim().toLowerCase();
  if ((m === "#" || m === "ea") && c === "ea") return true;
  if (m === "sqft" && c === "sqft") return true;
  if (m === "ft" && (c === "lf" || c === "ft")) return true;
  return false;
}
