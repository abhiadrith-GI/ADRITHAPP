/**
 * Electrical material reference, by room. Unlike plumbing, every room
 * type has real content here - traces to the researched wire-gauge and
 * room-point-count conventions, not invented here.
 */

export const ELECTRICAL_ROOM_TYPES = [
  "Bedroom",
  "Kitchen",
  "Hall / Living Room",
  "Study Room",
  "Balcony",
  "Bathroom / Toilet",
  "Utility / Wash Area",
  "Dining Area",
] as const;
export type ElectricalRoomType = (typeof ELECTRICAL_ROOM_TYPES)[number];

export type ElectricalPointReference = {
  name: string;
  description: string;
  wireGauge: string;
  wireNote: string;
  typicalCount: string;
};

export const ELECTRICAL_POINTS: Record<ElectricalRoomType, ElectricalPointReference[]> = {
  Bedroom: [
    { name: "Light points", description: "Ceiling and/or wall lights.", wireGauge: "1.5 sq mm", wireNote: "Standard for all lighting circuits.", typicalCount: "2–3, depending on room size" },
    { name: "Fan point", description: "Ceiling fan.", wireGauge: "1.5 sq mm", wireNote: "Same circuit as lighting.", typicalCount: "1" },
    { name: "AC point", description: "Dedicated circuit for a split AC unit — never shared with general sockets.", wireGauge: "2.5 sq mm (up to 1.5 ton), 4 sq mm (2 ton+)", wireNote: "16A dedicated MCB.", typicalCount: "1" },
    { name: "Regular sockets", description: "General-purpose power points — charging, lamps, etc.", wireGauge: "2.5 sq mm", wireNote: "16A circuit.", typicalCount: "2–5" },
    { name: "Bedside points", description: "Switch and socket on each side of the bed.", wireGauge: "1.5 sq mm (switch), 2.5 sq mm (socket)", wireNote: "", typicalCount: "1 per bedside" },
  ],
  Kitchen: [
    { name: "Light points", description: "General kitchen lighting, plus under-cabinet task lighting if specified.", wireGauge: "1.5 sq mm", wireNote: "Kitchens need more lumens than a bedroom — see illumination note.", typicalCount: "2–4" },
    { name: "Chimney point", description: "Dedicated point for the kitchen chimney/hood.", wireGauge: "2.5 sq mm", wireNote: "5A with its own switch.", typicalCount: "1" },
    { name: "Heat-generating appliance points", description: "Microwave, OTG, toaster, sandwich maker — anything that generates real heat.", wireGauge: "2.5 sq mm minimum", wireNote: "15A, dedicated — never shared with light-load points.", typicalCount: "2–4" },
    { name: "Light-load appliance points", description: "Mixer-grinder, hand blender, coffee maker.", wireGauge: "2.5 sq mm", wireNote: "5A.", typicalCount: "2–3" },
    { name: "Refrigerator point", description: "A dedicated, always-on point — not switched with general kitchen power.", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "1" },
    { name: "RO/water purifier point", description: "A shared plumbing/electrical point — coordinate with the plumbing supply point.", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "1" },
  ],
  "Hall / Living Room": [
    { name: "Light points", description: "General and accent lighting.", wireGauge: "1.5 sq mm", wireNote: "", typicalCount: "3–6, depending on room size" },
    { name: "Fan point(s)", description: "", wireGauge: "1.5 sq mm", wireNote: "", typicalCount: "1–2" },
    { name: "AC point", description: "", wireGauge: "2.5–4 sq mm", wireNote: "Dedicated circuit, sized by tonnage.", typicalCount: "1" },
    { name: "TV/entertainment point", description: "Includes any set-top box, sound system, or gaming console power needs nearby.", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "1 point, often multiple sockets" },
    { name: "General sockets", description: "", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "3–6" },
  ],
  "Study Room": [
    { name: "Light points", description: "Task lighting for a desk matters more here than general ambient light.", wireGauge: "1.5 sq mm", wireNote: "", typicalCount: "1–2" },
    { name: "Desk/data sockets", description: "Computer, monitor, router — worth a few extra sockets here for equipment.", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "3–4" },
    { name: "AC point", description: "", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "0–1, if the room has AC" },
  ],
  Balcony: [
    { name: "Light point", description: "Weatherproof-rated fitting, since it's exposed.", wireGauge: "1.5 sq mm", wireNote: "IP-rated fitting required, not standard indoor grade.", typicalCount: "1" },
    { name: "Socket", description: "For outdoor appliances, cleaning equipment, or seasonal lighting.", wireGauge: "2.5 sq mm", wireNote: "Weatherproof cover required.", typicalCount: "0–1" },
  ],
  "Bathroom / Toilet": [
    { name: "Light point", description: "Switch must be outside the bathroom door — never inside.", wireGauge: "1.5 sq mm", wireNote: "The most consistently repeated bathroom electrical rule.", typicalCount: "1" },
    { name: "Exhaust fan point", description: "May be controlled inside, kept well clear of the shower/wet zone.", wireGauge: "1.5 sq mm", wireNote: "", typicalCount: "1" },
    { name: "Geyser point", description: "Isolator switch outside the bathroom, or a clearly separated isolator if placed inside.", wireGauge: "4 sq mm", wireNote: "Geysers are a genuine heavy load — never share this circuit with lighting.", typicalCount: "1" },
    { name: "Shaver socket", description: "The one general-purpose socket type conventionally allowed inside a bathroom, IP44-rated minimum.", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "0–1" },
  ],
  "Utility / Wash Area": [
    { name: "Washing machine point", description: "A genuine plumbing/electrical shared point — align with the plumbing bib on the same elevation sheet.", wireGauge: "2.5 sq mm", wireNote: "16A dedicated.", typicalCount: "1" },
    { name: "General light/switch", description: "", wireGauge: "1.5 sq mm", wireNote: "", typicalCount: "1" },
  ],
  "Dining Area": [
    { name: "Light point", description: "Often a pendant or decorative fixture over the table specifically.", wireGauge: "1.5 sq mm", wireNote: "", typicalCount: "1" },
    { name: "Sockets", description: "For a hot-case, kettle, or occasional-use appliances at the table.", wireGauge: "2.5 sq mm", wireNote: "", typicalCount: "2–4" },
  ],
};

export const ELECTRICAL_MATERIAL_NOTES: Record<string, string> = {
  "1.5 sq mm wire": "The standard cable size for every lighting and fan circuit in an Indian home — carries up to 10–14A safely. Using anything thicker here just adds cost with no real benefit.",
  "2.5 sq mm wire": "The standard for power socket circuits — refrigerators, washing machines, microwaves, and similar everyday loads, each on their own 16A circuit.",
  "4 sq mm wire": "For genuinely heavy loads — 2-ton+ ACs, geysers, instant water heaters. Undersizing here is a real fire risk, not just an inconvenience.",
  "20mm conduit": "Pairs with 1.5 sq mm lighting cable.",
  "25mm conduit": "Pairs with 2.5 sq mm power cable — increasingly used as the default even for lighting runs, to leave room for future additions without breaking open a wall again.",
};

export const ELECTRICAL_POINT_DEFINITION =
  "In Indian electrical trade practice, one 'point' means one switch, one socket, one fan point, or one light point — a standard, real unit of counting, the same term a shop owner or electrician will already use.";
