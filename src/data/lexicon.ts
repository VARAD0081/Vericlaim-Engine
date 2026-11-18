import { BUZZWORDS_500, PDF_RED_FLAGS, type BuzzwordSector } from "./buzzwords500.ts";
import type { BuzzwordEntry, JurisdictionId } from "../types/audit.ts";

export { PDF_RED_FLAGS, type BuzzwordSector };

export interface JurisdictionSpec {
  id: JurisdictionId;
  label: string;
  shortName: string;
  primaryStatute: string;
  enforcementBodies: string[];
  statutoryIndicators: {
    code: string;
    framework: string;
    title: string;
    requirement: string;
  }[];
}

export const JURISDICTIONS: Record<JurisdictionId, JurisdictionSpec> = {
  india: {
    id: "india",
    label: "India: SEBI BRSR / CCPA & ASCI",
    shortName: "India (SEBI BRSR / CCPA & ASCI)",
    primaryStatute: "SEBI BRSR Principle 6, CCPA Greenwashing Guidelines (2024) & ASCI Green Claims Code",
    enforcementBodies: [
      "SEBI",
      "Central Consumer Protection Authority (CCPA)",
      "Advertising Standards Council of India (ASCI)",
      "CPCB",
    ],
    statutoryIndicators: [
      {
        code: "BRSR-P6-E1",
        framework: "SEBI BRSR Principle 6",
        title: "Energy Consumption & Intensity",
        requirement:
          "Disclose total energy consumed from renewable vs. non-renewable sources (in Joules/kWh) and energy intensity per rupee of turnover.",
      },
      {
        code: "BRSR-P6-E3/E4",
        framework: "SEBI BRSR Principle 6",
        title: "Water Withdrawal, Consumption & Discharge",
        requirement:
          "Report water withdrawal by source, total consumption in KL, water intensity, and ZLD/treatment status before discharge.",
      },
      {
        code: "BRSR-P6-E6/E7",
        framework: "SEBI BRSR Principle 6",
        title: "GHG Emissions (Scope 1 & Scope 2)",
        requirement:
          "Quantify Scope 1 and Scope 2 emissions in Metric Tonnes of CO2 equivalent (tCO2e) with emission intensity and boundary verification.",
      },
      {
        code: "BRSR-P6-E9",
        framework: "SEBI BRSR Principle 6",
        title: "Waste Management & EPR Compliance",
        requirement:
          "Detail plastic, e-waste, and hazardous waste generated, recycled, recovered, and Extended Producer Responsibility (EPR) fulfillment.",
      },
      {
        code: "CCPA-2024 / ASCI",
        framework: "CCPA & ASCI Guidelines",
        title: "Substantiation of Aspirational & Generic Claims",
        requirement:
          "Generic terms (eco-friendly, green, sustainable) are prohibited unless backed by credible, verifiable lifecycle evidence or audited statutory disclosures.",
      },
    ],
  },
  eu: {
    id: "eu",
    label: "European Union: EU Green Claims Directive",
    shortName: "EU (Green Claims Directive & EmpCo)",
    primaryStatute:
      "EU Green Claims Directive (COM/2023/166) & Empowering Consumers Directive (2024/825)",
    enforcementBodies: [
      "European Commission",
      "National Consumer Protection Authorities (CPC Network)",
      "Accredited Conformity Verifiers",
    ],
    statutoryIndicators: [
      {
        code: "EU-GCD-ART3",
        framework: "EU Green Claims Directive",
        title: "Lifecycle Assessment & Primary Data Substantiation",
        requirement:
          "Claims must rely on recognized scientific evidence (PEF/ISO 14040) identifying whether benefits apply to the whole product or a single aspect.",
      },
      {
        code: "EU-GCD-ART3-OFF",
        framework: "EU Green Claims Directive",
        title: "Climate & Carbon Offset Transparency",
        requirement:
          "Carbon-neutral or net-zero claims based solely on offsetting are banned under EmpCo; emissions reductions vs. offsets must be separated.",
      },
      {
        code: "EU-EMPCO-GEN",
        framework: "Empowering Consumers Directive",
        title: "Prohibition of Generic Environmental Claims",
        requirement:
          "Blanket claims such as 'eco-friendly', 'green', or 'biodegradable' without recognized excellent environmental performance (e.g. EU Ecolabel) are barred.",
      },
      {
        code: "EU-GCD-ART10",
        framework: "EU Green Claims Directive",
        title: "Ex-Ante Third-Party Verification",
        requirement:
          "Explicit environmental claims and private sustainability labels must be pre-verified by an independent accredited conformity assessment body.",
      },
    ],
  },
  us: {
    id: "us",
    label: "United States: FTC Green Guides",
    shortName: "United States (FTC 16 CFR Part 260)",
    primaryStatute: "FTC Guides for the Use of Environmental Marketing Claims (16 CFR Part 260)",
    enforcementBodies: [
      "Federal Trade Commission (FTC)",
      "National Advertising Division (NAD)",
      "State Attorneys General",
    ],
    statutoryIndicators: [
      {
        code: "FTC-260.4",
        framework: "FTC Green Guides",
        title: "General Environmental Benefit Claims",
        requirement:
          "Unqualified 'eco-friendly' or 'green' claims imply no negative environmental impact and are deceptive unless qualified with specific, substantiated benefits.",
      },
      {
        code: "FTC-260.5",
        framework: "FTC Green Guides",
        title: "Carbon Offsets & Emissions Claims",
        requirement:
          "Requires competent and reliable scientific accounting ensuring emission reductions are additional, permanent, and not double-counted.",
      },
      {
        code: "FTC-260.8",
        framework: "FTC Green Guides",
        title: "Degradable / Biodegradable Qualification",
        requirement:
          "Unqualified degradable claims require scientific proof that the item completely breaks down into elements found in nature within 1 year after customary disposal.",
      },
      {
        code: "FTC-260.12/13",
        framework: "FTC Green Guides",
        title: "Recyclable & Recycled Content (PCR %) Claims",
        requirement:
          "Recyclable claims require recycling facilities available to a substantial majority (60%+) of consumers; recycled content must state exact weight percentage.",
      },
    ],
  },
};

