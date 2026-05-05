export type SOP = {
  id: string;
  title: string;
  category: "shop" | "finishing" | "install" | "office";
  summary: string;
  estTime: string;
  steps: string[];
  pitfalls: string[];
};

export const SOPS: SOP[] = [
  {
    id: "sop-cutlist",
    title: "Cut list prep",
    category: "shop",
    summary: "Translate Mozaik / hand-drawn plans into a cut list ready for the saw.",
    estTime: "30–60 min per kitchen",
    steps: [
      "Pull the latest design files (Mozaik export or PDF drawing set).",
      "Confirm material call-outs: species, thickness, edgebanding required.",
      "Enter every box panel (sides, top, bottom, back, shelves) into the cut-list spreadsheet.",
      "Group by sheet good — group identical panels first to maximise yield.",
      "Print labels with: cabinet # / part / dimensions / grain direction.",
      "Cross-check with hardware list: drawer slides, hinge plates, shelf pins.",
    ],
    pitfalls: [
      "Forgetting grain orientation on doors and exposed sides.",
      "Mixing 18mm and 19mm — confirm thickness on first sheet before cutting.",
      "Skipping the back panel groove — easier to add at the saw than to fix later.",
    ],
  },
  {
    id: "sop-drawer-box",
    title: "Drawer box build",
    category: "shop",
    summary: "Standard Baltic birch drawer box, dovetailed or rabbeted.",
    estTime: "20 min/box once tooling is dialled",
    steps: [
      "Cut sides, fronts, backs to spec — confirm slide allowance (0.5\" each side standard).",
      "Cut bottom 6mm Baltic birch panel, 12mm under top of bottom rabbet.",
      "Sand interior surfaces before assembly — easier than after.",
      "Assemble dry, check square diagonally, then glue.",
      "Pin or staple corners while glue cures.",
      "Final sand outside corners, ease all edges.",
    ],
    pitfalls: [
      "Out-of-square box — tap the long diagonal corner during glue-up.",
      "Bottom too tight — should slide in with light friction, not force.",
    ],
  },
  {
    id: "sop-spray-booth",
    title: "Spray booth setup",
    category: "finishing",
    summary: "Pre-flight checklist for a 2K poly spray session.",
    estTime: "15 min setup",
    steps: [
      "Check booth filters — replace if loaded.",
      "Confirm air supply pressure: 40 psi at gun for 2K poly.",
      "Mix part A + B at manufacturer-specified ratio (typically 10:1 by volume).",
      "Strain catalysed product through 190-micron filter into gun cup.",
      "Tack off all surfaces before first coat.",
      "First coat: thin, uniform, no runs. Wait flash time per data sheet.",
      "Sand between coats with 320 grit, tack again.",
      "Final coat: full wet film, even sheen.",
    ],
    pitfalls: [
      "Mixed product has a 4-hour pot life — don't over-mix at start of session.",
      "Cold booth (below 18°C) extends cure massively. Heat first.",
      "Skipping the strainer = fish-eyes and trash in the finish.",
    ],
  },
  {
    id: "sop-install-preflight",
    title: "Install pre-flight",
    category: "install",
    summary: "On-site readiness check before unloading the truck.",
    estTime: "10 min on arrival",
    steps: [
      "Confirm site access: parking, elevator, door codes, building hours.",
      "Walk the space — laser-level the walls and floor, mark high points.",
      "Check plumbing + electrical rough-in is in the expected place.",
      "Locate any drywall patches or floor protection needed.",
      "Stage cabinets in install order, not unload order.",
      "Pull hardware kits per cabinet — pre-bag with cabinet number.",
    ],
    pitfalls: [
      "Floor more than 1/2\" out of level over a run — shim plan needs adjusting.",
      "Wall studs not where drawings show — bring extra blocking material.",
      "Site contact not on-site — confirm by text before leaving the shop.",
    ],
  },
  {
    id: "sop-invoicing",
    title: "Invoicing & milestone payments",
    category: "office",
    summary: "When and how to bill across a multi-phase project.",
    estTime: "15 min per invoice",
    steps: [
      "Confirm milestone is complete (cabinet boxes built / delivered / installed).",
      "Open the job in the dashboard, Costs tab — review revenue + costs are current.",
      "Click Export Invoice PDF, save to Drive/Spacecraft/Invoices/.",
      "Email PDF to client with one-line summary of what's billed and what's next.",
      "Update job's invoice tracker with date sent.",
      "Set a 14-day follow-up reminder if no payment received.",
    ],
    pitfalls: [
      "Billing before milestone is done — kills trust.",
      "Forgetting to update the invoice tracker — leads to double-billing or missed reminders.",
    ],
  },
];

export function getSOP(id: string): SOP | undefined {
  return SOPS.find((s) => s.id === id);
}
