/**
 * New Surrey Cabinet Doors price book (revision 2026-05-08).
 *
 * Per-square-foot rates, looked up by category -> row (species/colour/style) ->
 * column (style/finish/board), plus an MDF applied-finish surcharge and stacking
 * add-ons. Seeded here for Reface Studio's order costing; P2 promotes this to an
 * editable, versioned Catalog table (`newsurrey_door_prices`) and points the
 * Estimator at it. Source: "Price ListII New surrey cabinet doors.pdf".
 *
 * The PDF is image-only, so figures come from the build memo, not text
 * extraction. One unverified detail is flagged inline (PVC 5th column).
 */
import type { OrderSettings } from "./types";

export const PRICE_BOOK_REVISION = "2026-05-08";

export type MaterialCategory = OrderSettings["materialCategory"];

/** A category's rate grid: `rows[i].rates[j]` aligns to `columns[j]`. null = N/A. */
export type PriceMatrix = {
  columns: string[];
  rows: { name: string; rates: (number | null)[] }[];
};

// --- Wood (species x style) -------------------------------------------------

const WOOD: PriceMatrix = {
  columns: [
    "Square Flat Panel 2¼",
    "Slim Shaker",
    "Flat Panel 3",
    "Square Raised Panel",
    "Square Mitre Panel",
    "Flat Mitre Panel",
    "Raised Slab",
  ],
  rows: [
    { name: "Maple Paint Grade", rates: [12.5, 13.5, 14.0, 13.5, 16.0, 17.0, 15.0] },
    { name: "Maple", rates: [13, 14, 16, 15.5, 17, 19, 15] },
    { name: "Knotty Alder", rates: [13, 14, 16, 15.5, 17, 19, 15] },
    { name: "Knotty Pine", rates: [13, 14, 16, 15.5, 17, 19, 15] },
    { name: "Flat Cut Red Oak", rates: [14, 15, 17, 16.5, 18, 20, 16] },
    { name: "Flat Cut Alder", rates: [15, 16, 18, 17.5, 19, 21, 17] },
    { name: "Flat Cut Cherry", rates: [18, 19, 20, 20.5, 22, 24, 20] },
    { name: "Flat Cut Mahogany", rates: [18, 19, 20, 20.5, 22, 24, 20] },
    { name: "Rift Cut Red Oak", rates: [20, 21, 20, 22.5, 24, 26, 22] },
    { name: "Flat Cut White Oak", rates: [20, 21, 20, 22.5, 24, 26, 22] },
    { name: "VG Fir", rates: [21, 22, 21, 23.5, 24, 26, 22] },
    { name: "Flat Cut Walnut", rates: [23, 24, 23, 25.5, 27, 29, 25] },
    { name: "Qtr Cut Walnut", rates: [24, 25, 24, 26.5, 28, 30, 26] },
    { name: "Rift Cut White Oak", rates: [24, 25, 24, 26.5, 28, 30, 26] },
  ],
};

// --- PVC (style x finish) ---------------------------------------------------
// NOTE: the source lists 5 price columns per row but named only 4 finishes;
// the 5th is a slab-only premium ($14). "Super Gloss" is an inferred label for
// that column — confirm against the supplier sheet when promoting to Catalog (P2).
const PVC: PriceMatrix = {
  columns: ["Solid Matte", "Flat Grain", "Authentic Grain", "High Gloss", "Super Gloss"],
  rows: [
    { name: "Slab", rates: [9.5, 10, 10.5, 11, 14] },
    { name: "Raised Round Corner", rates: [10.75, 11.25, 11.75, 12.25, null] },
    { name: "Raised Square Corner", rates: [10.75, 11.25, 11.75, 12.25, null] },
    { name: "Shaker", rates: [12, 12.5, 13, 13.5, null] },
    { name: "Parklane Shaker", rates: [13, 13.5, 14, 14.5, null] },
    { name: "V Groove on Panel", rates: [13, 13.5, 14, 14.5, null] },
    { name: "Valance", rates: [21, 22, 23, 24, null] },
  ],
};

// --- MDF (style x board) ----------------------------------------------------

const MDF: PriceMatrix = {
  columns: ["MDF", "MDF-MLM"],
  rows: [
    { name: "Slab", rates: [7.5, 8] },
    { name: "Raised Round Corner", rates: [8, 8.5] },
    { name: "Raised Square Corner", rates: [8, 8.5] },
    { name: "Shaker", rates: [10.25, 11] },
    { name: "Parklane Shaker", rates: [11.25, 11.25] },
    { name: "V Groove", rates: [11.25, 11.25] },
    { name: "Valance", rates: [20.5, 20.5] },
  ],
};

/** MDF applied-finish surcharge, per sqft, added on top of the base rate. */
export const MDF_FINISH_SURCHARGE: Record<string, number> = {
  Primer: 7,
  "Clear Lacquer": 7,
  "White Paint": 11,
  "Dark Paint": 11,
  Stain: 10,
};

