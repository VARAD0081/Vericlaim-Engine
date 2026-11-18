import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  detectClaimIntentDomains,
  type CorporateDisclosureContext,
} from "../src/lib/analyzer.ts";
import type {
  BuzzwordEntry,
  CategoryBMatch,
  CrossVerificationFinding,
  EvidenceCategory,
  JurisdictionId,
  StatutoryCheckItem,
} from "../src/types/audit.ts";
import { findEuCsrdRecord } from "./data/euCsrdDatabase.ts";
import { findSebiBrsrRecord } from "./data/sebiBrsrDatabase.ts";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEC_IDENTITY =
  process.env.SEC_EDGAR_IDENTITY ||
  "TheVeriClaimEngine WoxsenResearch varadr200811@gmail.com";

export interface JurisdictionRouterOutput {
  corporateIdentifier?: string;
  needsDynamicResearch?: boolean;
  point2Summary: string;
  statutoryUpdates: {
    code: string;
    status: EvidenceCategory;
    finding: string;
  }[];
  point3Summary: string;
  point3Status: EvidenceCategory;
  corporateFindings: CrossVerificationFinding[];
  disclosureContext: CorporateDisclosureContext;
}

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SecEdgarResult {
  found: boolean;
  source: "edgartools" | "sec-edgar-rest";
  cik?: string;
  name?: string;
  tickers?: string[];
  sicDescription?: string;
  latest10K?: {
    form: string;
    filingDate: string;
    reportDate: string;
    accessionNumber: string;
    url: string;
    climateKeywordsFound: string[];
  } | null;
  xbrlFacts?: Record<string, { value: number | null; unit: string; end: string }>;
}

let cachedSecTickers: SecTickerEntry[] | null = null;
let cachedSecTickersAt = 0;
const secEntityCache = new Map<string, { data: SecEdgarResult; storedAt: number }>();

const IMPOSSIBLE_ABSOLUTE_TERMS = new Set([
  "chemical-free",
  "zero-impact",
  "guilt-free",
  "clean coal",
  "100% natural",
]);

function hasImpossibleAbsoluteClaim(categoryAMatches: BuzzwordEntry[]): boolean {
  return categoryAMatches.some((b) =>
    IMPOSSIBLE_ABSOLUTE_TERMS.has(b.term.toLowerCase())
  );
}

async function getSecTickers(): Promise<SecTickerEntry[]> {
  if (cachedSecTickers && Date.now() - cachedSecTickersAt < 1000 * 60 * 60) {
    return cachedSecTickers;
  }
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_IDENTITY, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`SEC ticker directory returned HTTP ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, SecTickerEntry>;
  cachedSecTickers = Object.values(raw);
  cachedSecTickersAt = Date.now();
  return cachedSecTickers;
}

function formatUsdCompact(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString("en-US")}`;
}

async function querySecViaPythonEdgartools(company: string): Promise<SecEdgarResult | null> {
  try {
    const scriptPath = path.resolve(__dirname, "..", "scripts", "sec_edgar_lookup.py");
    const { stdout } = await execFileAsync("python3", [scriptPath, company], {
      timeout: 12000,
      env: { ...process.env, SEC_EDGAR_IDENTITY: SEC_IDENTITY },
    });
    const parsed = JSON.parse(stdout.trim()) as SecEdgarResult & { fallbackRequired?: boolean };
    if (parsed.fallbackRequired || !parsed.found) return null;
    return parsed;
  } catch {
    return null;
  }
}

const US_COMPANY_TICKER_ALIASES: Record<string, string> = {
  apple: "AAPL",
  microsoft: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  meta: "META",
  facebook: "META",
  tesla: "TSLA",
  nike: "NKE",
  "coca-cola": "KO",
  "coca cola": "KO",
  coke: "KO",
  pepsi: "PEP",
  pepsico: "PEP",
  starbucks: "SBUX",
  walmart: "WMT",
  exxon: "XOM",
  exxonmobil: "XOM",
  chevron: "CVX",
  ford: "F",
  "general motors": "GM",
  gm: "GM",
  ibm: "IBM",
  intel: "INTC",
  nvidia: "NVDA",
  "procter & gamble": "PG",
  "p&g": "PG",
  "johnson & johnson": "JNJ",
  netflix: "NFLX",
  disney: "DIS",
  boeing: "BA",
  salesforce: "CRM",
  adobe: "ADBE",
};

interface IndustryBaselineSpec {
  sectorName: string;
  typicalReporting: string;
  commonGaps: string;
}

function inferIndustryBaseline(company: string, claim: string): IndustryBaselineSpec {
  const combined = `${company} ${claim}`.toLowerCase();
  if (/\b(patagonia|nike|adidas|zara|h&m|uniqlo|apparel|fashion|textile|cotton|garment|shoe|footwear)\b/i.test(combined)) {
    return {
      sectorName: "Apparel, Footwear & Textiles",
      typicalReporting:
        "Companies in this sector commonly publish annual Impact/ESG Reports disclosing Tier 1–2 facility energy, preferred/recycled fiber shares (e.g., rPET, organic cotton), and Higg Index or SBTi targets.",
      commonGaps:
        "Frequent transparency gaps involve Tier 3–4 raw-material Scope 3 emissions, dye-house water discharge boundaries, and textile end-of-life recyclability proof.",
    };
  }
  if (/\b(coca|pepsi|starbucks|nestl|zomato|swiggy|food|beverage|dairy|coffee|tea|snack|bottle|milk)\b/i.test(combined)) {
    return {
      sectorName: "Food, Beverage & Consumer Packaging",
      typicalReporting:
        "Major food and beverage brands typically disclose packaging PCR %, CPCB/regional EPR plastic recovery totals, water stewardship ratios, and FLAG agricultural Scope 3 targets.",
      commonGaps:
        "Common scrutiny areas include multi-layer plastic (MLP) actual vs. theoretical recyclability and scope boundaries for agricultural land-use emissions.",
    };
  }
  if (/\b(steel|cement|ultratech|tata steel|jsw|arcelor|mining|aluminum|hindalco|vedanta|metal)\b/i.test(combined)) {
    return {
      sectorName: "Heavy Industry, Metals & Materials",
      typicalReporting:
        "Heavy industrial enterprises generally report absolute Scope 1 & 2 tCO2e intensity per tonne of output, captive vs. renewable power share, slag/fly-ash circularity, and ZLD effluent metrics.",
      commonGaps:
        "Key disclosure gaps often center on process-emission decarbonization timelines ('green steel'/'low-carbon cement' thresholds) and coal/coke reliance.",
    };
  }
  if (/\b(tesla|ford|bmw|toyota|hyundai|maruti|indigo|airline|aviation|ev|vehicle|auto|mobility)\b/i.test(combined)) {
    return {
      sectorName: "Automotive, Mobility & Aviation",
      typicalReporting:
        "Transport and mobility companies typically disclose fleet tailpipe/CO2 intensity, manufacturing plant renewable electricity share, and battery/ELV recycling compliance.",
      commonGaps:
        "Frequent greenwashing gaps occur when 'zero-emission' claims omit grid electricity mix, battery mineral Scope 3 footprints, or aviation offset quality.",
    };
  }
  if (/\b(google|microsoft|apple|meta|infosys|tcs|wipro|hcl|tech mahindra|cloud|software|ai|data center)\b/i.test(combined)) {
    return {
      sectorName: "Technology, Cloud & Electronics",
      typicalReporting:
        "Technology companies commonly disclose Scope 2 renewable PPA/I-REC coverage, data-center PUE and water cooling metrics, and e-waste recycling programs.",
      commonGaps:
        "Primary transparency gaps involve Scope 3 upstream semiconductor manufacturing emissions, AI compute energy growth, and market-based vs. hourly renewable matching.",
    };
  }
  if (/\b(paint|chemical|basf|pidilite|pharma|cipla|sun pharma|coating|solvent|cosmetic|skincare)\b/i.test(combined)) {
    return {
      sectorName: "Chemicals, Coatings & Formulations",
      typicalReporting:
        "Chemical and formulation manufacturers generally report hazardous waste co-processing, ZLD water treatment, VOC reduction programs, and BRSR/GRI chemical safety disclosures.",
      commonGaps:
        "Regulatory scrutiny commonly targets unqualified 'chemical-free' or 'non-toxic' wording lacking g/L VOC thresholds or OECD ecotoxicity boundaries.",
    };
  }
  if (/\b(ikea|walmart|amazon|flipkart|target|retail|furniture|timber|wood)\b/i.test(combined)) {
    return {
      sectorName: "Retail, Home Goods & Supply Chain",
      typicalReporting:
        "Large retailers typically publish Scope 3 supply-chain engagement metrics, FSC/PEFC certified timber sourcing shares, and fulfillment packaging reduction targets.",
      commonGaps:
        "Common gaps include unverified 'sustainably sourced' supplier percentages and downstream logistics emissions exclusions.",
    };
  }
  return {
    sectorName: "Corporate & Commercial Enterprise",
    typicalReporting:
      "Publicly accountable enterprises typically communicate environmental performance through annual ESG/Sustainability Reports, BRSR/CSRD/CDP disclosures, or ISO 14001/14040 certifications.",
    commonGaps:
      "Standard transparency gaps arise when consumer-facing claims omit baseline years, Scope 1–3 boundaries, or named third-party verification standards.",
  };
}

