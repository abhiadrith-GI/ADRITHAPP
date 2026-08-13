/**
 * Landscaping & gardening catalog - browsable reference data, not AI
 * output. Compiled from a dedicated research pass (multiple independent
 * nursery/horticulture sources, cross-checked for agreement) - see the
 * research reference document from that pass. `keywords` exists for the
 * same reason it does in the Standard Heights data: search should match
 * how people actually talk ("toilet" finds WC; here, "bedroom plant"
 * should find the same low-light entries "low light" does).
 *
 * Real product photography for these entries is a separate, later step -
 * this file is text/data only. See the research note on image licensing.
 */

export type PlantEntry = {
  category: "interior" | "exterior-tree" | "exterior-shrub" | "exterior-succulent" | "exterior-climber" | "lawn-grass";
  name: string;
  benefit: string;
  care: string;
  keywords: string;
  /** Populated by scripts/fetch-catalog-images.mjs against the Pexels API - undefined until that's run. */
  imageUrl?: string;
  photographerName?: string;
  photographerUrl?: string;
};

export const PLANT_ENTRIES: PlantEntry[] = [
  // ===== INTERIOR PLANTS =====
  { category: "interior", name: "Snake Plant (Sansevieria)", benefit: "Releases oxygen at night; among the most tolerant of neglect.", care: "Low light; water rarely.", keywords: "mother in law tongue bedroom low light air purifying" },
  { category: "interior", name: "Money Plant (Pothos)", benefit: "Most popular indoor plant in India; removes formaldehyde and benzene; Vastu significance for luck and prosperity.", care: "Low-medium light; water when soil is dry.", keywords: "pothos vastu lucky trailing hanging" },
  { category: "interior", name: "Areca Palm", benefit: "Natural humidifier; filters xylene and toluene.", care: "Bright indirect light; keep soil moist.", keywords: "palm tropical living room" },
  { category: "interior", name: "Peace Lily", benefit: "White flowers; absorbs mold spores - good for humid bathrooms.", care: "Low-medium light; water when dry.", keywords: "flowering bathroom humidity" },
  { category: "interior", name: "Spider Plant", benefit: "Removes up to 90% of formaldehyde within 24 hours (NASA); also filters carbon monoxide.", care: "Tolerates most conditions; beginner-friendly.", keywords: "hanging balcony air purifying" },
  { category: "interior", name: "ZZ Plant", benefit: "Extremely low maintenance; near-indestructible.", care: "Low light; water every 2-3 weeks.", keywords: "low light forgetful office" },
  { category: "interior", name: "Aloe Vera", benefit: "Medicinal gel; easy to propagate.", care: "Bright light; infrequent watering.", keywords: "medicinal succulent" },
  { category: "interior", name: "Boston Fern", benefit: "Natural humidifier.", care: "Indirect light; needs regular misting.", keywords: "fern humidity hanging" },
  { category: "interior", name: "Lucky Bamboo", benefit: "Symbol of fortune; grows in water alone, no soil needed.", care: "Low light; water-based.", keywords: "feng shui desk fortune" },
  { category: "interior", name: "Tulsi (Holy Basil)", benefit: "Culturally significant; common in Indian homes for religious and air-quality reasons.", care: "Bright light, ideally a sunny window or courtyard.", keywords: "holy basil religious courtyard" },
  { category: "interior", name: "Rubber Plant", benefit: "Tolerates air-conditioned rooms with occasional misting.", care: "Bright indirect light.", keywords: "ficus elastica statement" },
  { category: "interior", name: "Chinese Evergreen (Aglaonema)", benefit: "Low-light tolerant; decorative variegated varieties available.", care: "Low-medium light.", keywords: "aglaonema variegated colourful" },
  { category: "interior", name: "Cast Iron Plant", benefit: "Extremely hardy, tolerates near-total neglect.", care: "Low light.", keywords: "hardy indestructible shade" },
  { category: "interior", name: "Fiddle Leaf Fig", benefit: "Popular large decorative statement plant.", care: "Bright indirect light.", keywords: "statement large leaf decor" },
  { category: "interior", name: "Philodendron", benefit: "Trailing or climbing habit; several colour variants (including pink).", care: "Low-medium light.", keywords: "trailing climbing pink variant" },

  // ===== EXTERIOR TREES =====
  { category: "exterior-tree", name: "Ficus (Banyan / Fig varieties)", benefit: "Large shade tree; highly tolerant of varied conditions.", care: "Well-draining soil, bright indirect to full light.", keywords: "banyan fig shade large tree" },
  { category: "exterior-tree", name: "Plumeria (Frangipani)", benefit: "Fragrant flowers; sculptural branch structure even without bloom.", care: "Warm, bright conditions.", keywords: "frangipani fragrant entrance courtyard" },
  { category: "exterior-tree", name: "Cassia fistula", benefit: "Native flowering tree, considered one of India's most beautiful.", care: "Open outdoor space, full sun.", keywords: "golden shower native flowering" },
  { category: "exterior-tree", name: "Butea monosperma", benefit: "Striking native tree for large open spaces.", care: "Full sun, established outdoor planting.", keywords: "flame of forest native large" },
  { category: "exterior-tree", name: "Neem (Azadirachta indica)", benefit: "Drought-tolerant; environmentally beneficial, natural pest deterrent.", care: "Minimal water once established.", keywords: "neem drought tolerant native" },
  { category: "exterior-tree", name: "Peepal (Ficus religiosa)", benefit: "Culturally significant; supports biodiversity.", care: "Large space needed, full sun.", keywords: "peepal religious sacred large" },
  { category: "exterior-tree", name: "Ashoka Tree (Polyalthia longifolia)", benefit: "Popular for boundary and entrance plantings; tall, narrow form.", care: "Full sun, regular watering while establishing.", keywords: "boundary entrance tall narrow privacy" },
  { category: "exterior-tree", name: "Crepe Myrtle (Lagerstroemia)", benefit: "Easy-care flowering patio tree.", care: "Full sun.", keywords: "flowering patio easy care" },

  // ===== EXTERIOR FLOWERING SHRUBS =====
  { category: "exterior-shrub", name: "Bougainvillea", benefit: "Vigorous, thorny; near-year-round colour in pink, purple, orange, white, red.", care: "Full sun; drought-tolerant once established.", keywords: "colourful thorny climber hedge" },
  { category: "exterior-shrub", name: "Hibiscus", benefit: "Large, eye-catching blooms; more profuse flowering in full sun.", care: "Full sun, regular watering.", keywords: "large flower classic garden" },
  { category: "exterior-shrub", name: "Ixora", benefit: "Clusters of bright flowers almost year-round.", care: "Full sun to partial shade.", keywords: "border hedge continuous colour" },
  { category: "exterior-shrub", name: "Jasmine (Mogra)", benefit: "Fragrant white flowers.", care: "Needs plenty of sun to keep flowering.", keywords: "fragrant white flower mogra" },
  { category: "exterior-shrub", name: "Oleander (Nerium)", benefit: "Long-lasting blooms; hardy shrub.", care: "Full sun.", keywords: "hardy long blooming" },
  { category: "exterior-shrub", name: "Tecoma (Yellow Bells)", benefit: "Fast-growing, trumpet-shaped yellow flowers.", care: "Full sun; reaches 6-10 feet.", keywords: "yellow fast growing tall" },
  { category: "exterior-shrub", name: "Plumbago", benefit: "Soft blue flower clusters, unusual colour for a shrub.", care: "Full sun to partial shade.", keywords: "blue flower unusual colour" },
  { category: "exterior-shrub", name: "Duranta (Golden Dewdrop)", benefit: "Evergreen; popular for hedges and borders.", care: "Full sun.", keywords: "hedge border evergreen" },
  { category: "exterior-shrub", name: "Gardenia", benefit: "Fragrant white flowers.", care: "Partial shade, consistent moisture.", keywords: "fragrant white classic" },
  { category: "exterior-shrub", name: "Croton", benefit: "Colourful foliage year-round, not dependent on flowering.", care: "Bright light for best colour.", keywords: "colourful foliage year round" },
  { category: "exterior-shrub", name: "Lantana", benefit: "Extremely hardy, minimal maintenance, attracts butterflies.", care: "Full sun, drought-tolerant.", keywords: "hardy butterfly low maintenance" },

  // ===== SUCCULENTS / DROUGHT-TOLERANT =====
  { category: "exterior-succulent", name: "Agave", benefit: "Architectural, bold statement plant.", care: "Full sun, minimal water.", keywords: "architectural bold statement drought" },
  { category: "exterior-succulent", name: "Crown of Thorns (Euphorbia milii)", benefit: "Flowering succulent, tolerates heat and low water.", care: "Full sun.", keywords: "flowering succulent heat tolerant" },
  { category: "exterior-succulent", name: "Desert Rose (Adenium)", benefit: "Sculptural thick stems with decorative flowers.", care: "Full sun, minimal water.", keywords: "sculptural decorative pot" },

  // ===== CLIMBERS =====
  { category: "exterior-climber", name: "Butterfly Pea (Clitoria ternatea)", benefit: "Hardy climber, suitable for terraces and entrances.", care: "Full sun to partial shade.", keywords: "climber terrace entrance blue flower" },

  // ===== FRAGRANT / HERBAL (dual-purpose) =====
  { category: "exterior-shrub", name: "Lavender", benefit: "Fragrant, calming; ornamental and aromatic use.", care: "Full sun, well-drained soil.", keywords: "fragrant herb aromatic" },
  { category: "exterior-shrub", name: "Rosemary", benefit: "Culinary herb, also ornamental.", care: "Full sun, minimal water.", keywords: "culinary herb kitchen garden" },
  { category: "exterior-shrub", name: "Lemongrass", benefit: "Culinary/medicinal use; hardy grower.", care: "Full sun.", keywords: "culinary herb kitchen garden" },

  // ===== LAWN GRASS =====
  { category: "lawn-grass", name: "Bermuda Grass (Doob hybrid)", benefit: "The most common Indian lawn grass; handles full sun and heavy traffic.", care: "Full sun; regular mowing.", keywords: "doob common sunny high traffic sports" },
  { category: "lawn-grass", name: "Korean Grass (Zoysia)", benefit: "Premium, dense, soft ornamental lawn - the 'luxury' choice.", care: "Tolerates shade; slower growth, less mowing.", keywords: "premium luxury villa soft ornamental" },
  { category: "lawn-grass", name: "Mexican Grass", benefit: "Heat-tolerant, neat uniform appearance - popular for villas and hotels.", care: "Full sun.", keywords: "villa hotel decorative uniform" },
  { category: "lawn-grass", name: "Doob Grass (Cynodon dactylon)", benefit: "Traditional, sacred grass; drought-tolerant.", care: "Partial to full sun.", keywords: "traditional sacred religious drought" },
  { category: "lawn-grass", name: "Carpet Grass", benefit: "Shade-tolerant, budget-friendly for humid regions.", care: "Partial shade, moderate water.", keywords: "shade budget humid coastal" },
  { category: "lawn-grass", name: "Selection No. 1 Grass", benefit: "Premium, dark green, drought-resistant - used for high-end lawns.", care: "Less frequent mowing needed.", keywords: "premium dark green wedding high end" },
  { category: "lawn-grass", name: "St. Augustine Grass", benefit: "Broad leaves, good coverage for humid/coastal regions.", care: "Tolerates partial shade.", keywords: "coastal humid broad leaf shade" },
  { category: "lawn-grass", name: "Nilgiri Grass", benefit: "Cool-season grass for hill stations and cooler regions.", care: "Cooler climate needed.", keywords: "hill station cool climate" },
];

