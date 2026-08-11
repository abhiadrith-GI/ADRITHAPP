/**
 * Plumbing material reference, by room and fixture. Traces to the
 * researched pipe-type and diameter conventions (see the research
 * reference document) - not invented here. Per research: plumbing has
 * real content only in wet rooms - Bathroom/Toilet, Kitchen, Utility.
 * A bedroom or hall genuinely has nothing to calculate here.
 */

export const PLUMBING_ROOM_TYPES = ["Bathroom / Toilet", "Kitchen", "Utility / Wash Area"] as const;
export type PlumbingRoomType = (typeof PLUMBING_ROOM_TYPES)[number];

export type FixtureReference = {
  name: string;
  description: string;
  supplyPipe?: { type: string; diameter: string; note: string };
  drainPipe?: { type: string; diameter: string; note: string };
  components: string[];
};

export const PLUMBING_FIXTURES: Record<PlumbingRoomType, FixtureReference[]> = {
  "Bathroom / Toilet": [
    {
      name: "WC (Western-style)",
      description:
        "The toilet itself. Connects to a supply line for the flush and a drain line to carry waste away — the drain size here is set by code, not just convention.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "Cold water only, for the flush tank/cistern." },
      drainPipe: { type: "SWR", diameter: "100–110mm (4\")", note: "Per NBC and IS 1742 — a real code figure, not a site convention." },
      components: ["WC pan", "Cistern (or concealed tank if wall-hung)", "Seat cover", "Angle valve for the supply line", "Flexible connector hose"],
    },
    {
      name: "Health faucet",
      description: "The hand-held spray next to the WC, on its own supply line separate from the WC's own flush supply.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "Same level as the WC supply point." },
      components: ["Angle valve", "Health faucet spray gun", "Flexible braided hose", "Wall hook/holder"],
    },
    {
      name: "Wash basin",
      description: "The bathroom sink. Needs both hot and cold supply if a mixer is used, or cold only for a single tap.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "One line each for hot and cold if a mixer is specified." },
      drainPipe: { type: "SWR", diameter: "32–40mm", note: "" },
      components: ["Basin", "Pedestal or wall-mount bracket", "Angle valves (one per supply line)", "P-trap or bottle trap", "Waste coupling"],
    },
    {
      name: "Shower",
      description: "Includes the mixer valve, the overhead or hand shower itself, and the connecting pipework between them.",
      supplyPipe: { type: "CPVC", diameter: "15–20mm", note: "Hot and cold lines to the mixer body." },
      drainPipe: { type: "SWR", diameter: "40–50mm", note: "" },
      components: ["Shower mixer/diverter valve", "Overhead shower head or hand shower with slide rail", "Connecting pipe from mixer to shower head", "Shower drain trap"],
    },
    {
      name: "Geyser (water heater)",
      description: "Connects to the cold supply on the inlet side and feeds hot water out to the mixer/tap it serves. The unit itself is electrical, but its plumbing connection belongs here.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "Inlet (cold) and outlet (hot) connections." },
      components: ["Geyser unit", "Inlet/outlet connector kit", "Pressure relief valve (usually supplied with the unit)"],
    },
  ],
  Kitchen: [
    {
      name: "Kitchen sink",
      description: "The main kitchen wash point — supply for the tap, drain to carry waste water away.",
      supplyPipe: { type: "CPVC", diameter: "15–20mm", note: "Hot and cold if a mixer tap is used." },
      drainPipe: { type: "SWR", diameter: "40mm", note: "" },
      components: ["Sink (single or double bowl)", "Mixer or single tap", "Angle valves", "P-trap", "Waste coupling"],
    },
    {
      name: "RO / water purifier",
      description: "A dedicated supply tap plus a separate drain line for the reject water the purification process produces.",
      supplyPipe: { type: "CPVC", diameter: "12–15mm", note: "A dedicated small-bore line, separate from the main sink supply." },
      drainPipe: { type: "Flexible tube", diameter: "6–8mm", note: "For the reject-water line specifically, not standard drain pipe." },
      components: ["RO unit", "Dedicated angle valve/tap", "Reject-water drain tube", "TDS/tap fitting kit (usually supplied with the unit)"],
    },
    {
      name: "Dishwasher",
      description: "Needs its own supply and drain connection, usually run alongside the sink's own plumbing.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "" },
      drainPipe: { type: "SWR", diameter: "40mm", note: "Often shares the sink's own drain line." },
      components: ["Supply hose connector", "Drain hose connector"],
    },
  ],
  "Utility / Wash Area": [
    {
      name: "Washing machine",
      description: "A supply bib for the inlet hose, and a standpipe for the machine to drain into.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "Set higher than a typical bathroom bib — see the Standard Heights reference." },
      drainPipe: { type: "SWR", diameter: "40mm", note: "Standpipe, not a floor drain — the machine's own hose sits inside it." },
      components: ["Bib cock", "Standpipe with trap"],
    },
    {
      name: "Wash-stone / dhobi ghat",
      description: "A lower secondary sink for hand-washing clothes.",
      supplyPipe: { type: "CPVC", diameter: "15mm (½\")", note: "" },
      drainPipe: { type: "SWR", diameter: "40mm", note: "" },
      components: ["Wash-stone basin", "Tap", "Drain trap"],
    },
  ],
};

export const PLUMBING_MATERIAL_NOTES: Record<string, string> = {
  CPVC: "Used for hot and cold water supply lines. Handles temperatures up to 93°C without softening — the standard modern choice for supply pipe, mostly replacing older GI (galvanised iron) pipe.",
  UPVC: "A more rigid version of PVC, used for cold supply and for buried/underground runs where extra structural strength matters.",
  SWR: "Soil, Waste & Rain pipe — the standard for internal above-ground drainage. Different from the supply pipe material because drainage doesn't need to handle pressure the way a supply line does.",
  HDPE: "Used for buried water mains and underground supply runs specifically — not typically seen inside a finished room.",
};
