export type BuzzwordSector =
  | 'A. General "green" language'
  | "B. Climate and carbon"
  | "C. Materials, packaging, ingredients"
  | "D. Corporate, ESG, and purpose claims"
  | "E. Energy, fuel, transport"
  | "F. Food, agriculture, water, land"
  | "G. Fashion, textiles, beauty, luxury"
  | 'H. Construction, industry, self-made "certifications"'
  | "I. Finance, technology, travel, hospitality"
  | "J. Household goods, labels, imagery, slogans";

export interface PdfBuzzwordSpec {
  id: number;
  term: string;
  sector: BuzzwordSector;
}

const SECTOR_DATA: { sector: BuzzwordSector; terms: string[] }[] = [
  {
    sector: 'A. General "green" language',
    terms: [
      "eco-friendly", "green", "environmentally friendly", "planet-friendly", "earth-friendly",
      "nature-friendly", "climate-friendly", "eco-conscious", "eco-smart", "eco-safe",
      "eco-aware", "eco-minded", "eco-positive", "planet-positive", "nature-positive",
      "climate-positive", "sustainable", "sustainably made", "sustainably sourced", "sustainability-focused",
      "responsible", "responsibly made", "responsibly sourced", "ethical", "ethically made",
      "conscious", "conscious choice", "mindful", "mindfully made", "clean",
      "cleaner", "cleaner future", "clean energy-powered", "pure", "natural",
      "all-natural", "100% natural", "naturally derived", "nature-inspired", "nature-based",
      "organic-inspired", "earth-conscious", "green-minded", "greener", "greener choice",
      "greener future", "future-friendly", "future-proof", "future-ready", "next-generation green",
    ],
  },
  {
    sector: "B. Climate and carbon",
    terms: [
      "carbon neutral", "carbon-neutral ready", "carbon negative", "carbon positive", "carbon smart",
      "carbon conscious", "carbon light", "low-carbon", "lower-carbon", "reduced carbon",
      "carbon-aware", "carbon-friendly", "carbon-optimized", "carbon offset", "carbon-offset included",
      "offset-ready", "net zero", "net-zero aligned", "net-zero ready", "net-zero ambition",
      "zero emissions", "near-zero emissions", "low emissions", "ultra-low emissions", "emissions-conscious",
      "emissions-smart", "climate neutral", "climate smart", "climate conscious", "climate aware",
      "climate action", "climate-aligned", "climate-ready", "climate resilient", "climate solution",
      "climate leader", "climate committed", "climate pledge", "decarbonization journey", "decarbonizing",
      "transition-ready", "transition pathway", "green transition", "energy transition partner", "carbon footprint reduced",
      "footprint-reduced", "light footprint", "small footprint", "minimal footprint", "planet-first",
    ],
  },
  {
    sector: "C. Materials, packaging, ingredients",
    terms: [
      "recycled", "recycled content", "recyclable", "fully recyclable", "widely recyclable",
      "recycle-ready", "recyclable-by-design", "upcycled", "repurposed", "reclaimed",
      "renewable", "renewable materials", "bio-based", "plant-based", "plant-powered",
      "plant-derived", "plant-inspired", "bio-friendly", "biodegradable", "compostable",
      "degradable", "oxo-degradable", "eco-plastic", "ocean-bound plastic", "ocean-friendly",
      "reef-safe", "green plastic", "bioplastic", "planet-safe packaging", "eco-packaging",
      "sustainable packaging", "minimal packaging", "reduced packaging", "lightweighted", "plastic-neutral",
      "non-toxic", "toxin-free", "chemical-free", "free-from", "clean ingredients",
      "clean beauty", "clean formula", "green chemistry", "safer chemistry", "earth-derived",
      "mineral-based", "naturally sourced", "cruelty-conscious", "planet-safe formula", "eco-formula",
    ],
  },
  {
    sector: "D. Corporate, ESG, and purpose claims",
    terms: [
      "ESG-aligned", "ESG-focused", "ESG-driven", "ESG leader", "ESG-integrated",
      "ESG-conscious", "purpose-driven", "purpose-led", "mission-driven", "values-led",
      "values-driven", "sustainability leader", "sustainability champion", "sustainability journey", "sustainability commitment",
      "sustainability pledge", "sustainability-first", "sustainability-minded", "sustainability partner", "impact-driven",
      "impact-focused", "impact-positive", "positive impact", "net positive", "net-positive impact",
      "shared value", "stakeholder capitalism", "responsible business", "responsible growth", "conscious capitalism",
      "triple bottom line", "people-planet-profit", "green leader", "green pioneer", "green innovator",
      "green champion", "eco-leader", "eco-pioneer", "eco-innovator", "eco-champion",
      "earth steward", "planet steward", "environmental steward", "stewardship", "good-for-all",
      "better business", "better tomorrow", "better world", "building a better future", "tomorrow-minded",
    ],
  },
  {
    sector: "E. Energy, fuel, transport",
    terms: [
      "clean energy", "green energy", "renewable-powered", "powered by renewables", "clean fuel",
      "green fuel", "cleaner fuel", "clean coal", "clean diesel", "clean gas",
      "bridge fuel", "transition fuel", "low-carbon fuel", "sustainable fuel", "sustainable aviation",
      "green aviation", "eco-flight", "fly green", "carbon-conscious travel", "green mobility",
      "clean mobility", "smart mobility", "sustainable mobility", "eco-driving", "eco-mode",
      "eco-drive", "green drive", "zero-emission-ready", "hybrid-ready", "electrification-ready",
      "EV-ready", "hydrogen-ready", "blue hydrogen", "green hydrogen-ready", "biofuel-ready",
      "advanced biofuel", "bio-energy", "biomass-powered", "waste-to-energy", "energy-efficient",
      "energy-smart", "energy-saving", "power-smart", "grid-friendly", "smart energy",
      "intelligent energy", "responsible energy", "energy of the future", "cleaner power", "greener power",
    ],
  },
  {
    sector: "F. Food, agriculture, water, land",
    terms: [
      "farm-fresh", "farm-friendly", "farm-to-table", "locally sourced", "locally grown",
      "local", "regenerative", "regenerative-inspired", "regenerative-ready", "regeneratively sourced",
      "sustainably farmed", "sustainably grown", "sustainably caught", "sustainably harvested", "responsibly farmed",
      "responsibly grown", "responsibly raised", "humanely raised", "ethically raised", "ethically sourced",
      "naturally raised", "pasture-inspired", "wild-inspired", "sea-friendly", "dolphin-safe",
      "ocean-safe", "deforestation-free", "deforestation-conscious", "zero-deforestation commitment", "forest-friendly",
      "forest-positive", "land-positive", "soil-friendly", "soil health champion", "water-positive",
      "water-smart", "water-wise", "water-conscious", "water-neutral", "water-saving",
      "water stewardship", "drought-friendly", "planet-friendly farming", "climate-smart agriculture", "smart farming",
      "green farming", "eco-farmed", "nature-grown", "naturally grown", "earth-grown",
    ],
  },
  {
    sector: "G. Fashion, textiles, beauty, luxury",
    terms: [
      "conscious collection", "conscious fashion", "eco-fashion", "sustainable fashion", "green fashion",
      "ethical fashion", "circular fashion", "circular design", "circular-ready", "circular economy partner",
      "circularity", "closed-loop", "closed-loop-ready", "loop-friendly", "take-back ready",
      "made to last", "made responsibly", "made with care", "made with purpose", "made better",
      "made greener", "made for tomorrow", "designed for the planet", "designed for good", "designed for sustainability",
      "designed with the planet in mind", "responsibly sourced cotton", "better cotton", "preferred materials", "preferred fibers",
      "eco-fibers", "eco-fabric", "green textiles", "natural fibers", "naturally dyed",
      "low-impact dye", "eco-dyed", "waterless", "water-light", "vegan leather",
      "plant leather", "eco-leather", "green beauty", "clean skincare", "planet-safe skincare",
      "earth-friendly cosmetics", "eco-luxury", "sustainable luxury", "green luxury", "conscious luxury",
    ],
  },
  {
    sector: 'H. Construction, industry, self-made "certifications"',
    terms: [
      "green building", "eco-building", "sustainable building", "sustainable construction", "green construction",
      "green concrete", "low-carbon concrete", "eco-concrete", "green steel", "low-carbon steel",
      "eco-steel", "green cement", "sustainable cement", "sustainable timber", "responsibly sourced timber",
      "eco-timber", "green materials", "sustainable materials", "smart building", "eco-certified",
      "eco-rated", "green-rated", "sustainability-rated", "green-tested", "eco-tested",
      "planet-tested", "eco-approved", "green-approved", "nature-approved", "eco-verified",
      "green-verified", "sustainability-verified", "eco-designed", "eco-engineered", "eco-manufactured",
      "cleaner production", "clean manufacturing", "green manufacturing", "lean and green", "green factory",
      "zero waste", "near-zero waste", "waste-smart", "waste-conscious", "waste-reduced",
      "less waste", "circular manufacturing", "green operations", "green-certified", "sustainability-certified",
    ],
  },
  {
    sector: "I. Finance, technology, travel, hospitality",
    terms: [
      "green finance", "sustainable finance", "green bond-aligned", "sustainability-linked", "impact investing",
      "ethical investing", "responsible investing", "conscious investing", "sustainable investing", "ESG fund",
      "green fund", "climate fund", "planet fund", "future fund", "transition finance",
      "green banking", "green loan", "eco-loan", "sustainable portfolio", "green portfolio",
      "green tech", "clean tech", "climate tech", "eco-tech", "sustainable tech",
      "green cloud", "carbon-aware computing", "green AI", "green data center", "eco-hosting",
      "green hosting", "sustainable IT", "green IT", "eco-travel", "sustainable travel",
      "responsible travel", "green travel", "eco-tourism", "sustainable tourism", "eco-resort",
      "eco-lodge", "eco-hotel", "green hotel", "green stay", "eco-stay",
      "sustainable stay", "eco-cruise", "green cruise", "green events", "sustainable events",
    ],
  },
  {
    sector: "J. Household goods, labels, imagery, slogans",
    terms: [
      "eco-cleaning", "green cleaning", "planet-safe cleaning", "earth-friendly cleaners", "eco-detergent",
      "green detergent", "safe for the environment", "safe for the planet", "safe for nature", "safe for waterways",
      "septic-safe", "ozone-friendly", "eco-bulb", "green light", "eco-appliance",
      "eco-wash", "eco-cycle", "eco-setting", "eco-program", "eco-label",
      "green label", "green badge", "green seal", "eco-seal", "leaf logo",
      "earth badge", "planet badge", "green swirl", "nature-made", "handmade-green",
      "artisan-green", "small-batch green", "honest", "transparent", "fully transparent",
      "radically transparent", "open about impact", "taking responsibility", "doing our part", "doing our bit",
      "every little helps the planet", "every drop counts", "small steps big impact", "green steps", "on our way to green",
      "greener by 2030", "journey to zero", "committed to change", "together for the planet", "for a greener tomorrow",
    ],
  },
];

export const BUZZWORDS_500: PdfBuzzwordSpec[] = SECTOR_DATA.flatMap((group, sectorIdx) =>
  group.terms.map((term, termIdx) => ({
    id: sectorIdx * 50 + termIdx + 1,
    term,
    sector: group.sector,
  }))
);

export const PDF_RED_FLAGS: string[] = [
  'No percentage, baseline year or scope (for example, "sustainable" with no metric)',
  "No named third-party certification (FSC, Fairtrade, B Corp, ISO 14024, and so on)",
  'Future promises ("net zero by 2050") with no interim targets',
  "Whole-brand claims made on the basis of a single product",
];