const SECTOR_TO_SUBCATEGORY: Record<BuzzwordSector, BuzzwordEntry["subcategory"]> = {
  'A. General "green" language': "Eco & Green Compounds",
  "B. Climate and carbon": "Climate & Carbon",
  "C. Materials, packaging, ingredients": "Circularity & Packaging",
  "D. Corporate, ESG, and purpose claims": "Corporate, ESG & Finance",
  "E. Energy, fuel, transport": "Energy & Mobility",
  "F. Food, agriculture, water, land": "Food, Water & Land",
  "G. Fashion, textiles, beauty, luxury": "Ethical & Lifestyle",
  'H. Construction, industry, self-made "certifications"': "Industry & Self-Certs",
  "I. Finance, technology, travel, hospitality": "Corporate, ESG & Finance",
  "J. Household goods, labels, imagery, slogans": "Household & Slogans",
};

const SECTOR_RISK_SUMMARIES: Record<BuzzwordSector, string> = {
  'A. General "green" language':
    "Broad environmental benefit phrasing; requires quantified lifecycle metrics, accredited certification, or audited corporate disclosures under CCPA 2024, EU EmpCo & FTC §260.4.",
  "B. Climate and carbon":
    "Climate/carbon claim; requires GHG Protocol Scope 1/2/3 inventory, baseline year, and strict separation of direct abatement from carbon offsets.",
  "C. Materials, packaging, ingredients":
    "Material, toxicity, or packaging claim; requires exact PCR %, bio-based %, disposal timeframe (ASTM/ISO/EN), or toxicological threshold disclosure.",
  "D. Corporate, ESG, and purpose claims":
    "Corporate ESG or stewardship claim; requires verifiable enterprise KPIs (SEBI BRSR Core, EU CSRD ESRS, or SEC filings) rather than aspirational rhetoric.",
  "E. Energy, fuel, transport":
    "Energy, fuel, or mobility claim; requires kWh/renewable PPA/I-REC proof, lifecycle tailpipe-vs-grid disclosure, or comparative efficiency baseline.",
  "F. Food, agriculture, water, land":
    "Sourcing, land, or water claim; requires volumetric KL withdrawal/ZLD proof, chain-of-custody standard (FSC/RSPO), or biodiversity methodology.",
  "G. Fashion, textiles, beauty, luxury":
    "Circularity, fiber, or formulation claim; requires fiber composition %, take-back recovery rate, or recognized ecolabel/safety verification.",
  'H. Construction, industry, self-made "certifications"':
    "Industrial or self-certified label claim; requires named independent standard (ISO 14024/14040, IGBC/LEED, EPD) rather than self-issued eco-seals.",
  "I. Finance, technology, travel, hospitality":
    "Sustainable finance, IT, or travel claim; requires EU Taxonomy/green bond framework, PUE/carbon-aware compute metrics, or verified abatement.",
  "J. Household goods, labels, imagery, slogans":
    "Consumer label, imagery, or slogan; flagged under CCPA/FTC/EU GCD when decorative badges or broad promises lack specific measurable qualifiers.",
};

