/**
 * Reface Studio domain types.
 *
 * A {@link RefaceProject} holds many {@link RefacePhoto}s; each photo holds many
 * {@link RefaceElement}s (doors / drawer fronts / end panels / toe kicks) pinned
 * onto it. Confirmed per-element width x height drive square footage and the
 * New Surrey door-order cost. See features/reface/CLAUDE.md.
 */

export type ElementKind = "door" | "drawer" | "end_panel" | "toe_kick";

export const ELEMENT_KINDS: ElementKind[] = ["door", "drawer", "end_panel", "toe_kick"];

export const ELEMENT_KIND_LABELS: Record<ElementKind, string> = {
  door: "Door",
  drawer: "Drawer front",
  end_panel: "End panel",
  toe_kick: "Toe kick",
};

/** Ref-code prefix shown on the pin and in exports: D1, DR1, EP1, TK1. */
export const ELEMENT_KIND_PREFIX: Record<ElementKind, string> = {
  door: "D",
  drawer: "DR",
  end_panel: "EP",
  toe_kick: "TK",
};

/** Normalized 0..1 bounding box of the photo, for pin placement. */
export type ElementBox = { x: number; y: number; w: number; h: number };

export type HingeSlot = "top" | "middle" | "bottom";

export type RefaceElement = {
  id: string;
  photoId: string;
  kind: ElementKind;
  /** Auto ref code: D1, DR1, EP1, TK1. */
  label: string;
  /** Free-text, e.g. "sink base" (ported from door-sizer "location"). */
  location: string;
  /** Real inches, confirmed by Andrew. Null until set. */
  widthIn: number | null;
  heightIn: number | null;
  qty: number;
  /** Normalized box from AI detect / tap position; null = no pin coords yet. */
  box: ElementBox | null;
  /** True until confirmed; drives the unconfirmed badge. */
  aiGuess: boolean;
  /** Counted add-ons (New Surrey): $8/section, $10/each. */
  mullionSections: number;
  dividers: number;
  notes: string;
  // Forward seams for the door-sizer roadmap (unused in Phase 1).
  style?: string;
  material?: string;
  hinges?: HingeSlot[];
  hingePositions?: Partial<Record<HingeSlot, number>>;
  sort: number;
  createdAt: string;
};

export type RefacePhoto = {
  id: string;
  projectId: string;
  /** Path within the private reface-photos Storage bucket. */
  storagePath: string;
  /** Natural pixel dims, for normalized pin-box math. */
  width: number;
  height: number;
  sort: number;
  createdAt: string;
  elements: RefaceElement[];
};

export type GrainDirection = "vertical" | "horizontal" | null;

/** Project-level product spec -> order-form header + New Surrey price lookup. */
export type OrderSettings = {
  materialCategory: "wood" | "pvc" | "mdf" | "acrylic" | "melamine";
  /** Species (wood) or colour/option for the other categories. */
  woodSpecies: string;
  /** Door style = the price-book column, e.g. "Slim Shaker". */
  doorStyle: string;
  /** PVC/MDF sub-finish column (e.g. "Solid Matte", "MDF MLM"). */
  materialFinish: string;
  modelNo: string;
  stileSize: string;
  railSize: string;
  insideProfile: string;
  outsideProfile: string;
  panelProfile: string;
  /** Applied finish (MDF surcharge lookup): Primer / White Paint / Stain ... */
  finish: string;
  doorGrain: GrainDirection;
  drawerGrain: GrainDirection;
  hingeBoring: {
    hingeHole: string;
    holeCenter: string;
    edge: string;
    pilotHoleSize: string;
  };
  /** Per-sqft add-ons that stack onto the base rate. */
  addOns: {
    hingeHoles: boolean;
    parklane: boolean;
    extraGroove: boolean;
    outsideProfileAddon: boolean;
  };
  /** From the linked Job/Contact when present; editable here too. */
  customerPO: string;
  /** Manual courier (Dan Foss / Ace) quote, billed by weight. */
  shippingCost: number;
};

export function defaultOrderSettings(): OrderSettings {
  return {
    materialCategory: "wood",
    woodSpecies: "",
    doorStyle: "",
    materialFinish: "",
    modelNo: "",
    stileSize: "",
    railSize: "",
    insideProfile: "",
    outsideProfile: "",
    panelProfile: "",
    finish: "",
    doorGrain: null,
    drawerGrain: null,
    hingeBoring: { hingeHole: "", holeCenter: "", edge: "", pilotHoleSize: "3MM / 8MM" },
    addOns: {
      hingeHoles: false,
      parklane: false,
      extraGroove: false,
      outsideProfileAddon: false,
    },
    customerPO: "",
    shippingCost: 0,
  };
}

export type RefaceProject = {
  id: string;
  name: string;
  /** Optional link to public.jobs(id); fills the order-form customer info. */
  jobId: string | null;
  orderSettings: OrderSettings;
  notes: string;
  createdAt: string;
  updatedAt: string;
  photos: RefacePhoto[];
};

/**
 * Shape Claude Code emits when auto-detecting elements off a photo. Ingested by
 * importElements.ts onto a given photo with aiGuess=true + assigned ref labels.
 */
export type DetectedElement = {
  kind: ElementKind;
  box: ElementBox;
  estWidthIn?: number | null;
  estHeightIn?: number | null;
  location?: string;
};
