/**
 * The prose guidance sections that sit alongside the structured room rules
 * and zone data (lib/vastu/rules.ts, lib/vastu/zones.ts). Single source of
 * truth, deliberately - both the Guidance Library page and Ask Vastu's
 * grounding read from this same array, so a browsing user and someone
 * chatting with the tool are never told two different things.
 *
 * This also folds in research that was done and approved but had only
 * ever made it into a standalone review document, not actual app content
 * - the sixteen-direction table's individual zones (already covered
 * separately via ZONE_THEME in zones.ts), mirrors and dressing tables,
 * kitchen equipment specifics, water features and aquariums, indoor
 * plants, and skylights. Nothing here is invented for this file - it's
 * everything from that research, now living in one place instead of two.
 */

export type GuidanceSection = {
  title: string;
  /** Plain paragraphs - no markdown, rendered directly by both the page and the grounding builder. */
  paragraphs: string[];
};

export const GUIDANCE_SECTIONS: GuidanceSection[] = [
  {
    title: "A note for flats and apartments",
    paragraphs: [
      "Most homes we work on are flats, not standalone houses on an open plot - worth addressing honestly rather than assuming the same guidance transfers perfectly. The mainstream view among practitioners is that Vastu still meaningfully applies inside a flat: you can't change the building's overall orientation, but directional placement of your kitchen, bedroom, and entrance within your own unit, plus non-structural remedies like color and mirrors, still count.",
      "A smaller number of practitioners argue the logic weakens somewhat in an apartment specifically, since much of the reasoning assumes open sun and air exposure on most sides - something a mid-floor flat boxed in by neighboring units doesn't fully have. We lean toward the mainstream view in our own guidance, but it's worth knowing this isn't unanimous.",
    ],
  },
  {
    title: "Building and construction",
    paragraphs: [
      "Before ground is broken: a Bhoomi Pujan (groundbreaking ceremony) is traditional before excavation starts, and its timing is usually calculated against an auspicious date - specific weekdays, lunar days, and nakshatras all factor in - rather than picked at random. Traditionally, digging begins at the Northeast corner and proceeds around the site in a set order, and the foundation stone itself is placed in the Northeast corner, in the morning. We can help coordinate this timing as part of your project schedule if you'd like it built in from the start.",
      "Shape and height: a square or rectangular plot is considered most favorable - very long, narrow footprints are generally avoided, and a length-to-width ratio within about 1:2 is the traditional upper limit. An odd number of floors is traditionally favored. Keep your home's overall height in proportion with its width, and with the neighborhood around it.",
      "The Southwest is traditionally built heavier - taller, more solid construction on that side, tapering lighter toward the Northeast. Real reason behind part of this: in our climate, a taller Southwest genuinely shades the rest of the home from the harshest afternoon sun.",
      "One genuinely practical tip, independent of any tradition: avoid a ceiling beam running directly above a bed or sofa - a real, physical layout issue worth catching at the design stage regardless of what you make of Vastu more broadly.",
      "Materials: wood is the traditional and still-preferred material for doors and windows - teak especially for a main door, valued for strength and durability. Sheesham suits a wardrobe, cabinet, or study desk; mango wood is a budget-friendly, sustainably-sourced option that works well for a dining table or pooja-area piece. Solid, natural wood is favored generally over plastic or heavily processed materials.",
    ],
  },
  {
    title: "Furniture and interior details",
    paragraphs: [
      "Mirrors and the dressing table: the one point that's genuinely consistent almost everywhere is that a mirror should never reflect the bed - this is the real, repeated core of this guidance, consistently linked to restless sleep when ignored. If it can't be avoided, covering it at night is the common practical fix. Beyond that one strong point, sources vary more than usual on exact direction: most call North or East ideal for a dressing table, with Southwest the most consistently discouraged spot - though a smaller number of sources place mirrors in South or Southwest instead, so treat the North/East-favored pattern as the majority view, not a unanimous one. Keep the dressing table beside the bed rather than directly opposite it, and keep the mirror itself rectangular or square rather than round.",
      "Wardrobes and almirahs: Southwest is the traditional ideal, doors opening toward North or East.",
    ],
  },
  {
    title: "Kitchen equipment, specifically",
    paragraphs: [
      "Stove, gas cylinder, microwave, and oven are all fire-associated and traditionally belong in the Southeast, cook facing East - this is the most consistent, least-disputed placement rule found anywhere in this research. Sink and drainage traditionally go in the Northeast, kept apart from the stove; fire and water elements are traditionally never placed side by side or on the same platform.",
      "The refrigerator is genuinely more varied than most kitchen guidance - sources differ on the single best direction (Southwest, West, North, and Southeast all appear as 'ideal' depending on the source), but they agree consistently on one thing: avoid the Northeast. Treat this as several workable options with one clear direction to avoid, not one settled answer. Dry storage (grains, spices, provisions) and spare cylinders traditionally belong in the Southwest or West, the same 'heavy' storage zone used elsewhere in the home.",
    ],
  },
  {
    title: "Water features and aquariums",
    paragraphs: [
      "Indoor fountains and water features: North or Northeast is the traditional ideal, consistent with Water already being the Northeast element. Southeast and South are consistently discouraged - a direct fire/water clash with the element traditionally ruling those zones. Water should visually flow toward the interior of the home, and standing or stagnant water is discouraged regardless of direction.",
      "Aquariums: North, Northeast, or East is the traditional ideal, with the living room the most commonly recommended room for one. Bedroom and kitchen are both consistently discouraged - bedroom because the water element is thought to disturb rest, kitchen because it directly clashes with the fire element already governing that space. One practical, non-mystical point worth keeping regardless of belief: don't place a tank in direct sunlight, and replace it promptly if it's cracked or visibly dirty.",
      "A filled water pot (Kalash) - traditionally topped with mango leaves and a coconut - shows up repeatedly as a smaller, simpler alternative to a full fountain. Beyond this specific item, research didn't turn up strong, consistent guidance on purely decorative vases as their own category - a genuine open gap, not a guess we're comfortable making.",
    ],
  },
  {
    title: "Indoor plants and greenery",
    paragraphs: [
      "Money plant: Southeast is the clear, strongly consistent favorite - by a wider margin than almost any other single guideline in this research - avoid Northeast and Southwest. A genuinely real reason worth naming plainly: money plants have documented, real air-purifying properties, removing formaldehyde and benzene from indoor air as an independently studied botanical fact, not a traditional claim.",
      "Beyond money plants specifically, the same core rules covered under outdoor gardens apply indoors too: Tulsi does well in North, Northeast, or East; keep thorny plants like cacti away from the Northeast and main living areas generally.",
    ],
  },
  {
    title: "Skylights and roof openings",
    paragraphs: [
      "Northeast, North, or East are consistently recommended for a skylight - the same light-and-air logic already established for entrances and living rooms, applied to the roof instead of a wall. A pooja room benefiting from direct morning light through a roof opening above it is specifically and repeatedly called out as favorable.",
    ],
  },
  {
    title: "Water, sanitary, and electrical utilities",
    paragraphs: [
      "Overhead water tank: Southwest, elevated, is the standard placement. Underground tank or borewell: Northeast or North.",
      "Septic tank: Northwest is the most consistent recommendation. Two practical rules apply regardless of direction - keep at least 15 feet between a septic tank and any well or water tank, and never place it directly in front of the main entrance.",
      "Electrical (meter, inverter, generator): Southeast is standard, Northwest as a second choice. One useful piece of real-world nuance: this is meant for equipment that actually generates heat. A plain light switch doesn't, and one placed wherever's easiest to find in the dark near an entrance is simply safer in practice than one moved purely to satisfy the directional rule.",
    ],
  },
  {
    title: "Gardens",
    paragraphs: [
      "Keep the Northeast light and open - a lawn or small shrubs only, nothing large, heavy, or tall in that corner. This is the single most consistently repeated garden guideline across everything researched. Holy basil (Tulsi) does well in the North, Northeast, or East, or right by the entrance. Avoid planting a tree directly in front of the main entrance.",
      "One structural note that isn't just tradition: the Peepal tree is considered sacred and traditionally never cut down, but it's also genuinely unsuitable planted close to a house, since its roots spread far enough to threaten a foundation over time.",
    ],
  },
  {
    title: "Where tradition meets real science",
    paragraphs: [
      "Some of Vastu's direction guidance has a genuine, checkable environmental basis, and real architectural research backs this up: East-facing rooms really do get gentler morning light instead of harsh western heat. Southeast kitchens really do get useful morning sun. A heavier Southwest really does provide real shade and thermal buffering in our climate. None of that is a coincidence - Vastu's origins are genuinely tied to real climate observation.",
      "Some of it is traditional belief without that same backing - the associations between a direction and finances, relationships, or luck don't have a demonstrated physical mechanism the way sunlight and airflow do, and credentialed scientists have said so plainly and publicly. That doesn't make the tradition meaningless to people who value it - but it won't be presented as scientifically proven when it isn't, since that's exactly the kind of overstatement that erodes trust in the parts that are genuinely well-founded.",
    ],
  },
];