export type GardenStyleEntry = {
  name: string;
  description: string;
  keywords: string;
  imageUrl?: string;
  photographerName?: string;
  photographerUrl?: string;
};

export const GARDEN_STYLE_ENTRIES: GardenStyleEntry[] = [
  { name: "Terrace Garden", description: "Container-based, often combining ornamental plants with a dedicated vegetable/herb section.", keywords: "terrace rooftop container vegetable" },
  { name: "Balcony Garden", description: "Railing planters, hanging pots, and space-efficient layouts for small areas.", keywords: "balcony small space railing" },
  { name: "Vertical / Wall Garden", description: "Tower structures, wall-mounted panels, or hanging cascades - makes the most of limited floor space.", keywords: "vertical wall green living wall tower" },
  { name: "Kitchen / Herb Garden", description: "Curry leaves, coriander, mint, fenugreek and similar - practical and decorative.", keywords: "kitchen herb curry leaves coriander" },
  { name: "Japanese-Style Garden", description: "Symbolic, miniature landscapes - pebbles as rivers, boulders as mountains, bonsai as trees.", keywords: "japanese zen bonsai pebble minimal" },
  { name: "English / Formal Garden", description: "Structured hedges, defined borders, symmetrical layout.", keywords: "formal hedge symmetrical structured" },
  { name: "Xeriscape / Succulent Garden", description: "Low-water, drought-tolerant plant focus - minimal maintenance.", keywords: "xeriscape drought low water succulent" },
  { name: "Rock Garden", description: "Stone-based landscaping paired with hardy, low-maintenance plants.", keywords: "rock stone hardy low maintenance" },
  { name: "Rooftop Garden", description: "Full-sun tolerant species, often combining lawn areas with planters.", keywords: "rooftop terrace full sun" },
];

export type PlanterMaterialEntry = {
  material: string;
  description: string;
};

export const PLANTER_MATERIALS: PlanterMaterialEntry[] = [
  { material: "Terracotta", description: "Breathable, traditional look - good for most plants." },
  { material: "Ceramic", description: "Decorative, wide range of styles and finishes." },
  { material: "Plastic", description: "Lightweight, budget-friendly, durable." },
  { material: "Metal", description: "Modern aesthetic; rust-proof options available." },
  { material: "Fiber / FRP", description: "Lightweight alternative that mimics ceramic or stone." },
  { material: "Jute / Coir", description: "Eco-friendly; commonly used for herbs and hanging planters." },
];