// --- Acrylic (colour; Slab + O/F priced the same) ---------------------------

const ACRYLIC: PriceMatrix = {
  columns: ["Slab + O/F"],
  rows: [
    { name: "P-601", rates: [11] },
    { name: "P-6016", rates: [11] },
    { name: "P-734", rates: [11] },
    { name: "P-729", rates: [11] },
    { name: "P-723", rates: [11] },
    { name: "A-8015", rates: [13] },
    { name: "A-8112", rates: [13] },
  ],
};

// --- 5-Piece Melamine (colour x style) --------------------------------------

const MELAMINE: PriceMatrix = {
  columns: ["Slab", "Slim Shaker", "2¼ Shaker"],
  rows: [
    { name: "Fashionista", rates: [12, 17, 19] },
    { name: "First Class", rates: [12, 17, 19] },
    { name: "Rhapsody", rates: [12, 17, 19] },
    { name: "The Chameleon", rates: [12, 17, 19] },
    { name: "Sheer Beauty", rates: [12, 17, 19] },
    { name: "Free Spirit", rates: [12, 17, 19] },
    { name: "Kiss Curl", rates: [12, 17, 19] },
  ],
};

export type PriceBook = {
  revision: string;
  matrices: Record<MaterialCategory, PriceMatrix>;
  mdfFinishSurcharge: Record<string, number>;
  addOns: {
    /** Per-sqft add-ons that stack onto the base rate. */
    hingeHoles: number;
    parklane: number;
    extraGroove: number;
    outsideProfile: number;
    /** Counted add-ons. */
    mullionPerSection: number;
    dividerEach: number;
  };
};

export const NEW_SURREY_PRICE_BOOK: PriceBook = {
  revision: PRICE_BOOK_REVISION,
  matrices: { wood: WOOD, pvc: PVC, mdf: MDF, acrylic: ACRYLIC, melamine: MELAMINE },
  mdfFinishSurcharge: MDF_FINISH_SURCHARGE,
  addOns: {
    hingeHoles: 1,
    parklane: 1,
    extraGroove: 1,
    outsideProfile: 0.5,
    mullionPerSection: 8,
    dividerEach: 10,
  },
};

// ---------------------------------------------------------------------------
// Accessors for building dropdowns + resolving a base rate
// ---------------------------------------------------------------------------

/** Human label for a category's row dimension (what the rows represent). */
export const CATEGORY_ROW_LABEL: Record<MaterialCategory, string> = {
  wood: "Species",
  pvc: "Style",
  mdf: "Style",
  acrylic: "Colour",
  melamine: "Colour",
};

/** Human label for a category's column dimension. */
export const CATEGORY_COLUMN_LABEL: Record<MaterialCategory, string> = {
  wood: "Style",
  pvc: "Finish",
  mdf: "Board",
  acrylic: "Style",
  melamine: "Style",
};

export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  wood: "Wood",
  pvc: "PVC",
  mdf: "MDF",
  acrylic: "Acrylic",
  melamine: "5-Piece Melamine",
};

export function rowOptions(category: MaterialCategory): string[] {
  return NEW_SURREY_PRICE_BOOK.matrices[category].rows.map((r) => r.name);
}

export function columnOptions(category: MaterialCategory): string[] {
  return NEW_SURREY_PRICE_BOOK.matrices[category].columns;
}

/**
 * Map an {@link OrderSettings} to the (rowName, columnName) pair that addresses
 * its category's matrix. Wood is species x style; PVC/MDF are style x finish/board;
 * acrylic/melamine are colour x style.
 */
export function priceKey(
  s: Pick<OrderSettings, "materialCategory" | "woodSpecies" | "doorStyle" | "materialFinish">
): {
  rowName: string;
  columnName: string;
} {
  switch (s.materialCategory) {
    case "wood":
      return { rowName: s.woodSpecies, columnName: s.doorStyle };
    case "pvc":
    case "mdf":
      return { rowName: s.doorStyle, columnName: s.materialFinish };
    case "acrylic":
      return { rowName: s.woodSpecies, columnName: columnOptions("acrylic")[0] };
    case "melamine":
      return { rowName: s.woodSpecies, columnName: s.doorStyle };
  }
}

/** Base per-sqft rate for the given settings, or null if the cell isn't priced. */
export function lookupBaseRate(
  s: Pick<OrderSettings, "materialCategory" | "woodSpecies" | "doorStyle" | "materialFinish">
): number | null {
  const matrix = NEW_SURREY_PRICE_BOOK.matrices[s.materialCategory];
  const { rowName, columnName } = priceKey(s);
  const row = matrix.rows.find((r) => r.name === rowName);
  if (!row) return null;
  const col = matrix.columns.indexOf(columnName);
  if (col < 0) return null;
  return row.rates[col] ?? null;
}
