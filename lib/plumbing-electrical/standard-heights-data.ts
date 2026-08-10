/**
 * Standard plumbing and electrical installation heights - browsable
 * reference data, not calculation logic. Every entry traces to the two
 * research passes already done (see the reference documents from that
 * research) - nothing here is invented for this file.
 *
 * `keywords` exists specifically so search matches how people actually
 * talk, not just the technical term in `name` - someone typing "toilet"
 * should find the WC entries, someone typing "geyser" should find the
 * water heater entry, even though those aren't the row's own title.
 */

export type HeightEntry = {
  trade: "plumbing" | "electrical";
  section: string;
  name: string;
  mm: string;
  imperial: string;
  notes: string;
  /** Only set when a figure isn't traceable to a specific IS code - honesty over false precision. */
  flag?: "CONVENTION";
  keywords: string;
};

export const HEIGHT_ENTRIES: HeightEntry[] = [
  // ===== PLUMBING — TOILET / BATHROOM =====
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Wash basin (rim)", mm: "750–850mm", imperial: "2'5½\"–2'9½\"", notes: "IS 2556 Part 4.", keywords: "basin sink wash rim" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Wall tap above basin rim", mm: "+100–120mm", imperial: "+4\"–4½\"", notes: "Above the rim, to avoid splash.", keywords: "tap basin" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "WC seat (wall-hung)", mm: "380–420mm", imperial: "1'3\"–1'4½\"", notes: "Adjustable at frame installation.", keywords: "wc toilet commode seat wall hung" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "WC / bib cock supply point", mm: "230–305mm", imperial: "9\"–12\"", notes: "", keywords: "wc toilet commode bib cock supply" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Health faucet angle valve", mm: "230–305mm, commonly 250mm", imperial: "9\"–12\", commonly 10\"", notes: "Per IS 2064. Same level as WC supply point.", keywords: "health faucet bidet angle valve jet spray" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Health faucet holder/hook", mm: "610–685mm", imperial: "2'0\"–2'3\"", notes: "A separate fitting from the valve above.", keywords: "health faucet holder hook" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Concealed flush valve (push button)", mm: "915–990mm", imperial: "3'0\"–3'3\"", notes: "", keywords: "flush valve push button" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Concealed cistern flush plate", mm: "900–1000mm", imperial: "2'11½\"–3'3½\"", notes: "Set by the WC frame manufacturer's jig.", keywords: "flush plate cistern concealed" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Single-lever wall mixer", mm: "~813mm", imperial: "32\"", notes: "To lever centre.", keywords: "wall mixer lever" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Wall mixer spout", mm: "535–560mm", imperial: "21\"–22\"", notes: "To the plumbing outlet.", keywords: "wall mixer spout" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Overhead rain shower head", mm: "1900mm+ (men)", imperial: "6'3\"+", notes: "IS 2064 varies by user group.", keywords: "shower overhead rain head" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Wall-projected shower head", mm: "Max 2200mm, max 450mm projection", imperial: "Max 7'2½\", max 1'5½\" out", notes: "", keywords: "shower wall projected" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Shower rod", mm: "1980–2055mm", imperial: "6'6\"–6'9\"", notes: "", keywords: "shower rod curtain" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Fixed overhead shower", mm: "1830–1905mm", imperial: "6'0\"–6'3\"", notes: "", keywords: "shower fixed overhead" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Shower mixer/valve", mm: "~1000mm", imperial: "~3'3½\"", notes: "Near shower entrance, not centred.", keywords: "shower mixer valve diverter" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Geyser", mm: "1800mm", imperial: "5'11\"", notes: "300mm ceiling clearance needed for servicing.", keywords: "geyser water heater" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Towel rail", mm: "1200mm (1100mm near splash zone)", imperial: "3'11\" (3'7½\")", notes: "", keywords: "towel rail" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Mirror (bottom edge)", mm: "1100–1200mm", imperial: "3'7½\"–3'11\"", notes: "", keywords: "mirror" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Hot/cold spacing — shower", mm: "150mm c-c", imperial: "6\"", notes: "Hot on left.", keywords: "hot cold spacing shower" },
  { trade: "plumbing", section: "Toilet / Bathroom", name: "Hot/cold spacing — basin", mm: "200mm c-c", imperial: "8\"", notes: "Hot on left.", keywords: "hot cold spacing basin" },
  // ===== PLUMBING — ROOM SIZES =====
  { trade: "plumbing", section: "Room Sizes & Clearances", name: "Minimum full bathroom (WC+basin+shower)", mm: "~2130 x 1220mm", imperial: "7' x 4'", notes: "3'x4' shower + 4'x4' WC/basin zone.", keywords: "bathroom size minimum room" },
  { trade: "plumbing", section: "Room Sizes & Clearances", name: "Minimum powder room (WC+basin only)", mm: "~1525 x 1220mm", imperial: "5' x 4'", notes: "", keywords: "powder room minimum" },
  { trade: "plumbing", section: "Room Sizes & Clearances", name: "Absolute minimum room width", mm: "900mm", imperial: "3'0\"", notes: "Below this, fixtures won't fit with movement space.", keywords: "minimum width room" },
  { trade: "plumbing", section: "Room Sizes & Clearances", name: "WC — wall width to allocate", mm: "900mm min, 1015mm comfortable", imperial: "3'0\" min, 3'4\" comfortable", notes: "15in clear each side of centreline.", keywords: "wc width allocate" },
  { trade: "plumbing", section: "Room Sizes & Clearances", name: "WC — clearance in front", mm: "760mm minimum", imperial: "2'6\" minimum", notes: "Indian convention; international codes cite a lower minimum.", keywords: "wc clearance front" },
  // ===== PLUMBING — KITCHEN =====
  { trade: "plumbing", section: "Kitchen", name: "Counter (governs sink position)", mm: "850mm", imperial: "2'9½\"", notes: "", keywords: "kitchen counter platform" },
  { trade: "plumbing", section: "Kitchen", name: "Sink tap wall point", mm: "1000–1050mm", imperial: "3'3½\"–3'5½\"", notes: "Clears deep vessels.", keywords: "kitchen sink tap" },
  { trade: "plumbing", section: "Kitchen", name: "RO/purifier — concealed", mm: "400–600mm", imperial: "1'3½\"–1'11½\"", notes: "In cabinet zone, with reject-line drain.", keywords: "ro purifier water filter concealed" },
  { trade: "plumbing", section: "Kitchen", name: "RO/purifier — wall-mounted", mm: "1400–1500mm", imperial: "4'7\"–4'11\"", notes: "Above the counter.", keywords: "ro purifier wall mounted" },
  { trade: "plumbing", section: "Kitchen", name: "Gas water heater (if in kitchen)", mm: "1800mm", imperial: "5'11\"", notes: "Same as geyser, plus flue clearance.", keywords: "gas water heater kitchen" },
  // ===== PLUMBING — UTILITY =====
  { trade: "plumbing", section: "Utility / Wash Area", name: "Washing machine/dishwasher bib", mm: "1050mm", imperial: "3'5½\"", notes: "A bathroom-height bib is too low.", keywords: "washing machine dishwasher bib" },
  { trade: "plumbing", section: "Utility / Wash Area", name: "Washing machine standpipe drain", mm: "600mm", imperial: "1'11½\"", notes: "Coordinate with the electrician nearby.", keywords: "washing machine drain standpipe" },
  { trade: "plumbing", section: "Utility / Wash Area", name: "Wash-stone / dhobi ghat", mm: "600–650mm", imperial: "1'11½\"–2'1½\"", notes: "Lower than kitchen counter.", keywords: "wash stone dhobi ghat" },
  // ===== PLUMBING — ADJUSTED =====
  { trade: "plumbing", section: "Children / Elderly / Tall", name: "Children's basin", mm: "600–650mm", imperial: "1'11½\"–2'1½\"", notes: "", keywords: "children basin kids" },
  { trade: "plumbing", section: "Children / Elderly / Tall", name: "Children's WC seat", mm: "300–330mm", imperial: "1'0\"–1'1\"", notes: "Child-specific pans.", keywords: "children wc kids toilet" },
  { trade: "plumbing", section: "Children / Elderly / Tall", name: "Elderly WC seat", mm: "450–480mm", imperial: "1'5½\"–1'7\"", notes: "Or a raised-seat attachment.", keywords: "elderly wc accessible raised" },
  { trade: "plumbing", section: "Children / Elderly / Tall", name: "Grab bars", mm: "800–850mm", imperial: "2'7½\"–2'9½\"", notes: "Beside WC and in shower.", keywords: "grab bars elderly accessible" },
  { trade: "plumbing", section: "Children / Elderly / Tall", name: "Elderly basin", mm: "800mm", imperial: "2'7½\"", notes: "Clear knee space, no pedestal.", keywords: "elderly basin accessible" },
  { trade: "plumbing", section: "Children / Elderly / Tall", name: "Tall household — counter/basin/shower", mm: "900mm / 850mm / 2100mm+", imperial: "2'11½\" / 2'9½\" / 6'10½\"+", notes: "", keywords: "tall household counter basin shower" },

  // ===== ELECTRICAL — GENERAL =====
  { trade: "electrical", section: "General Convention", name: "Main light switch", mm: "1200–1350mm", imperial: "4'0\"–4'5\"", notes: "Per IS 732 / NBC Part 8.", keywords: "switch light main" },
  { trade: "electrical", section: "General Convention", name: "Standard wall socket (5A)", mm: "1200–1350mm, or 230–300mm", imperial: "4'0\"–4'5\", or 9\"–12\"", notes: "Two real conventions — confirm which the client wants.", keywords: "socket power point 5a" },
  { trade: "electrical", section: "General Convention", name: "Power socket (15A — AC/geyser)", mm: "1500–1800mm", imperial: "5'0\"–5'11\"", notes: "Dedicated circuit.", keywords: "socket 15a power ac geyser" },
  { trade: "electrical", section: "General Convention", name: "Distribution board (DB/MCB)", mm: "1000–1800mm (1300mm accessible)", imperial: "3'3½\"–5'11\" (4'3\" accessible)", notes: "Handles and dials must stay reachable.", keywords: "db mcb distribution board panel" },
  // ===== ELECTRICAL — LIVING/DINING =====
  { trade: "electrical", section: "Living / Dining", name: "Main switch near entry", mm: "1200–1350mm", imperial: "4'0\"–4'5\"", notes: "", keywords: "living room switch entry" },
  { trade: "electrical", section: "Living / Dining", name: "TV / entertainment sockets", mm: "900–1200mm", imperial: "3'0\"–4'0\"", notes: "", keywords: "tv television socket entertainment" },
  { trade: "electrical", section: "Living / Dining", name: "Points behind sofa", mm: "300–450mm", imperial: "12\"–18\"", notes: "Lamps, chargers.", keywords: "sofa lamp charger point" },
  { trade: "electrical", section: "Living / Dining", name: "AC point", mm: "2100–2450mm", imperial: "7'0\"–8'0\"", notes: "Near head wall.", keywords: "ac point air conditioner living" },
  // ===== ELECTRICAL — BEDROOM =====
  { trade: "electrical", section: "Bedroom", name: "Main switch near door", mm: "1200–1350mm", imperial: "4'0\"–4'5\"", notes: "", keywords: "bedroom switch door" },
  { trade: "electrical", section: "Bedroom", name: "Bedside switch", mm: "760–915mm, or 150–200mm above table", imperial: "2'6\"–3'0\", or 6\"–8\" above table", notes: "Table-relative is more common now.", keywords: "bedside switch reading light" },
  { trade: "electrical", section: "Bedroom", name: "Bedside charging/lamp sockets", mm: "Both sides of bed, table-relative", imperial: "Both sides of bed", notes: "", keywords: "bedside charging socket lamp" },
  { trade: "electrical", section: "Bedroom", name: "AC point", mm: "2130–2440mm", imperial: "7'0\"–8'0\"", notes: "Near head wall.", keywords: "ac point air conditioner bedroom" },
  // ===== ELECTRICAL — KITCHEN =====
  { trade: "electrical", section: "Kitchen", name: "Main switchboard", mm: "1200–1350mm", imperial: "4'0\"–4'5\"", notes: "Just above countertop line.", keywords: "kitchen switchboard main" },
  { trade: "electrical", section: "Kitchen", name: "Countertop small-appliance points", mm: "1015–1120mm", imperial: "3'4\"–3'8\"", notes: "5A or 15A — never directly behind the hob.", keywords: "countertop mixer grinder coffee maker socket" },
  { trade: "electrical", section: "Kitchen", name: "Chimney point", mm: "2135mm", imperial: "7'0\"", notes: "5A with switch, within 1m of chimney body.", keywords: "chimney point exhaust" },
  { trade: "electrical", section: "Kitchen", name: "Microwave / OTG", mm: "Per appliance spec sheet", imperial: "Per appliance spec sheet", notes: "15A, dedicated — heat-generating.", keywords: "microwave otg oven" },
  { trade: "electrical", section: "Kitchen", name: "Refrigerator point", mm: "Behind unit, per placement", imperial: "Behind unit", notes: "5A. Needs real ventilation clearance around the appliance.", keywords: "fridge refrigerator point" },
  { trade: "electrical", section: "Kitchen", name: "Dishwasher point", mm: "Near sink/plumbing point", imperial: "Near sink", notes: "15A — coordinate with plumbing.", keywords: "dishwasher point" },
  { trade: "electrical", section: "Kitchen", name: "RO/water purifier point", mm: "Matches the plumbing RO point", imperial: "Matches plumbing point", notes: "5A — a shared plumbing/electrical point.", keywords: "ro purifier electrical point" },
  // ===== ELECTRICAL — BATHROOM =====
  { trade: "electrical", section: "Bathroom — Safety-Critical", name: "Main lighting switch", mm: "1200–1320mm, outside the door", imperial: "4'0\"–4'4\", outside door", notes: "Never inside — the most repeated bathroom rule found.", keywords: "bathroom switch light outside" },
  { trade: "electrical", section: "Bathroom — Safety-Critical", name: "Shaver socket / exhaust fan switch", mm: "May be inside, well clear of shower", imperial: "Well clear of shower", notes: "The only point types conventionally allowed inside.", keywords: "shaver socket exhaust fan bathroom" },
  { trade: "electrical", section: "Bathroom — Safety-Critical", name: "Minimum clearance — wet fixture to electrical point", mm: "610mm", imperial: "24\"", notes: "A real, repeated minimum, not a soft suggestion.", keywords: "clearance wet electrical safety" },
  { trade: "electrical", section: "Bathroom — Safety-Critical", name: "Wet-area fitting rating", mm: "IP44 minimum", imperial: "IP44 minimum", notes: "IEC 60529, used by Indian manufacturers.", keywords: "ip rating waterproof bathroom" },
  { trade: "electrical", section: "Bathroom — Safety-Critical", name: "Geyser switch", mm: "Outside, or isolated if inside", imperial: "Outside, or isolated", notes: "Pairs with the 1800mm geyser plumbing height.", keywords: "geyser switch isolator" },
  // ===== ELECTRICAL — UTILITY =====
  { trade: "electrical", section: "Utility / Wash Area", name: "Washing machine point", mm: "Near the 1050mm plumbing bib", imperial: "Same line as plumbing point", notes: "A genuine shared plumbing/electrical point.", keywords: "washing machine electrical point" },
  { trade: "electrical", section: "Utility / Wash Area", name: "General utility switch", mm: "1200–1350mm", imperial: "4'0\"–4'5\"", notes: "", keywords: "utility switch" },
  // ===== ELECTRICAL — ENTRANCE =====
  { trade: "electrical", section: "Entrance", name: "Doorbell / intercom panel", mm: "~1220mm", imperial: "~4'0\"", notes: "No India-specific code figure found — based on general intercom-mounting convention, which converges with standard switch height.", flag: "CONVENTION", keywords: "doorbell intercom entrance" },
];