function buildFluidStatutoryUpdates(
  company: string,
  claim: string,
  jurisdiction: JurisdictionId,
  categoryAMatches: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[]
): JurisdictionRouterOutput["statutoryUpdates"] {
  const entity = company.trim() || "this entity";
  const industry = inferIndustryBaseline(entity, claim);
  const impossibleAbsolute = hasImpossibleAbsoluteClaim(categoryAMatches);
  const hasAnyMetrics = categoryBMatches.length > 0;

  if (jurisdiction === "india") {
    return [
      {
        code: "BRSR-P6-E1",
        status: categoryBMatches.some((m) => m.category === "Resource Metric")
          ? "Supporting"
          : "Inconclusive",
        finding: `Preliminary ${industry.sectorName} baseline: ${entity}'s operational energy claims require verification against SEBI BRSR P6 E1 (renewable vs. non-renewable Joules/kWh split). ${industry.typicalReporting}`,
      },
      {
        code: "BRSR-P6-E3/E4",
        status: /\b(kl|zld|zero\s+liquid\s+discharge)\b/i.test(claim) ? "Supporting" : "Inconclusive",
        finding: `Preliminary water context: ${industry.sectorName} disclosures under BRSR P6 E3/E4 track KL water withdrawal and ZLD effluent reuse; facility-level audit confirmation for ${entity} is recommended.`,
      },
      {
        code: "BRSR-P6-E6/E7",
        status: categoryBMatches.some((m) => m.category === "Emissions")
          ? "Supporting"
          : "Inconclusive",
        finding: `Preliminary GHG context: Evaluating ${entity}'s climate posture requires cross-checking Scope 1 & Scope 2 tCO2e disclosures in annual ESG/BRSR filings. ${industry.commonGaps}`,
      },
      {
        code: "BRSR-P6-E9",
        status: categoryBMatches.some(
          (m) => m.category === "Circularity / PCR" || m.category === "EPR Compliance"
        )
          ? "Supporting"
          : "Inconclusive",
        finding: `Preliminary waste & EPR context: ${industry.sectorName} entities substantiate packaging/waste claims via CPCB EPR registration totals and PCR % disclosures.`,
      },
      {
        code: "CCPA-2024 / ASCI",
        status: impossibleAbsolute
          ? "Contradictory"
          : hasAnyMetrics && categoryAMatches.length === 0
          ? "Supporting"
          : "Inconclusive",
        finding: impossibleAbsolute
          ? `Claim includes absolute wording scrutinized under CCPA Greenwashing Guidelines (2024) & ASCI regardless of sector context.`
          : `Evaluated against CCPA 2024 & ASCI Green Claims rules for ${industry.sectorName}: ${industry.commonGaps}`,
      },
    ];
  }

  if (jurisdiction === "eu") {
    const hasOffsetOnlyClaim = /\b(carbon[- ]neutral|climate[- ]neutral|climate[- ]positive|net[- ]zero)\b/i.test(
      claim
    );
    const hasCircularOrClimateFocus = /\b(ev|electric|emission|carbon|decarbon|recycl|circular|timber|renewable|energy|battery|efficiency)\b/i.test(
      claim
    );
    return [
      {
        code: "EU-GCD-ART3",
        status: /\b(lca|iso\s*14040|pef)\b/i.test(claim)
          ? "Supporting"
          : hasCircularOrClimateFocus && !impossibleAbsolute
          ? "Partially Verified"
          : "Inconclusive",
        finding: /\b(lca|iso\s*14040|pef)\b/i.test(claim)
          ? `Claim references LCA / ISO 14040 / PEF methodology aligned with EU Green Claims Directive Art. 3.`
          : `${industry.sectorName} CSRD Benchmark (Directive COM/2023/166): ${entity}'s directional claim aligns with EU CSRD lifecycle disclosure pathways; confirm ISO 14040 / PEF product boundary in its annual Sustainability Report.`,
      },
      {
        code: "EU-GCD-ART3-OFF",
        status: hasOffsetOnlyClaim
          ? "Contradictory"
          : hasCircularOrClimateFocus
          ? "Partially Verified"
          : "Inconclusive",
        finding: hasOffsetOnlyClaim
          ? "Directive (EU) 2024/825 (EmpCo) restricts 'carbon-neutral' or 'climate-neutral' product claims reliant on carbon offsetting."
          : `ESRS E1 Climate Alignment: ${entity} operates within EU CSRD Scope 1–3 & 2030/2050 decarbonization reporting separating direct abatement from offsets.`,
      },
      {
        code: "EU-EMPCO-GEN",
        status:
          impossibleAbsolute || hasOffsetOnlyClaim
            ? "Contradictory"
            : hasAnyMetrics && categoryAMatches.length === 0
            ? "Supporting"
            : hasCircularOrClimateFocus
            ? "Partially Verified"
            : "Inconclusive",
        finding:
          impossibleAbsolute || hasOffsetOnlyClaim
            ? `Under EU EmpCo (2024/825) for ${industry.sectorName}: absolute or offset-only claims are restricted without full lifecycle qualification.`
            : `Under EU EmpCo (2024/825) for ${industry.sectorName}: ${industry.commonGaps} Pair marketing headlines with CSRD report references.`,
      },
      {
        code: "EU-GCD-ART10",
        status: /\b(iso\s*14024|eu\s*ecolabel|isae\s*3000|verified\s+by|t[üu]v|fsc|sbti)\b/i.test(
          claim
        )
          ? "Supporting"
          : hasCircularOrClimateFocus && !impossibleAbsolute
          ? "Partially Verified"
          : "Inconclusive",
        finding: `CSRD Assurance Benchmark (EU GCD Art. 10): Large EU enterprises publish ISAE 3000 / TÜV / statutory sustainability assurance alongside ${entity}'s annual ESG disclosures; verify SKU-level conformity certificate.`,
      },
    ];
  }

  return [
    {
      code: "FTC-260.4",
      status: impossibleAbsolute
        ? "Contradictory"
        : hasAnyMetrics && categoryAMatches.length === 0
        ? "Supporting"
        : "Inconclusive",
      finding: `Preliminary FTC §260.4 assessment for ${entity} (${industry.sectorName}): ${industry.typicalReporting} ${industry.commonGaps}`,
    },
    {
      code: "FTC-260.5",
      status: categoryBMatches.some((m) => m.category === "Emissions")
        ? "Supporting"
        : "Inconclusive",
      finding: `Preliminary emissions context: Under FTC §260.5, carbon and emissions statements by ${entity} require scientific GHG Protocol accounting separating reductions from offsets.`,
    },
    {
      code: "FTC-260.8",
      status: /\b(biodegradable|compostable|degradable)\b/i.test(claim)
        ? /\b(en\s*13432|astm\s*d6400|iso\s*17088)\b/i.test(claim)
          ? "Supporting"
          : "Inconclusive"
        : "Inconclusive",
      finding: /\b(biodegradable|compostable|degradable)\b/i.test(claim)
        ? `FTC §260.8 requires scientific proof of complete natural breakdown within 1 year under customary disposal.`
        : `Not triggered directly by claim phrasing; applies only if ${entity} markets degradable or compostable product lines.`,
    },
    {
      code: "FTC-260.12/13",
      status: categoryBMatches.some((m) => m.category === "Circularity / PCR")
        ? "Supporting"
        : "Inconclusive",
      finding: `Preliminary circularity context: Under FTC §260.12/13, recyclable or recycled-content claims in ${industry.sectorName} must specify PCR weight % and practical collection availability.`,
    },
  ];
}