const SPECIFIC_TERM_OVERRIDES: Record<string, string> = {
  "eco-friendly":
    "Flagged blanket benefit term under CCPA 2024, EU EmpCo (2024/825), and FTC §260.4 unless backed by verified operational/lifecycle disclosures.",
  "green":
    "Broad environmental descriptor requiring specific boundary, metric, or verified corporate filing substantiation.",
  "chemical-free":
    "Scientifically inaccurate absolute claim under FTC/ASCI/CCPA; all physical matter consists of chemical compounds.",
  "non-toxic":
    "Requires competent scientific evidence (e.g., VOC g/L or OECD ecotoxicity thresholds) covering human and environmental safety.",
  "100% natural":
    "Absolute origin claim scrutinized if synthetic binders, stabilizers, or industrial processing aids are present.",
  "carbon neutral":
    "Restricted under EU EmpCo & FTC §260.5; requires full Scope 1/2/3 accounting and separation of direct abatement vs. offsets.",
  "net zero":
    "Must disclose Scope 1/2/3 coverage, base year, and interim targets rather than unverified 2050 pledges.",
  "biodegradable":
    "Requires breakdown timeframe, disposal environment, and ASTM/ISO/IS standard qualification (FTC §260.8).",
  "recyclable":
    "Requires proof of practical collection/sorting infrastructure or CPCB EPR / PCR % context (FTC §260.12).",
  "clean coal":
    "High-scrutiny transitional/fossil framing that risks contradiction against absolute Scope 1 combustion emissions.",
  "water-wise":
    "Should align with audited water withdrawal (KL), recycling rate, or Zero Liquid Discharge (ZLD) disclosures (BRSR P6 E3/E4).",
  "water-positive":
    "Requires volumetric water replenishment audit demonstrating recharge exceeds operational withdrawal.",
  "green operations":
    "Must be grounded in verified facility energy mix, emissions intensity, effluent treatment, and waste/EPR compliance.",
  "green manufacturing":
    "Requires verifiable plant-level renewable energy share, ZLD/effluent treatment, and emission abatement disclosures.",
};

export const CATEGORY_A_BUZZWORDS: BuzzwordEntry[] = BUZZWORDS_500.map((item) => {
  const lower = item.term.toLowerCase();
  const specific = SPECIFIC_TERM_OVERRIDES[lower];
  return {
    id: item.id,
    term: item.term,
    sector: item.sector,
    subcategory: SECTOR_TO_SUBCATEGORY[item.sector],
    regulatoryRisk: specific ?? SECTOR_RISK_SUMMARIES[item.sector],
  };
});
