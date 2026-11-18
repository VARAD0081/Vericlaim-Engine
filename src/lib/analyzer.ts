import { CATEGORY_A_BUZZWORDS, JURISDICTIONS } from "../data/lexicon.ts";
import type {
  BuzzwordEntry,
  CategoryBMatch,
  EvidenceCategory,
  JurisdictionId,
  StatutoryCheckItem,
} from "../types/audit.ts";

export interface ClaimIntentProfile {
  climate: boolean;
  energy: boolean;
  water: boolean;
  circularity: boolean;
  chemicalSafety: boolean;
  corporateEsg: boolean;
  activeDomains: string[];
}

export interface CorporateDisclosureContext {
  hasVerifiedFiling: boolean;
  frameworkLabel: string;
  isHighFossilEmitter?: boolean;
  verifiedDomains: {
    climate: boolean;
    energy: boolean;
    water: boolean;
    circularity: boolean;
    chemicalSafety: boolean;
    corporateEsg: boolean;
  };
  hasCleanWatchdog: boolean;
}

interface SemanticSynonymRule {
  canonicalTerm: string;
  regex: RegExp;
}

const SEMANTIC_SYNONYM_RULES: SemanticSynonymRule[] = [
  // General green / environmental benefit synonyms
  {
    canonicalTerm: "environmentally friendly",
    regex: /\b(?:environmentally[- ]sound|environmentally[- ]safe|environment[- ]friendly|pro[- ]planet|pro[- ]environment|ecological(?:ly)?[- ](?:safe|sound|friendly))\b/i,
  },
  {
    canonicalTerm: "eco-friendly",
    regex: /\b(?:eco[- ]benign|eco[- ]coatings?|eco[- ]paints?|eco[- ]materials?|eco[- ]products?|earth[- ]caring|planet[- ]caring)\b/i,
  },
  {
    canonicalTerm: "sustainable",
    regex: /\b(?:sustainability[- ]driven|sustainable[- ]production|sustainable[- ]processes?|sustainable[- ]coatings?|sustainably[- ]produced)\b/i,
  },
  // Climate & carbon near-meanings
  {
    canonicalTerm: "low-carbon",
    regex: /\b(?:carbon[- ]cutting|carbon[- ]reducing|emission[- ]light|low[- ]emission|ghg[- ]reduced|smaller\s+carbon\s+footprint)\b/i,
  },
  {
    canonicalTerm: "decarbonizing",
    regex: /\b(?:decarbonized|decarbonising|decarbonisation|carbon[- ]abatement)\b/i,
  },
  {
    canonicalTerm: "carbon neutral",
    regex: /\b(?:carbon[- ]balanced|climate[- ]balanced|zero[- ]carbon[- ]footprint)\b/i,
  },
  {
    canonicalTerm: "reduced carbon",
    regex: /\b(?:lower\s+ghg|cut(?:ting)?\s+emissions|reduced\s+emissions|emissions[- ]reduced)\b/i,
  },
  // Chemical, toxicity, coatings & materials near-meanings
  {
    canonicalTerm: "non-toxic",
    regex: /\b(?:low[- ]voc|zero[- ]voc|voc[- ]free|no[- ]voc|non[- ]hazardous|toxin[- ]less|solvent[- ]free|lead[- ]free|heavy[- ]metal[- ]free|harmless[- ]formula)\b/i,
  },
  {
    canonicalTerm: "safer chemistry",
    regex: /\b(?:benign[- ]chemistry|low[- ]odor\s+(?:paint|coating|formula)|health[- ]safe\s+(?:paint|coating|formula))\b/i,
  },
  {
    canonicalTerm: "plant-derived",
    regex: /\b(?:botanical(?:ly)?[- ](?:derived|sourced)|herbal[- ](?:formula|blend)|bio[- ]derived|plant[- ]sourced|vegetal)\b/i,
  },
  {
    canonicalTerm: "biodegradable",
    regex: /\b(?:naturally[- ]degradable|bio[- ]degrading|breaks[- ]down[- ]naturally)\b/i,
  },
  {
    canonicalTerm: "recycled content",
    regex: /\b(?:post[- ]consumer\s+waste|reprocessed\s+plastic|secondary\s+raw\s+material)\b/i,
  },
  {
    canonicalTerm: "plastic-neutral",
    regex: /\b(?:plastic[- ]offset|plastic[- ]balanced|plastic[- ]positive)\b/i,
  },
  // Water & resource near-meanings
  {
    canonicalTerm: "water-wise",
    regex: /\b(?:water[- ]conserving|water[- ]efficient|water[- ]conservation|water[- ]preserving|low[- ]water[- ]usage|water[- ]reclaiming)\b/i,
  },
  {
    canonicalTerm: "water-positive",
    regex: /\b(?:water[- ]replenishing|net[- ]water[- ]positive|water[- ]restoring)\b/i,
  },
  // Energy & fuel near-meanings
  {
    canonicalTerm: "renewable-powered",
    regex: /\b(?:solar[- ]powered|wind[- ]powered|clean[- ]powered|renewable[- ]sourced|green[- ]electricity|clean[- ]electricity)\b/i,
  },
  {
    canonicalTerm: "energy-efficient",
    regex: /\b(?:power[- ]saving|low[- ]wattage|energy[- ]conserving|energy[- ]optimized)\b/i,
  },
  // Industry, waste & corporate ESG near-meanings
  {
    canonicalTerm: "zero waste",
    regex: /\b(?:landfill[- ]free|zero[- ]landfill|zero[- ]waste[- ]to[- ]landfill|zero[- ]effluent)\b/i,
  },
  {
    canonicalTerm: "waste-reduced",
    regex: /\b(?:waste[- ]minimizing|waste[- ]minimisation|reduced[- ]waste|low[- ]waste)\b/i,
  },
  {
    canonicalTerm: "green operations",
    regex: /\b(?:clean[- ]operations|eco[- ]operations|sustainable[- ]operations|green[- ]plants?|eco[- ]factories)\b/i,
  },
  {
    canonicalTerm: "green manufacturing",
    regex: /\b(?:sustainable[- ]manufacturing|eco[- ]production|clean[- ]production|low[- ]impact[- ]manufacturing)\b/i,
  },
  {
    canonicalTerm: "ESG-aligned",
    regex: /\b(?:esg[- ]compliant|esg[- ]responsible|sustainability[- ]compliant)\b/i,
  },
  {
    canonicalTerm: "responsible",
    regex: /\b(?:eco[- ]responsible|climate[- ]responsible|environmentally[- ]responsible)\b/i,
  },
  {
    canonicalTerm: "cruelty-conscious",
    regex: /\b(?:cruelty[- ]free|not[- ]tested[- ]on[- ]animals|animal[- ]friendly)\b/i,
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overlapsExistingSpan(spans: [number, number][], start: number, end: number): boolean {
  return spans.some(([s, e]) => start < e && end > s);
}

export function extractCategoryABuzzwords(claim: string): BuzzwordEntry[] {
  const normalizedClaim = claim.trim();
  if (!normalizedClaim) return [];

  const matched = new Map<string, BuzzwordEntry>();
  const occupiedSpans: [number, number][] = [];

  // Sort longest-first so compound terms (e.g., "green operations", "environmentally friendly") match prior to short tokens
  const sortedLexicon = [...CATEGORY_A_BUZZWORDS].sort(
    (a, b) => b.term.length - a.term.length
  );

  for (const entry of sortedLexicon) {
    const flexiblePattern = escapeRegex(entry.term)
      .replace(/\\-/g, "[-\\s]+")
      .replace(/\s+/g, "[-\\s]+");
    const regex = new RegExp(`(?<![a-z0-9])${flexiblePattern}(?![a-z0-9])`, "gi");

    let m: RegExpExecArray | null;
    while ((m = regex.exec(normalizedClaim)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlapsExistingSpan(occupiedSpans, start, end)) {
        occupiedSpans.push([start, end]);
        if (!matched.has(entry.term.toLowerCase())) {
          matched.set(entry.term.toLowerCase(), {
            ...entry,
            matchType: "Exact Term",
            matchedPhrase: m[0],
          });
        }
      }
    }
  }

  // Semantic near-meaning scan across words not already captured by exact terms
  const lexiconByLower = new Map(
    CATEGORY_A_BUZZWORDS.map((item) => [item.term.toLowerCase(), item])
  );

  for (const rule of SEMANTIC_SYNONYM_RULES) {
    const canonical = lexiconByLower.get(rule.canonicalTerm.toLowerCase());
    if (!canonical) continue;
    const globalRegex = new RegExp(
      rule.regex.source,
      rule.regex.flags.includes("g") ? rule.regex.flags : `${rule.regex.flags}g`
    );
    let m: RegExpExecArray | null;
    while ((m = globalRegex.exec(normalizedClaim)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlapsExistingSpan(occupiedSpans, start, end)) {
        occupiedSpans.push([start, end]);
        if (!matched.has(canonical.term.toLowerCase())) {
          matched.set(canonical.term.toLowerCase(), {
            ...canonical,
            matchType: "Semantic / Near-Meaning",
            matchedPhrase: m[0],
          });
        }
      }
    }
  }

  return Array.from(matched.values());
}

export function detectClaimIntentDomains(claim: string): ClaimIntentProfile {
  const lower = claim.toLowerCase();
  const climate =
    /\b(carbon|climate|emission|emissions|ghg|scope\s*[123]|net[- ]zero|decarbon|footprint|offset|co2e?)\b/i.test(
      lower
    );
  const energy =
    /\b(energy|power|renewable|solar|wind|electricity|kwh|mwh|fuel|ev|hybrid|hydrogen|battery)\b/i.test(
      lower
    );
  const water =
    /\b(water|zld|zero\s+liquid\s+discharge|effluent|wastewater|ocean|marine|reef|river|water[- ]wise|water[- ]smart)\b/i.test(
      lower
    );
  const circularity =
    /\b(plastic|packag|recycl|waste|circular|pcr|epr|compost|biodegrad|repurpos|upcycl|landfill)\b/i.test(
      lower
    );
  const chemicalSafety =
    /\b(voc|toxic|chemical|paint|coating|solvent|formula|ingredient|dye|clean|pure|natural|botanical|herbal|cruelty)\b/i.test(
      lower
    );
  const corporateEsg =
    /\b(esg|sustainab|eco[- ]?friendly|green|environmentally|planet|earth|responsible|ethical|steward|brsr|csrd)\b/i.test(
      lower
    );

  const activeDomains: string[] = [];
  if (climate) activeDomains.push("Climate & GHG");
  if (energy) activeDomains.push("Energy & Renewables");
  if (water) activeDomains.push("Water & Effluent");
  if (circularity) activeDomains.push("Circularity, Waste & Packaging");
  if (chemicalSafety) activeDomains.push("Chemical & Product Safety");
  if (corporateEsg || activeDomains.length === 0) activeDomains.push("Corporate ESG & Stewardship");

  return {
    climate,
    energy,
    water,
    circularity,
    chemicalSafety,
    corporateEsg,
    activeDomains,
  };
}

const INTRINSICALLY_DECEPTIVE_ABSOLUTES = new Set([
  "chemical-free",
  "zero-impact",
  "guilt-free",
  "clean coal",
  "100% natural",
]);

function termMapsToBackedDomain(
  entry: BuzzwordEntry,
  ctx: CorporateDisclosureContext,
  categoryBMatches: CategoryBMatch[],
  claim: string
): boolean {
  const lowerTerm = entry.term.toLowerCase();
  const phrase = (entry.matchedPhrase ?? entry.term).toLowerCase();

  // Impossible / scientifically misleading absolutes cannot be auto-excused by general filings
  if (INTRINSICALLY_DECEPTIVE_ABSOLUTES.has(lowerTerm)) {
    return false;
  }

  // Offset-reliant carbon-neutrality / net-zero for high-fossil emitters remains high-risk unless explicitly offset-separated in claim
  if (
    ctx.isHighFossilEmitter &&
    /\b(carbon[- ]neutral|climate[- ]neutral|net[- ]zero|clean[- ]fuel|clean[- ]diesel|clean[- ]gas|green[- ]fuel)\b/i.test(
      `${lowerTerm} ${phrase}`
    )
  ) {
    return false;
  }

  // Claim-level Category B backing
  if (
    entry.sector === "B. Climate and carbon" &&
    categoryBMatches.some((m) => m.category === "Emissions")
  ) {
    return true;
  }
  if (
    entry.sector === "C. Materials, packaging, ingredients" &&
    categoryBMatches.some(
      (m) => m.category === "Circularity / PCR" || m.category === "EPR Compliance"
    )
  ) {
    return true;
  }
  if (
    entry.sector === "E. Energy, fuel, transport" &&
    categoryBMatches.some((m) => m.category === "Resource Metric")
  ) {
    return true;
  }

  // Corporate filing + clean watchdog contextual backing
  if (ctx.hasVerifiedFiling && ctx.hasCleanWatchdog) {
    if (entry.sector === "B. Climate and carbon" && ctx.verifiedDomains.climate) {
      // Carbon-neutrality still needs scope/offset nuance unless backed
      if (/neutral/i.test(lowerTerm) && !/\b(scope|offset|sbti|iso\s*14068)\b/i.test(claim)) {
        return false;
      }
      return true;
    }
    if (entry.sector === "E. Energy, fuel, transport" && ctx.verifiedDomains.energy) return true;
    if (entry.sector === "F. Food, agriculture, water, land" && ctx.verifiedDomains.water) {
      return true;
    }
    if (
      entry.sector === "C. Materials, packaging, ingredients" &&
      (ctx.verifiedDomains.circularity || ctx.verifiedDomains.chemicalSafety)
    ) {
      return true;
    }
    if (
      (entry.sector === 'A. General "green" language' ||
        entry.sector === "D. Corporate, ESG, and purpose claims" ||
        entry.sector === 'H. Construction, industry, self-made "certifications"' ||
        entry.sector === "G. Fashion, textiles, beauty, luxury" ||
        entry.sector === "I. Finance, technology, travel, hospitality" ||
        entry.sector === "J. Household goods, labels, imagery, slogans") &&
      ctx.verifiedDomains.corporateEsg
    ) {
      return true;
    }
  }

  return false;
}

export function applyContextualBacking(
  entries: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[],
  claim: string,
  ctx: CorporateDisclosureContext
): BuzzwordEntry[] {
  return entries.map((entry) => {
    // Respect explicit AI contextual backing if already verified, unless impossible absolute
    const backed = termMapsToBackedDomain(entry, ctx, categoryBMatches, claim);
    const finalBacked =
      entry.contextualBacking === "Substantiated by Filing" &&
      !INTRINSICALLY_DECEPTIVE_ABSOLUTES.has(entry.term.toLowerCase())
        ? true
        : backed;

    return {
      ...entry,
      contextualBacking: finalBacked ? "Substantiated by Filing" : "Unbacked Buzzword",
      backingExplanation: finalBacked
        ? `Conceptually supported by ${ctx.frameworkLabel || "submitted empirical metrics"} and clean public compliance records.`
        : "Not backed by quantified claim metrics or verified corporate disclosure in this specific aspect.",
    };
  });
}

const CATEGORY_B_PATTERNS: {
  label: string;
  category: CategoryBMatch["category"];
  regex: RegExp;
}[] = [
  {
    label: "Scope 1 / 2 / 3 GHG Disclosure",
    category: "Emissions",
    regex: /\bscope\s*[123](?:\s*(?:&|and|,|\/)\s*[123])*\b/gi,
  },
  {
    label: "Quantified CO2e Footprint",
    category: "Emissions",
    regex: /\b\d+(?:[.,]\d+)?\s*(?:tco2e|mt\s*co2e|kg\s*co2e|gco2e|tonnes?\s*(?:of\s*)?co2e?)\b/gi,
  },
  {
    label: "Baseline-Referenced Percentage Reduction",
    category: "Emissions",
    regex: /\b\d+(?:[.,]\d+)?%\s*(?:reduction|decrease|lower|cut|intensity\s+drop)[^.]{0,60}\b(?:baseline|base\s*year|20\d{2}|fy\s*\d{2,4})\b/gi,
  },
  {
    label: "Post-Consumer Recycled (PCR %) Metric",
    category: "Circularity / PCR",
    regex: /\b(?:\d+(?:[.,]\d+)?%\s*(?:pcr|post[- ]consumer\s+recycled|recycled\s+content)|pcr\s*[:=]?\s*\d+(?:[.,]\d+)?%)\b/gi,
  },
  {
    label: "Extended Producer Responsibility (EPR) Compliance",
    category: "EPR Compliance",
    regex: /\b(?:epr|extended\s+producer\s+responsibility)(?:\s+(?:registration|compliance|target|credit|pwm|cpcb|obligation|id|number))?\b/gi,
  },
  {
    label: "Energy Consumption / Renewable Share Metric",
    category: "Resource Metric",
    regex: /\b\d+(?:[.,]\d+)?\s*(?:kwh|mwh|gwh|gj|tj|joules?|%\s*renewable\s+(?:electricity|energy)\s+(?:via|ppa|i-?rec))\b/gi,
  },
  {
    label: "Water Withdrawal / ZLD Metric",
    category: "Resource Metric",
    regex: /\b(?:\d+(?:[.,]\d+)?\s*(?:kl|ml|litres?|liters?|m3)\s*(?:water|recycled|reclaimed|withdrawn)?|zero\s+liquid\s+discharge|zld)\b/gi,
  },
  {
    label: "Third-Party LCA / Verification Standard",
    category: "Certification / Standard",
    regex: /\b(?:iso\s*14040|iso\s*14044|iso\s*14064|iso\s*14067|iso\s*14068|ghg\s+protocol|sbti|science[- ]based\s+targets?|en\s*13432|astm\s*d6400|astm\s*d6866|brsr\s+core|sebi\s+brsr|fsc|gots|eu\s+ecolabel|is\s*17088|pas\s*2060|greenguard|igbc|leed)\b/gi,
  },
];

export function extractCategoryBMetrics(claim: string): CategoryBMatch[] {
  const matches: CategoryBMatch[] = [];
  const seen = new Set<string>();

  for (const spec of CATEGORY_B_PATTERNS) {
    const found = claim.match(spec.regex);
    if (found) {
      for (const item of found) {
        const cleanText = item.trim();
        const key = `${spec.label}::${cleanText.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            label: spec.label,
            matchedText: cleanText,
            category: spec.category,
          });
        }
      }
    }
  }

  return matches;
}

export function buildBaselineStatutoryChecks(
  claim: string,
  jurisdiction: JurisdictionId,
  categoryAMatches: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[]
): StatutoryCheckItem[] {
  const spec = JURISDICTIONS[jurisdiction];
  const lower = claim.toLowerCase();

  return spec.statutoryIndicators.map((ind) => {
    let status: EvidenceCategory = "Inconclusive";
    let finding =
      "Preliminary review: verify this indicator against the entity's latest public sustainability or annual filings.";

    if (ind.code === "BRSR-P6-E1") {
      const hasEnergy = /\b(kwh|mwh|gwh|gj|tj|renewable\s+energy|ppa|i-?rec)\b/i.test(lower);
      if (hasEnergy) {
        status = "Supporting";
        finding =
          "Claim references verifiable energy units or renewable sourcing instruments aligned with BRSR P6 E1.";
      } else if (/\b(energy|power|clean-tech|green-tech|renewable|solar|wind)\b/i.test(lower)) {
        status = "Inconclusive";
        finding =
          "Energy or clean-power intent referenced; cross-check corporate Joules/kWh totals and renewable share in BRSR disclosures.";
      } else {
        status = "Inconclusive";
        finding =
          "Energy-intensity metric is not explicitly stated in the claim text; confirm facility renewable mix in broader corporate ESG disclosures.";
      }
    } else if (ind.code === "BRSR-P6-E3/E4") {
      const hasWater = /\b(kl|ml|m3|zero\s+liquid\s+discharge|zld|water\s+withdrawal|effluent)\b/i.test(
        lower
      );
      if (hasWater) {
        status = "Supporting";
        finding =
          "Claim includes volumetric water or ZLD treatment terminology relevant to BRSR P6 E3/E4.";
      } else if (/\b(water|ocean|marine|reef)\b/i.test(lower)) {
        status = "Inconclusive";
        finding =
          "Water stewardship intent present; requires KL withdrawal, ZLD, or water intensity disclosure from BRSR filings.";
      } else {
        status = "Inconclusive";
        finding =
          "Water stewardship is outside the immediate claim phrasing; refer to entity-level ZLD and effluent disclosures for full context.";
      }
    } else if (
      ind.code === "BRSR-P6-E6/E7" ||
      ind.code === "FTC-260.5" ||
      ind.code === "EU-GCD-ART3-OFF"
    ) {
      const hasGHG = categoryBMatches.some((m) => m.category === "Emissions");
      const hasClimateBuzz = categoryAMatches.some(
        (b) => b.sector === "B. Climate and carbon" || b.subcategory === "Climate & Carbon"
      );
      if (hasGHG && !hasClimateBuzz) {
        status = "Supporting";
        finding =
          "Claim specifies Scope 1/2/3 boundaries, tCO2e units, or baseline-anchored emission metrics.";
      } else if (hasGHG && hasClimateBuzz) {
        status = "Inconclusive";
        finding =
          "Quantitative GHG terms appear alongside climate phrasing requiring offset separation.";
      } else if (hasClimateBuzz) {
        status = "Contradictory";
        finding =
          "Climate or carbon-neutral phrasing lacks mandatory Scope 1/2/3 inventory, baseline year, or offset disclosure in the claim.";
      } else {
        status = "Inconclusive";
        finding =
          "GHG inventory boundaries (Scope 1–3) should be cross-checked against the company's public climate or ESG reporting.";
      }
    } else if (
      ind.code === "BRSR-P6-E9" ||
      ind.code === "FTC-260.12/13" ||
      ind.code === "FTC-260.8"
    ) {
      const hasCircularMetric = categoryBMatches.some(
        (m) => m.category === "Circularity / PCR" || m.category === "EPR Compliance"
      );
      const hasCircularBuzz = categoryAMatches.some(
        (b) =>
          b.sector === "C. Materials, packaging, ingredients" ||
          b.subcategory === "Circularity & Packaging"
      );
      if (ind.code === "FTC-260.8" && !/\b(biodegrad|compost|degrad)\b/i.test(lower)) {
        status = "Inconclusive";
        finding =
          "Not triggered directly by current claim wording; applies only when marketing biodegradable or compostable attributes.";
      } else if (hasCircularMetric && !hasCircularBuzz) {
        status = "Supporting";
        finding =
          "Claim discloses explicit PCR %, EPR compliance, or recognized disposal/composting standards.";
      } else if (hasCircularMetric && hasCircularBuzz) {
        status = "Inconclusive";
        finding =
          "Packaging metrics are partially disclosed, with broad material terms present.";
      } else if (hasCircularBuzz) {
        status = "Inconclusive";
        finding =
          "Material/packaging terminology requires PCR %, CPCB EPR registration, or recognized testing proof.";
      } else {
        status = "Inconclusive";
        finding =
          "Packaging PCR % and waste recovery disclosures are best verified in annual EPR or corporate circularity reports.";
      }
    } else if (
      ind.code === "CCPA-2024 / ASCI" ||
      ind.code === "EU-EMPCO-GEN" ||
      ind.code === "FTC-260.4"
    ) {
      if (categoryAMatches.length === 0 && categoryBMatches.length > 0) {
        status = "Supporting";
        finding =
          "No prohibited Category A generic greenwashing terms detected; claim relies on specific measurable metrics.";
      } else if (categoryAMatches.length > 0 && categoryBMatches.length === 0) {
        status = "Contradictory";
        finding = `Detected ${categoryAMatches.length} Category A term(s) requiring lifecycle metrics or audited statutory backing under ${ind.framework}.`;
      } else if (categoryAMatches.length > 0 && categoryBMatches.length > 0) {
        status = "Inconclusive";
        finding = `Mixed claim: contains ${categoryBMatches.length} Category B metric(s) alongside ${categoryAMatches.length} Category A term(s).`;
      }
    } else if (ind.code === "EU-GCD-ART3" || ind.code === "EU-GCD-ART10") {
      const hasStandard = categoryBMatches.some((m) => m.category === "Certification / Standard");
      if (hasStandard) {
        status = "Supporting";
        finding =
          "References recognized lifecycle or conformity verification standards (e.g., ISO 14040/14044, EU Ecolabel).";
      } else {
        status = "Inconclusive";
        finding =
          "Verify whether the entity supports this claim via an external ISO 14040 LCA or third-party ISAE 3000 / EU Ecolabel dossier.";
      }
    }

    return {
      code: ind.code,
      framework: ind.framework,
      title: ind.title,
      requirement: ind.requirement,
      status,
      finding,
    };
  });
}