async function querySecViaOfficialRest(company: string): Promise<SecEdgarResult> {
  const query = company.trim();
  if (!query) return { found: false, source: "sec-edgar-rest" };

  const tickers = await getSecTickers();
  const upper = query.toUpperCase();
  const lower = query.toLowerCase();
  const aliasTicker = US_COMPANY_TICKER_ALIASES[lower];
  const normalizedQuery = lower
    .replace(/\b(inc\.?|corp\.?|corporation|co\.?|company|ltd\.?|llc|plc)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exactTicker = tickers.find(
    (t) => t.ticker.toUpperCase() === (aliasTicker ?? upper)
  );
  const exactTitle = tickers.find((t) => t.title.toLowerCase() === lower);
  const partialTitle = tickers.find((t) => {
    const cleanTitle = t.title
      .toLowerCase()
      .replace(/\b(inc\.?|corp\.?|corporation|co\.?|company|ltd\.?|llc|plc)\b/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (
      cleanTitle === normalizedQuery ||
      (normalizedQuery.length >= 3 && cleanTitle.includes(normalizedQuery))
    );
  });

  const match = exactTicker ?? exactTitle ?? partialTitle;
  if (!match) return { found: false, source: "sec-edgar-rest" };

  const cikPadded = String(match.cik_str).padStart(10, "0");
  const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
    headers: { "User-Agent": SEC_IDENTITY, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!subRes.ok) {
    throw new Error(`SEC submissions API returned HTTP ${subRes.status}`);
  }
  const subData = (await subRes.json()) as {
    name?: string;
    tickers?: string[];
    sicDescription?: string;
    filings?: {
      recent?: {
        form: string[];
        filingDate: string[];
        reportDate: string[];
        accessionNumber: string[];
        primaryDocument: string[];
      };
    };
  };

  const recent = subData.filings?.recent;
  let latest10K: SecEdgarResult["latest10K"] = null;

  if (recent) {
    const idx = recent.form.findIndex((f) => f === "10-K");
    if (idx !== -1) {
      const acc = recent.accessionNumber[idx];
      const accNoDashes = acc.replace(/-/g, "");
      const doc = recent.primaryDocument[idx];
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${match.cik_str}/${accNoDashes}/${doc}`;

      const climateKeywordsFound: string[] = [];
      try {
        const docRes = await fetch(filingUrl, {
          headers: {
            "User-Agent": SEC_IDENTITY,
            Range: "bytes=0-350000",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (docRes.ok) {
          const snippet = await docRes.text();
          for (const kw of [
            "Scope 1",
            "Scope 2",
            "Scope 3",
            "greenhouse gas",
            "climate change",
            "renewable energy",
            "sustainability",
            "emissions",
          ]) {
            if (new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "i").test(snippet)) {
              climateKeywordsFound.push(kw);
            }
          }
        }
      } catch {
        // Optional 10-K body scan
      }

      latest10K = {
        form: "10-K",
        filingDate: recent.filingDate[idx],
        reportDate: recent.reportDate[idx],
        accessionNumber: acc,
        url: filingUrl,
        climateKeywordsFound,
      };
    }
  }

  const xbrlFacts: NonNullable<SecEdgarResult["xbrlFacts"]> = {};
  try {
    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`,
      {
        headers: { "User-Agent": SEC_IDENTITY, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (factsRes.ok) {
      const factsJson = (await factsRes.json()) as {
        facts?: {
          "us-gaap"?: Record<
            string,
            { units?: Record<string, { val?: number; end?: string; form?: string }[]> }
          >;
        };
      };
      const usGaap = factsJson.facts?.["us-gaap"] ?? {};
      for (const concept of [
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Assets",
        "NetIncomeLoss",
      ]) {
        const usdEntries = usGaap[concept]?.units?.USD;
        if (Array.isArray(usdEntries) && usdEntries.length > 0) {
          const annualEntries = usdEntries.filter(
            (e) => e.form === "10-K" && typeof e.val === "number"
          );
          const pool = annualEntries.length > 0 ? annualEntries : usdEntries;
          const sorted = [...pool].sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""));
          const latest = sorted[0];
          if (latest && typeof latest.val === "number") {
            xbrlFacts[concept] = {
              value: latest.val,
              unit: "USD",
              end: latest.end ?? "",
            };
          }
        }
      }
    }
  } catch {
    // Optional XBRL facts lookup
  }

  return {
    found: true,
    source: "sec-edgar-rest",
    cik: cikPadded,
    name: subData.name ?? match.title,
    tickers: subData.tickers ?? [match.ticker],
    sicDescription: subData.sicDescription ?? "",
    latest10K,
    xbrlFacts,
  };
}

async function resolveUsSecEdgar(
  company: string,
  claim: string,
  categoryAMatches: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[],
  hasCleanWatchdog: boolean
): Promise<JurisdictionRouterOutput> {
  const findings: CrossVerificationFinding[] = [];
  const statutoryUpdates: JurisdictionRouterOutput["statutoryUpdates"] = [];
  const intent = detectClaimIntentDomains(claim);
  const impossibleAbsolute = hasImpossibleAbsoluteClaim(categoryAMatches);

  const emptyContext: CorporateDisclosureContext = {
    hasVerifiedFiling: false,
    frameworkLabel: "US FTC Green Guides (16 CFR Part 260)",
    verifiedDomains: {
      climate: false,
      energy: false,
      water: false,
      circularity: false,
      chemicalSafety: false,
      corporateEsg: false,
    },
    hasCleanWatchdog,
  };

  if (!company.trim()) {
    return {
      point2Summary:
        "Evaluated against US FTC Green Guides (16 CFR Part 260) and SEC EDGAR 10-K reporting rules.",
      statutoryUpdates: [],
      point3Summary:
        "Enter a US company name or ticker (e.g., AAPL, MSFT, XOM, Nike) to retrieve official SEC EDGAR 10-K filings.",
      point3Status: "Missing",
      corporateFindings: [
        {
          topic: "SEC EDGAR 10-K Filing Lookup",
          status: "Missing",
          answer:
            "No US ticker or company name provided; official SEC EDGAR 10-K retrieval skipped.",
          sources: [],
        },
      ],
      disclosureContext: emptyContext,
    };
  }

  const secCacheKey = company.trim().toLowerCase().replace(/\s+/g, " ");
  let secData = secEntityCache.get(secCacheKey)?.data ?? null;
  if (!secData || Date.now() - (secEntityCache.get(secCacheKey)?.storedAt ?? 0) > 1000 * 60 * 60) {
    secData = await querySecViaPythonEdgartools(company);
    if (!secData) {
      try {
        secData = await querySecViaOfficialRest(company);
      } catch {
        secData = { found: false, source: "sec-edgar-rest" };
      }
    }
    secEntityCache.set(secCacheKey, { data: secData, storedAt: Date.now() });
  }

  if (secData.found && secData.latest10K) {
    const revFact =
      secData.xbrlFacts?.RevenueFromContractWithCustomerExcludingAssessedTax ??
      secData.xbrlFacts?.Revenues;
    const assetsFact = secData.xbrlFacts?.Assets;
    const netIncFact = secData.xbrlFacts?.NetIncomeLoss;

    const xbrlSummary = [
      revFact ? `Revenue (${revFact.end}): ${formatUsdCompact(revFact.value)}` : null,
      assetsFact ? `Total Assets (${assetsFact.end}): ${formatUsdCompact(assetsFact.value)}` : null,
      netIncFact ? `Net Income (${netIncFact.end}): ${formatUsdCompact(netIncFact.value)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const climateMentions = secData.latest10K.climateKeywordsFound;
    const isHighFossilEmitter =
      /\b(petroleum|oil|gas|coal|refin|crude)\b/i.test(secData.sicDescription ?? "") ||
      /\b(exxon|chevron|conocophillips|marathon|valero|halliburton|schlumberger)\b/i.test(
        secData.name ?? ""
      );

    const hasSecClimateBacking = climateMentions.length > 0 && !isHighFossilEmitter;
    const disclosureContext: CorporateDisclosureContext = {
      hasVerifiedFiling: true,
      frameworkLabel: `${secData.name} SEC Form 10-K (${secData.latest10K.filingDate})`,
      isHighFossilEmitter,
      verifiedDomains: {
        climate: hasSecClimateBacking,
        energy: climateMentions.some((k) => /renewable|sustainability|climate/i.test(k)) && !isHighFossilEmitter,
        water: climateMentions.some((k) => /sustainability/i.test(k)),
        circularity: climateMentions.some((k) => /sustainability/i.test(k)),
        chemicalSafety: !impossibleAbsolute && climateMentions.length > 0,
        corporateEsg: !impossibleAbsolute && !isHighFossilEmitter && climateMentions.length > 0,
      },
      hasCleanWatchdog,
    };

    const filingSources = [
      {
        title: `SEC EDGAR Form 10-K (${secData.latest10K.filingDate}) — ${secData.name}`,
        url: secData.latest10K.url,
      },
    ];

    findings.push({
      topic: `Official SEC EDGAR Form 10-K (${secData.tickers?.join(", ") || secData.cik})`,
      status: climateMentions.length > 0 ? "Supporting" : "Inconclusive",
      answer: `${secData.name} (CIK ${secData.cik}${
        secData.sicDescription ? `, ${secData.sicDescription}` : ""
      }) filed Form 10-K on ${secData.latest10K.filingDate} (period ending ${
        secData.latest10K.reportDate
      }, Accession ${secData.latest10K.accessionNumber}). ${
        xbrlSummary ? `XBRL Financial Context: ${xbrlSummary}. ` : ""
      }${
        climateMentions.length > 0
          ? `10-K filing explicitly discloses sustainability/climate sections covering: ${climateMentions.join(", ")}.`
          : "Form 10-K retrieved; no explicit Scope 1/2 or climate keywords matched in the opening sections."
      }`,
      sources: filingSources,
    });

    const contextuallyAligned =
      !impossibleAbsolute &&
      !isHighFossilEmitter &&
      hasCleanWatchdog &&
      (categoryBMatches.length > 0 || climateMentions.length > 0);

    findings.push({
      topic: "FTC Green Guides (16 CFR Part 260) Semantic Cross-Verification",
      status: impossibleAbsolute
        ? "Contradictory"
        : isHighFossilEmitter && intent.climate
        ? "Contradictory"
        : contextuallyAligned
        ? "Supporting"
        : categoryAMatches.length > 0
        ? "Inconclusive"
        : "Missing",
      answer: impossibleAbsolute
        ? `Under FTC Green Guides (16 CFR Part 260), absolute terms (${categoryAMatches
            .filter((b) => IMPOSSIBLE_ABSOLUTE_TERMS.has(b.term.toLowerCase()))
            .map((b) => b.term)
            .join(", ")}) cannot be substantiated solely by general corporate filings.`
        : isHighFossilEmitter && intent.climate
        ? `Entity SIC classification (${secData.sicDescription || "Fossil/Energy"}) indicates high Scope 1/3 hydrocarbon intensity; climate claims require strict quantitative abatement boundaries under FTC §260.5.`
        : contextuallyAligned
        ? `Conceptual intent of the claim aligns with ${secData.name}'s verified SEC Form 10-K disclosures (${secData.latest10K.filingDate}) and clean public compliance standing. Standard industry terms are contextually supported, though consumer-facing labels benefit from explicit product-level qualifiers under FTC §260.4.`
        : `Evaluated against FTC Green Guides (16 CFR Part 260); marketing terms require clear scientific qualification.`,
      sources: [
        {
          title: "FTC Green Guides (16 CFR Part 260)",
          url: "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260",
        },
        ...filingSources,
      ],
    });

    if (contextuallyAligned) {
      statutoryUpdates.push({
        code: "FTC-260.4",
        status: "Supporting",
        finding: `${secData.name}'s SEC Form 10-K (${secData.latest10K.filingDate}) and clean public records provide contextual backing for its sustainability positioning; maintain clear consumer qualifiers per FTC §260.4.`,
      });
    }

    if (climateMentions.some((k) => /scope|emission|greenhouse|climate|sustainability/i.test(k))) {
      statutoryUpdates.push({
        code: "FTC-260.5",
        status:
          isHighFossilEmitter && !categoryBMatches.some((m) => m.category === "Emissions")
            ? "Contradictory"
            : hasSecClimateBacking || categoryBMatches.some((m) => m.category === "Emissions")
            ? "Supporting"
            : "Inconclusive",
        finding: `SEC Form 10-K (${secData.latest10K.filingDate}) includes climate/emissions disclosures (${climateMentions.join(
          ", "
        )}); marketing claims must separate direct abatement from carbon offsets under FTC §260.5.`,
      });
    }

    return {
      corporateIdentifier: `${secData.tickers?.join(", ") || "SEC"} · CIK ${secData.cik}`,
      point2Summary: `Contextually cross-verified against FTC Green Guides (16 CFR Part 260) and ${secData.name}'s official SEC EDGAR Form 10-K (${secData.latest10K.filingDate}).`,
      statutoryUpdates,
      point3Summary: `Pulled official SEC EDGAR Form 10-K and XBRL financial facts for ${secData.name} (CIK ${secData.cik}).`,
      point3Status: contextuallyAligned ? "Supporting" : isHighFossilEmitter ? "Contradictory" : "Inconclusive",
      corporateFindings: findings,
      disclosureContext,
    };
  }

  const industry = inferIndustryBaseline(company, claim);
  return {
    corporateIdentifier: `${industry.sectorName} · US FTC Scope`,
    needsDynamicResearch: true,
    point2Summary: `Evaluated ${company} against US FTC Green Guides (16 CFR Part 260) and ${industry.sectorName} reporting norms.`,
    statutoryUpdates: buildFluidStatutoryUpdates(
      company,
      claim,
      "us",
      categoryAMatches,
      categoryBMatches
    ),
    point3Summary: `Generated preliminary ${industry.sectorName} sustainability baseline for "${company}" under FTC Green Guides (16 CFR Part 260).`,
    point3Status: "Inconclusive",
    corporateFindings: [
      {
        topic: `Preliminary Industry & Sustainability Profile — ${company}`,
        status: "Inconclusive",
        answer: `${company} (${industry.sectorName}) did not match a direct US SEC Form 10-K ticker entry (entity may be private, subsidiary, or non-US). ${industry.typicalReporting} ${industry.commonGaps}`,
        sources: [
          {
            title: "FTC Green Guides (16 CFR Part 260)",
            url: "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260",
          },
        ],
      },
    ],
    disclosureContext: emptyContext,
  };
}

function resolveEuCsrd(
  company: string,
  claim: string,
  categoryAMatches: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[],
  hasCleanWatchdog: boolean
): JurisdictionRouterOutput {
  const euRecord = findEuCsrdRecord(company);
  const findings: CrossVerificationFinding[] = [];
  const statutoryUpdates: JurisdictionRouterOutput["statutoryUpdates"] = [];
  const intent = detectClaimIntentDomains(claim);
  const impossibleAbsolute = hasImpossibleAbsoluteClaim(categoryAMatches);

  const hasLcaCitation =
    /\b(lca|life[- ]cycle\s+assessment|iso\s*14040|iso\s*14044|pef|pefcr)\b/i.test(claim);
  const hasThirdPartyVerification =
    /\b(iso\s*14024|iso\s*14025|eu\s*ecolabel|t[üu]v|isae\s*3000|aa1000|epd|pep\s*ecopassport|assured\s+by|verified\s+by)\b/i.test(
      claim
    );
  const hasPureOffsetClaim = /\b(carbon[- ]neutral|climate[- ]neutral|climate[- ]positive|carbon[- ]offset|offset[- ]neutral)\b/i.test(
    claim
  );
  const hasNetZeroClaim = /\bnet[- ]zero\b/i.test(claim);
  const hasOffsetOnlyClaim = hasPureOffsetClaim || hasNetZeroClaim;

  if (euRecord) {
    const isHighFossilEmitter = /shell|totalenergies/i.test(euRecord.companyName);
    const hasCorporateLcaProgram = /iso\s*14040|pef|pep\s*ecopassport|epd/i.test(
      euRecord.lcaMethodology
    );
    const hasCorporateVerifier = /isae\s*3000|assurance|t[üu]v|verifier|ey|pwc|kpmg|deloitte|mazars/i.test(
      euRecord.thirdPartyVerifier
    );
    const hasCorporateSbtPathway =
      /sbti|science[- ]based|scope\s*1,\s*2|decarbonization|2030|2050/i.test(
        `${euRecord.esrsE1Climate} ${euRecord.csrdReportingScope}`
      );

    const disclosureContext: CorporateDisclosureContext = {
      hasVerifiedFiling: true,
      frameworkLabel: `${euRecord.companyName} (${euRecord.csrdReportingScope})`,
      isHighFossilEmitter,
      verifiedDomains: {
        climate: !isHighFossilEmitter,
        energy: !isHighFossilEmitter,
        water: /water|esrs\s*e3/i.test(`${euRecord.csrdReportingScope} ${euRecord.esrsE5Circularity}`),
        circularity: /esrs\s*e5|pcr|circular|recycl|rpet/i.test(
          `${euRecord.csrdReportingScope} ${euRecord.esrsE5Circularity}`
        ),
        chemicalSafety: !impossibleAbsolute && hasCorporateVerifier,
        corporateEsg: !isHighFossilEmitter && !impossibleAbsolute && hasCorporateVerifier,
      },
      hasCleanWatchdog,
    };

    const empcoConflict =
      (isHighFossilEmitter && (intent.climate || hasOffsetOnlyClaim)) ||
      (hasPureOffsetClaim && !/\b(scope\s*[123]|sbti|iso\s*14068)\b/i.test(claim)) ||
      (hasNetZeroClaim &&
        !hasCorporateSbtPathway &&
        !/\b(scope\s*[123]|sbti|iso\s*14068)\b/i.test(claim));

    statutoryUpdates.push({
      code: "EU-GCD-ART3",
      status: hasLcaCitation
        ? "Supporting"
        : !empcoConflict && !impossibleAbsolute && hasCorporateLcaProgram && hasCleanWatchdog
        ? "Supporting"
        : hasCorporateLcaProgram && !impossibleAbsolute
        ? "Partially Verified"
        : "Inconclusive",
      finding: hasLcaCitation
        ? `Claim cites recognized Life Cycle Assessment (LCA / ISO 14040 / PEF) substantiation required by EU Green Claims Directive Art. 3 (${euRecord.officialReferenceUrl}).`
        : hasCorporateLcaProgram && !impossibleAbsolute
        ? `${euRecord.companyName} publishes an audited LCA framework (${euRecord.lcaMethodology}) in its Sustainability Report (${euRecord.officialReferenceUrl}), supporting the directional intent under CSRD/GCD Art. 3.`
        : `Evaluated against mandatory ISO 14040 / PEF LCA rules (${euRecord.officialReferenceUrl}): ${euRecord.lcaMethodology}`,
    });

    statutoryUpdates.push({
      code: "EU-GCD-ART10",
      status: hasThirdPartyVerification
        ? "Supporting"
        : !empcoConflict && !impossibleAbsolute && hasCorporateVerifier && hasCleanWatchdog
        ? "Supporting"
        : hasCorporateVerifier && !impossibleAbsolute
        ? "Partially Verified"
        : "Inconclusive",
      finding: hasThirdPartyVerification
        ? `Claim references accredited third-party verification aligned with EU GCD Art. 10 (${euRecord.officialReferenceUrl}).`
        : hasCorporateVerifier && !impossibleAbsolute
        ? `${euRecord.companyName} maintains certified third-party sustainability assurance (${euRecord.thirdPartyVerifier} — ${euRecord.officialReferenceUrl}); product labels benefit from explicit ex-ante EU GCD Art. 10 referencing.`
        : `No accredited third-party verifier cited in claim text; review corporate assurance at ${euRecord.officialReferenceUrl}.`,
    });

    statutoryUpdates.push({
      code: "EU-GCD-ART3-OFF",
      status: empcoConflict
        ? "Contradictory"
        : !isHighFossilEmitter && disclosureContext.verifiedDomains.climate && hasCleanWatchdog
        ? "Supporting"
        : !isHighFossilEmitter && disclosureContext.verifiedDomains.climate
        ? "Partially Verified"
        : "Partially Verified",
      finding: empcoConflict
        ? `Directive (EU) 2024/825 (EmpCo) restricts 'carbon-neutral' or offset-reliant claims without direct abatement breakdown (${euRecord.officialReferenceUrl}).`
        : `Decarbonization & ESRS E1 Alignment (${euRecord.officialReferenceUrl}): ${euRecord.esrsE1Climate}`,
    });

    const hasUnqualifiedGenericTerms = categoryAMatches.length > 0 && categoryBMatches.length === 0;
    statutoryUpdates.push({
      code: "EU-EMPCO-GEN",
      status:
        impossibleAbsolute || (isHighFossilEmitter && (empcoConflict || intent.climate))
          ? "Contradictory"
          : !isHighFossilEmitter &&
            !empcoConflict &&
            hasCleanWatchdog &&
            hasCorporateVerifier &&
            !hasUnqualifiedGenericTerms
          ? "Supporting"
          : !isHighFossilEmitter && !empcoConflict && hasCorporateVerifier
          ? "Partially Verified"
          : "Inconclusive",
      finding:
        impossibleAbsolute || (isHighFossilEmitter && (empcoConflict || intent.climate))
          ? `Directive (EU) 2024/825 (EmpCo) bars unqualified generic or offset-neutral claims (${categoryAMatches
              .map((b) => b.term)
              .join(", ") || "claim rhetoric"}). ${euRecord.directiveComplianceNote}`
          : `${euRecord.companyName}'s certified CSRD/ESRS disclosures (${euRecord.officialReferenceUrl}) directionally support the claim; pair consumer phrasing with explicit model/SKU lifecycle qualifiers under EmpCo.`,
    });

    const corporateAligned =
      !impossibleAbsolute && !empcoConflict && hasCleanWatchdog && hasCorporateVerifier;
    const partiallyAligned =
      !impossibleAbsolute && !isHighFossilEmitter && hasCorporateVerifier;

    findings.push({
      topic: `EU CSRD / ESRS Disclosure & Decarbonization Pathway — ${euRecord.companyName}`,
      status:
        isHighFossilEmitter && intent.climate
          ? "Contradictory"
          : hasCleanWatchdog
          ? "Supporting"
          : "Partially Verified",
      answer: `${euRecord.csrdReportingScope}. Climate & Transition Pathway (ESRS E1): ${euRecord.esrsE1Climate} Circularity (ESRS E5): ${euRecord.esrsE5Circularity}`,
      sources: [
        {
          title: `${euRecord.companyName} Sustainability Reporting`,
          url: euRecord.officialReferenceUrl,
        },
      ],
    });
    findings.push({
      topic: "Mandatory LCA & Third-Party Verification Standards",
      status: corporateAligned
        ? "Supporting"
        : empcoConflict || (isHighFossilEmitter && intent.climate)
        ? "Contradictory"
        : partiallyAligned
        ? "Partially Verified"
        : "Inconclusive",
      answer: `LCA Rule: ${euRecord.lcaMethodology} Verification Standard: ${euRecord.thirdPartyVerifier} Compliance Note: ${euRecord.directiveComplianceNote}`,
      sources: [
        {
          title: `${euRecord.companyName} Official Report`,
          url: euRecord.officialReferenceUrl,
        },
        {
          title: "EU Green Claims Directive (COM/2023/166)",
          url: "https://environment.ec.europa.eu/topics/circular-economy/green-claims_en",
        },
      ],
    });

    return {
      corporateIdentifier: `${euRecord.headquarters} · ${euRecord.sector}`,
      point2Summary: `Mapped ${euRecord.companyName} against EU CSRD (ESRS E1–E5), 2030/2050 transition pathways, LCA rules (Art. 3), and third-party assurance (Art. 10).`,
      statutoryUpdates,
      point3Summary: `Cross-verified EU CSRD sustainability disclosures and independent LCA/assurance standards for ${euRecord.companyName}.`,
      point3Status: corporateAligned
        ? "Supporting"
        : empcoConflict || impossibleAbsolute
        ? "Contradictory"
        : partiallyAligned
        ? "Partially Verified"
        : "Inconclusive",
      corporateFindings: findings,
      disclosureContext,
    };
  }

  // No pre-indexed EU record matched — build fluid qualitative industry baseline & flag for Gemini research
  const industry = inferIndustryBaseline(company, claim);
  const hasGenericTerms = categoryAMatches.length > 0;
  const fluidUpdates = buildFluidStatutoryUpdates(
    company,
    claim,
    "eu",
    categoryAMatches,
    categoryBMatches
  );

  const hasDirectionalSupport = fluidUpdates.some((u) => u.status === "Partially Verified" || u.status === "Supporting");

  findings.push({
    topic: `Preliminary EU CSRD & Industry Baseline — ${company || "Target Entity"}`,
    status:
      hasLcaCitation && hasThirdPartyVerification && !hasGenericTerms
        ? "Supporting"
        : hasDirectionalSupport && !impossibleAbsolute && !hasOffsetOnlyClaim
        ? "Partially Verified"
        : "Inconclusive",
    answer: `Evaluated ${company || "this entity"} (${industry.sectorName}) against EU CSRD (ESRS E1–E5), EU Green Claims Directive Art. 3/Art. 10, and EmpCo (2024/825). ${industry.typicalReporting} ${industry.commonGaps}`,
    sources: [
      {
        title: "EU Green Claims Directive Overview",
        url: "https://environment.ec.europa.eu/topics/circular-economy/green-claims_en",
      },
    ],
  });

  const overallP3Status: EvidenceCategory =
    hasLcaCitation && hasThirdPartyVerification && !hasGenericTerms
      ? "Supporting"
      : impossibleAbsolute || (hasOffsetOnlyClaim && categoryBMatches.length === 0)
      ? "Contradictory"
      : hasDirectionalSupport
      ? "Partially Verified"
      : "Inconclusive";

  return {
    corporateIdentifier: `${industry.sectorName} · EU CSRD Scope`,
    needsDynamicResearch: true,
    point2Summary: `Evaluated ${company || "entity"} against EU CSRD (ESRS E1–E5), transition pathways, and ${industry.sectorName} LCA/assurance benchmarks.`,
    statutoryUpdates: fluidUpdates,
    point3Summary: `Evaluated ${industry.sectorName} EU CSRD & Green Claims Directive alignment for ${company || "entity"}.`,
    point3Status: overallP3Status,
    corporateFindings: findings,
    disclosureContext: {
      hasVerifiedFiling: false,
      frameworkLabel: "EU Green Claims Directive & CSRD",
      verifiedDomains: {
        climate: false,
        energy: false,
        water: false,
        circularity: false,
        chemicalSafety: false,
        corporateEsg: false,
      },
      hasCleanWatchdog,
    },
  };
}

function resolveIndiaSebiBrsr(
  company: string,
  claim: string,
  categoryAMatches: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[],
  hasCleanWatchdog: boolean
): JurisdictionRouterOutput {
  const brsrRecord = findSebiBrsrRecord(company);
  const findings: CrossVerificationFinding[] = [];
  const statutoryUpdates: JurisdictionRouterOutput["statutoryUpdates"] = [];
  const intent = detectClaimIntentDomains(claim);
  const impossibleAbsolute = hasImpossibleAbsoluteClaim(categoryAMatches);

  if (brsrRecord) {
    const isHighFossilEmitter = /\b(reliance|ntpc)\b/i.test(brsrRecord.companyName);
    const hasReasonableAssurance = /assurance/i.test(brsrRecord.brsrAssurance);
    const hasHighRenewable =
      !isHighFossilEmitter &&
      (/\b(3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9])\s*%/i.test(
        brsrRecord.renewableEnergyPct
      ) ||
        /renewable/i.test(brsrRecord.renewableEnergyPct));
    const hasZldOrWaterReuse = /zld|zero\s+liquid\s+discharge|water\s+positive|treated|stp|etp/i.test(
      `${brsrRecord.waterTreatmentNote} ${brsrRecord.waterWithdrawalKL}`
    );
    const hasEprOrWaste = /epr|recycl|zero\s+waste|co-processing|fly\s+ash/i.test(
      brsrRecord.wasteAndEprNote
    );

    const fossilContradiction =
      isHighFossilEmitter &&
      (intent.climate || /\b(clean[- ]fuel|green[- ]fuel|green[- ]energy|clean[- ]energy|eco-friendly|zero[- ]emission)\b/i.test(claim)) &&
      !categoryBMatches.some((m) => m.category === "Emissions");

    const disclosureContext: CorporateDisclosureContext = {
      hasVerifiedFiling: true,
      frameworkLabel: `${brsrRecord.companyName} (${brsrRecord.reportingFY})`,
      isHighFossilEmitter,
      verifiedDomains: {
        climate: !isHighFossilEmitter && hasReasonableAssurance,
        energy: hasHighRenewable,
        water: hasZldOrWaterReuse,
        circularity: hasEprOrWaste,
        chemicalSafety: !impossibleAbsolute && hasReasonableAssurance && !isHighFossilEmitter,
        corporateEsg: !impossibleAbsolute && !fossilContradiction && hasReasonableAssurance,
      },
      hasCleanWatchdog,
    };

    findings.push({
      topic: `SEBI BRSR Principle 6 Disclosure — ${brsrRecord.companyName} (${brsrRecord.symbol})`,
      status: "Supporting",
      answer: `Reporting Cycle: ${brsrRecord.reportingFY} (CIN: ${brsrRecord.cin}). Scope 1 Emissions: ${brsrRecord.scope1EmissionsTco2e}. Scope 2 Emissions: ${brsrRecord.scope2EmissionsTco2e}. Renewable Energy: ${brsrRecord.renewableEnergyPct}. Water Withdrawal & Treatment: ${brsrRecord.waterWithdrawalKL} (${brsrRecord.waterTreatmentNote}). Waste & EPR: ${brsrRecord.wasteAndEprNote}. Assurance: ${brsrRecord.brsrAssurance}.`,
      sources: [
        {
          title: `${brsrRecord.companyName} BRSR / Sustainability Report`,
          url: brsrRecord.officialReferenceUrl,
        },
      ],
    });

    // Populate contextual status across ALL 5 BRSR P6 & CCPA/ASCI statutory indicators
    statutoryUpdates.push({
      code: "BRSR-P6-E1",
      status: disclosureContext.verifiedDomains.energy
        ? "Supporting"
        : isHighFossilEmitter
        ? "Inconclusive"
        : "Supporting",
      finding: `${brsrRecord.companyName} BRSR P6 E1 (${brsrRecord.reportingFY}) discloses ${brsrRecord.renewableEnergyPct} (${brsrRecord.brsrAssurance}).`,
    });

    statutoryUpdates.push({
      code: "BRSR-P6-E3/E4",
      status: hasZldOrWaterReuse ? "Supporting" : "Inconclusive",
      finding: `${brsrRecord.companyName} BRSR P6 E3/E4 reports ${brsrRecord.waterWithdrawalKL}; ${brsrRecord.waterTreatmentNote}.`,
    });

    statutoryUpdates.push({
      code: "BRSR-P6-E6/E7",
      status: fossilContradiction
        ? "Contradictory"
        : hasReasonableAssurance
        ? "Supporting"
        : "Inconclusive",
      finding: fossilContradiction
        ? `${brsrRecord.companyName} BRSR P6 E6/E7 reports Scope 1 of ${brsrRecord.scope1EmissionsTco2e} and Scope 2 of ${brsrRecord.scope2EmissionsTco2e}; broad climate/clean-energy marketing rhetoric contrasts with primary fossil intensity.`
        : `${brsrRecord.companyName} BRSR P6 E6/E7 discloses audited Scope 1 (${brsrRecord.scope1EmissionsTco2e}) and Scope 2 (${brsrRecord.scope2EmissionsTco2e}).`,
    });

    const packagingScrutinyNote = /mlp|multi-layer\s+plastic/i.test(brsrRecord.regulatoryNotes) &&
      /\b(recyclable|biodegradable)\b/i.test(claim) &&
      !categoryBMatches.some((m) => m.category === "Circularity / PCR");

    statutoryUpdates.push({
      code: "BRSR-P6-E9",
      status: packagingScrutinyNote
        ? "Inconclusive"
        : hasEprOrWaste
        ? "Supporting"
        : "Inconclusive",
      finding: `${brsrRecord.companyName} BRSR P6 E9 reports ${brsrRecord.wasteAndEprNote}.${
        packagingScrutinyNote
          ? " Product-level packaging claims still require explicit PCR % or recyclability boundary."
          : ""
      }`,
    });

    const ccpaContextuallySupported =
      !impossibleAbsolute &&
      !fossilContradiction &&
      hasReasonableAssurance &&
      hasCleanWatchdog;

    statutoryUpdates.push({
      code: "CCPA-2024 / ASCI",
      status:
        impossibleAbsolute || fossilContradiction
          ? "Contradictory"
          : ccpaContextuallySupported
          ? "Supporting"
          : "Inconclusive",
      finding: impossibleAbsolute
        ? `Claim includes unqualified absolute wording (${categoryAMatches
            .filter((b) => IMPOSSIBLE_ABSOLUTE_TERMS.has(b.term.toLowerCase()))
            .map((b) => b.term)
            .join(", ")}) scrutinized under CCPA Greenwashing Guidelines (2024) & ASCI regardless of enterprise filings.`
        : fossilContradiction
        ? `Broad climate/clean wording contrasts with ${brsrRecord.companyName}'s high-emission fossil profile under CCPA 2024.`
        : ccpaContextuallySupported
        ? `Conceptual intent aligns with ${brsrRecord.companyName}'s audited ${brsrRecord.reportingFY} BRSR Core disclosures (${brsrRecord.brsrAssurance}) and clean public watchdog record. Consumer labels should still display SKU-specific thresholds (e.g., g/L VOC or PCR %) per ASCI/CCPA best practices.`
        : `Verify consumer-facing qualifiers under CCPA 2024 & ASCI. ${brsrRecord.regulatoryNotes}`,
    });

    findings.push({
      topic: "SEBI BRSR, ASCI & CCPA Semantic Alignment Assessment",
      status:
        impossibleAbsolute || fossilContradiction
          ? "Contradictory"
          : ccpaContextuallySupported
          ? "Supporting"
          : "Inconclusive",
      answer:
        impossibleAbsolute || fossilContradiction
          ? `While ${brsrRecord.companyName} publishes BRSR Principle 6 data, the submitted claim contains high-risk absolute or contradictory rhetoric (${categoryAMatches
              .map((b) => b.term)
              .join(", ") || "unqualified claim"}) flagged under CCPA 2024 & ASCI. ${brsrRecord.regulatoryNotes}`
          : ccpaContextuallySupported
          ? `${brsrRecord.companyName}'s broader sustainability posture (${brsrRecord.renewableEnergyPct}; ${brsrRecord.waterTreatmentNote}; ${brsrRecord.wasteAndEprNote}) and clean compliance record substantively support the conceptual intent of the claim (${intent.activeDomains.join(", ")}). ${brsrRecord.regulatoryNotes}`
          : `Claim partially reflects ${brsrRecord.companyName}'s BRSR Principle 6 disclosures (${brsrRecord.reportingFY}); explicit product-level qualifiers are recommended under CCPA 2024. ${brsrRecord.regulatoryNotes}`,
      sources: [
        {
          title: "CCPA Greenwashing Guidelines (2024) & ASCI",
          url: "https://consumeraffairs.nic.in/",
        },
        {
          title: `${brsrRecord.companyName} BRSR Filing`,
          url: brsrRecord.officialReferenceUrl,
        },
      ],
    });

    return {
      corporateIdentifier: `${brsrRecord.symbol} · CIN ${brsrRecord.cin}`,
      point2Summary: `Contextually cross-verified against ${brsrRecord.companyName}'s audited ${brsrRecord.reportingFY} SEBI BRSR Principle 6 disclosures, ASCI Green Claims Code, and CCPA 2024 Guidelines.`,
      statutoryUpdates,
      point3Summary: `Matched ${brsrRecord.companyName} (${brsrRecord.symbol}) in the verified SEBI BRSR Principle 6 database and evaluated conceptual alignment with ASCI & CCPA rules.`,
      point3Status:
        impossibleAbsolute || fossilContradiction
          ? "Contradictory"
          : ccpaContextuallySupported
          ? "Supporting"
          : "Inconclusive",
      corporateFindings: findings,
      disclosureContext,
    };
  }

  const indiaIndustry = inferIndustryBaseline(company, claim);
  const fluidIndiaUpdates = buildFluidStatutoryUpdates(
    company,
    claim,
    "india",
    categoryAMatches,
    categoryBMatches
  );

  return {
    corporateIdentifier: `${indiaIndustry.sectorName} · SEBI BRSR / CCPA Scope`,
    needsDynamicResearch: true,
    point2Summary: `Evaluated ${company.trim() || "entity"} against SEBI BRSR Principle 6, CCPA Greenwashing Guidelines (2024), and ${indiaIndustry.sectorName} reporting norms.`,
    statutoryUpdates: fluidIndiaUpdates,
    point3Summary: `Generated preliminary ${indiaIndustry.sectorName} sustainability & BRSR/CCPA evaluation for "${company.trim() || "entity"}".`,
    point3Status: impossibleAbsolute
      ? "Contradictory"
      : categoryBMatches.length > 0 && categoryAMatches.length === 0
      ? "Supporting"
      : "Inconclusive",
    corporateFindings: [
      {
        topic: `Preliminary Sustainability & BRSR Baseline — ${company.trim() || "Target Entity"}`,
        status: impossibleAbsolute
          ? "Contradictory"
          : categoryBMatches.length > 0 && categoryAMatches.length === 0
          ? "Supporting"
          : "Inconclusive",
        answer: `${company.trim() || "This entity"} (${indiaIndustry.sectorName}) was evaluated using broader industry reporting benchmarks alongside active SEBI BRSR Principle 6, ASCI, and CCPA 2024 rules. ${indiaIndustry.typicalReporting} ${indiaIndustry.commonGaps}`,
        sources: [
          {
            title: "SEBI BRSR Framework",
            url: "https://www.sebi.gov.in/",
          },
        ],
      },
    ],
    disclosureContext: {
      hasVerifiedFiling: false,
      frameworkLabel: "SEBI BRSR Principle 6 / CCPA 2024",
      verifiedDomains: {
        climate: false,
        energy: false,
        water: false,
        circularity: false,
        chemicalSafety: false,
        corporateEsg: false,
      },
      hasCleanWatchdog,
    },
  };
}

export async function resolveJurisdictionData(
  jurisdiction: JurisdictionId,
  company: string,
  claim: string,
  categoryAMatches: BuzzwordEntry[],
  categoryBMatches: CategoryBMatch[],
  _baselineChecks: StatutoryCheckItem[],
  hasCleanWatchdog = true
): Promise<JurisdictionRouterOutput> {
  if (jurisdiction === "us") {
    return await resolveUsSecEdgar(
      company,
      claim,
      categoryAMatches,
      categoryBMatches,
      hasCleanWatchdog
    );
  }
  if (jurisdiction === "eu") {
    return resolveEuCsrd(
      company,
      claim,
      categoryAMatches,
      categoryBMatches,
      hasCleanWatchdog
    );
  }
  return resolveIndiaSebiBrsr(
    company,
    claim,
    categoryAMatches,
    categoryBMatches,
    hasCleanWatchdog
  );
}
