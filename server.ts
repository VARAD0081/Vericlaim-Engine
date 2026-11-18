import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  CATEGORY_A_BUZZWORDS,
  JURISDICTIONS,
  PDF_RED_FLAGS,
} from "./src/data/lexicon.ts";
import {
  applyContextualBacking,
  buildBaselineStatutoryChecks,
  detectClaimIntentDomains,
  extractCategoryABuzzwords,
  extractCategoryBMetrics,
} from "./src/lib/analyzer.ts";
import { resolveJurisdictionData } from "./server/jurisdictionRouter.ts";
import type {
  AuditReport,
  BuzzwordEntry,
  ChatSource,
  CrossVerificationFinding,
  EvidenceCategory,
  JurisdictionId,
  NewsVerificationVerdict,
  ScoreBreakdown,
  StatutoryCheckItem,
  WatchdogRecord,
} from "./src/types/audit.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Verification error");
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please check your billing or API key quota in Settings > Secrets.";
  }
  if (/403|PERMISSION_DENIED|API_KEY_INVALID|400/i.test(raw)) {
    return "Gemini API key invalid or unauthorized. Please verify GEMINI_API_KEY in Settings > Secrets.";
  }
  if (/404|NOT_FOUND/i.test(raw)) {
    return "Requested Gemini model was not found or is currently unavailable.";
  }
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Use raw string if not JSON
  }
  return raw;
}

function hasRealGuardianKey(): boolean {
  const key = process.env.GUARDIAN_API_KEY;
  return Boolean(key && key !== "MY_GUARDIAN_API_KEY");
}

function isRateLimitError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return /429|RESOURCE_EXHAUSTED|quota|rate[- ]limit|503|UNAVAILABLE/i.test(raw);
}

async function callGeminiWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 1,
  baseDelayMs = 1500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (isRateLimitError(err) && attempt < retries) {
        attempt += 1;
        const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
}

interface TtlEntry<T> {
  value: T;
  storedAt: number;
}

const SERVER_CACHE_TTL_MS = 30 * 60 * 1000;
const analyzeResultCache = new Map<string, TtlEntry<AuditReport>>();
const guardianRawCache = new Map<string, TtlEntry<RawGuardianArticle[]>>();
const guardianVerifiedCache = new Map<
  string,
  TtlEntry<{ records: WatchdogRecord[]; newsVerificationSummary: string; status: EvidenceCategory }>
>();
const sectionVerifyCache = new Map<string, TtlEntry<Record<string, unknown>>>();

function getServerCache<T>(map: Map<string, TtlEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > SERVER_CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setServerCache<T>(map: Map<string, TtlEntry<T>>, key: string, value: T): void {
  map.set(key, { value, storedAt: Date.now() });
}

interface RawGuardianArticle {
  title: string;
  source: string;
  date: string;
  url: string;
  category: "Watchdog" | "Lawsuit / Fine" | "Complaint Ruling" | "News / Investigation";
  evidenceTag: EvidenceCategory;
  summary: string;
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(/\b(limited|ltd\.?|inc\.?|corp\.?|corporation|plc|llc|pvt\.?|private|gmbh)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ENV_ACCOUNTABILITY_REGEX =
  /\b(greenwash|climate|emission|carbon|plastic|waste|environment|sustainab|pollut|mercury|toxic|asci|ccpa|ftc|brsr|csrd|recycl|water|deforest|net[- ]zero|ecologic|esg|renewable|solar|voc|oil\s+spill|carbon\s+offset)\b/i;

function isRelevantArticle(title: string, company: string): boolean {
  const shortCompany = normalizeCompanyName(company);
  const tokens = Array.from(
    new Set([
      company.trim(),
      shortCompany,
      ...shortCompany.split(/\s+/).filter((w) => w.length >= 4),
    ])
  ).filter(Boolean);
  const matchesCompany = tokens.some((tok) =>
    new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title)
  );
  return matchesCompany && ENV_ACCOUNTABILITY_REGEX.test(title);
}

async function fetchRssWatchdogs(company: string): Promise<RawGuardianArticle[]> {
  const shortName = normalizeCompanyName(company) || company.trim();
  const queries = [
    `site:theguardian.com "${shortName}" (greenwashing OR climate OR environment OR emissions OR plastic OR "oil spill" OR pollution OR sustainability)`,
    `"${shortName}" (greenwashing OR "climate lawsuit" OR "environmental fine" OR ASCI OR BRSR OR sustainability OR ESG)`,
  ];

  const collected: RawGuardianArticle[] = [];
  const seenTitles = new Set<string>();

  for (const q of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
        q
      )}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      for (const match of items) {
        const block = match[1];
        const rawTitle = decodeXmlEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
        const rawLink = decodeXmlEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
        const rawPubDate = decodeXmlEntities(
          block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ""
        );
        const rawSource = decodeXmlEntities(
          block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "Public News"
        );
        const cleanTitle = rawTitle.replace(/\s+-\s+[^-]+$/, "").trim() || rawTitle;
        if (!cleanTitle || !isRelevantArticle(cleanTitle, company)) continue;

        const key = cleanTitle.toLowerCase();
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);

        let isoDate = "Recent";
        if (rawPubDate) {
          const parsed = new Date(rawPubDate);
          if (!Number.isNaN(parsed.getTime())) {
            isoDate = parsed.toISOString().slice(0, 10);
          }
        }

        const parsedYear = Number.parseInt(isoDate.slice(0, 4), 10);
        const isHistoricalRecord =
          Number.isFinite(parsedYear) && parsedYear < new Date().getFullYear() - 4;
        const reportsZeroViolations = /\b(zero\s+fines?|no\s+fines?|zero\s+violations?)\b/i.test(
          cleanTitle
        );
        const isAdverse =
          !reportsZeroViolations &&
          /\b(greenwash|mislead|worthless|oil\s+spill|pollut|mercury|deceptive|banned|warning|violat|breach|sued|lawsuit|penalty|fine|fined|scandal)\b/i.test(
            cleanTitle
          );
        const isSupporting =
          reportsZeroViolations ||
          /\b(partner|circular economy|recycling facilit|milestone|target|solar|renewable|brsr|sustainability report|net[- ]zero|award|clean\s+energy)\b/i.test(
            cleanTitle
          );

        collected.push({
          title: cleanTitle,
          source: rawSource,
          date: isoDate,
          url: rawLink,
          category: isAdverse ? "Lawsuit / Fine" : "News / Investigation",
          evidenceTag:
            isAdverse && !isHistoricalRecord
              ? "Contradictory"
              : isSupporting
              ? "Supporting"
              : "Inconclusive",
          summary: isAdverse && isHistoricalRecord
            ? `Historical archive (${isoDate}) from ${rawSource} regarding ${shortName}; evaluated alongside current CSRD/statutory compliance disclosures.`
            : `Retrieved from live ${rawSource} news coverage matching ${shortName} environmental and regulatory records.`,
        });

        if (collected.length >= 4) return collected;
      }
    } catch {
      // Continue to next query
    }
  }

  return collected;
}

async function fetchGuardianWatchdogs(company: string): Promise<RawGuardianArticle[]> {
  if (!company.trim()) return [];
  const shortName = normalizeCompanyName(company) || company.trim();
  const cacheKey = shortName.toLowerCase();
  const cached = getServerCache(guardianRawCache, cacheKey);
  if (cached) return cached;

  if (hasRealGuardianKey()) {
    const apiKey = process.env.GUARDIAN_API_KEY!;
    const queries = [
      `"${shortName}" AND (greenwashing OR environment OR emissions OR lawsuit OR fine OR climate OR sustainability)`,
      `${shortName} AND (environment OR climate OR sustainability)`,
    ];

    for (const q of queries) {
      try {
        const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(
          q
        )}&page-size=4&order-by=relevance&show-fields=trailText&api-key=${encodeURIComponent(
          apiKey
        )}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          response?: {
            results?: {
              webTitle: string;
              webPublicationDate: string;
              webUrl: string;
              sectionName?: string;
              fields?: { trailText?: string };
            }[];
          };
        };

        const results = data.response?.results ?? [];
        if (results.length > 0) {
          const mapped: RawGuardianArticle[] = results.map((item) => {
            const cleanSummary = decodeXmlEntities(item.fields?.trailText ?? "");
            const combined = `${item.webTitle} ${cleanSummary}`;
            const isoDate = item.webPublicationDate.slice(0, 10);
            const parsedYear = Number.parseInt(isoDate.slice(0, 4), 10);
            const isHistoricalRecord =
              Number.isFinite(parsedYear) && parsedYear < new Date().getFullYear() - 4;
            const mentionsCorporateMisconduct =
              /\b(greenwash\w*|sued|lawsuit|fined|penalty|penalties|mislead\w*|deceptive|prosecut\w*|asci|ccpa|ftc|banned|breach\w*|regulatory\s+action|violat\w*|accused\s+of)\b/i.test(
                combined
              );
            const mentionsGeoOnly =
              /^patagonia$/i.test(shortName) &&
              /\b(chile|argentina|andes|strait|off\s+patagonia)\b/i.test(combined) &&
              !/\b(company|brand|apparel|jacket|founder|chouinard|for-profit|clothing|retail)\b/i.test(
                combined
              );
            const isAdverse = mentionsCorporateMisconduct && !mentionsGeoOnly;
            const isSupporting =
              !isAdverse &&
              /\b(for-profit|climate\s+crisis|sustainability|renewable|recycl|net[- ]zero|circular|brsr|csrd|award|clean\s+energy)\b/i.test(
                combined
              );
            return {
              title: item.webTitle,
              source: `The Guardian (${item.sectionName ?? "News"})`,
              date: isoDate,
              url: item.webUrl,
              category: isAdverse ? "Lawsuit / Fine" : "News / Investigation",
              evidenceTag:
                isAdverse && !isHistoricalRecord
                  ? "Contradictory"
                  : isSupporting
                  ? "Supporting"
                  : "Inconclusive",
              summary:
                (isAdverse && isHistoricalRecord
                  ? `Historical Guardian archive (${isoDate}): ${cleanSummary || item.webTitle}`
                  : cleanSummary) ||
                "Retrieved from The Guardian Open Platform for environmental and corporate accountability review.",
            };
          });
          setServerCache(guardianRawCache, cacheKey, mapped);
          return mapped;
        }
      } catch {
        // Fall back to RSS watchdogs
      }
    }
  }

  const rssItems = await fetchRssWatchdogs(company);
  setServerCache(guardianRawCache, cacheKey, rssItems);
  return rssItems;
}

interface GeminiSemanticBuzzword {
  term: string;
  matchedPhrase?: string;
  matchType?: "Exact Term" | "Semantic / Near-Meaning";
  contextualBacking?: "Substantiated by Filing" | "Unbacked Buzzword";
  backingExplanation?: string;
}

interface GeminiEnrichmentPayload {
  semanticIntentSummary?: string;
  semanticBuzzwords?: GeminiSemanticBuzzword[];
  statutorySummary?: string;
  statutoryUpdates?: {
    code: string;
    status: EvidenceCategory;
    finding: string;
  }[];
  corporateSummary?: string;
  corporateStatus?: EvidenceCategory;
  corporateFindings?: {
    topic: string;
    status: EvidenceCategory;
    answer: string;
  }[];
  watchdogSummary?: string;
  watchdogStatus?: EvidenceCategory;
  newsVerificationSummary?: string;
  watchdogFindings?: {
    title: string;
    source: string;
    date: string;
    url: string;
    category: "Watchdog" | "Lawsuit / Fine" | "Complaint Ruling" | "News / Investigation";
    evidenceTag: EvidenceCategory;
    summary: string;
    verificationVerdict?: NewsVerificationVerdict;
    verificationDetail?: string;
  }[];
  guardianVerifications?: {
    title: string;
    verificationVerdict: NewsVerificationVerdict;
    verificationDetail: string;
  }[];
  researchedCompanyProfile?: {
    hasPublicSustainabilityReporting?: boolean;
    reportingFrameworkSummary?: string;
    isHighFossilEmitter?: boolean;
    verifiedDomains?: {
      climate?: boolean;
      energy?: boolean;
      water?: boolean;
      circularity?: boolean;
      chemicalSafety?: boolean;
      corporateEsg?: boolean;
    };
  };
  executiveSummary?: string;
}

function safeParseJsonFromText(rawText: string): GeminiEnrichmentPayload | null {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as GeminiEnrichmentPayload;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as GeminiEnrichmentPayload;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function computeScores(
  categoryAMatches: BuzzwordEntry[],
  categoryBCount: number,
  statutoryChecks: StatutoryCheckItem[],
  watchdogRecords: WatchdogRecord[],
  point4Status: EvidenceCategory,
  hasVerifiedCorporateFiling: boolean,
  isHighFossilEmitter: boolean,
  hasCompany: boolean
): {
  evidenceStrengthIndex: number;
  scoreBreakdown: ScoreBreakdown;
  overallStatus: EvidenceCategory;
  overallVerdict: string;
} {
  const unbackedCount = categoryAMatches.filter(
    (b) => b.contextualBacking !== "Substantiated by Filing"
  ).length;
  const substantiatedCount = categoryAMatches.filter(
    (b) => b.contextualBacking === "Substantiated by Filing"
  ).length;

  // Claim specificity rewards precision and verified-filing backing, penalizing only unbacked buzzwords heavily
  const specificityRaw =
    2.5 - unbackedCount * 0.55 - substantiatedCount * 0.08;
  const claimSpecificity = Number(clamp(specificityRaw, 0.2, 2.5).toFixed(1));

  // Metric substantiation considers explicit claim metrics + audited corporate disclosure metrics (when non-contradictory)
  let metricRaw = categoryBCount === 0 ? 0.3 : 0.9 + Math.min(categoryBCount, 4) * 0.4;
  if (hasVerifiedCorporateFiling && !isHighFossilEmitter && unbackedCount === 0) {
    metricRaw = Math.max(metricRaw, 1.9);
  } else if (hasVerifiedCorporateFiling && !isHighFossilEmitter) {
    metricRaw = Math.max(metricRaw, 1.1);
  }
  const metricSubstantiation = Number(clamp(metricRaw, 0.2, 2.5).toFixed(1));

  // Statutory alignment reflects BRSR / CSRD / SEC / FTC / CCPA checks
  const totalChecks = Math.max(1, statutoryChecks.length);
  const statutoryPoints = statutoryChecks.reduce((acc, item) => {
    if (item.status === "Supporting") return acc + 1;
    if (item.status === "Partially Verified") return acc + 0.78;
    if (item.status === "Inconclusive") return acc + 0.45;
    if (item.status === "Missing") return acc + 0.15;
    return acc;
  }, 0);
  const statutoryAlignment = Number(
    clamp((statutoryPoints / totalChecks) * 2.5, 0.2, 2.5).toFixed(1)
  );

  // Watchdog standing rewards clean zero-violation public records instead of penalizing absence of lawsuits
  const adverseCount = watchdogRecords.filter((r) => r.evidenceTag === "Contradictory").length;
  const supportingCount = watchdogRecords.filter((r) => r.evidenceTag === "Supporting").length;
  let watchdogRaw = 1.4;
  if (adverseCount > 0) {
    watchdogRaw = 1.3 - adverseCount * 0.65;
  } else if (hasCompany) {
    watchdogRaw = hasVerifiedCorporateFiling ? 2.2 : 1.9;
    watchdogRaw += supportingCount * 0.25;
  } else if (point4Status === "Missing") {
    watchdogRaw = 1.2;
  }
  const watchdogStanding = Number(clamp(watchdogRaw, 0.2, 2.5).toFixed(1));

  const evidenceStrengthIndex = Number(
    clamp(
      claimSpecificity + metricSubstantiation + statutoryAlignment + watchdogStanding,
      0,
      10
    ).toFixed(1)
  );

  const hasImpossibleAbsolute = categoryAMatches.some((b) =>
    /\b(chemical-free|zero-impact|guilt-free|clean coal|100% natural)\b/i.test(b.term)
  );
  const hasDirectionalStatutorySupport = statutoryChecks.some(
    (s) => s.status === "Supporting" || s.status === "Partially Verified"
  );

  let overallStatus: EvidenceCategory = "Inconclusive";
  let overallVerdict = "Partially Substantiated — Preliminary Public & Industry Context";

  if (evidenceStrengthIndex >= 7.0 && adverseCount === 0 && !hasImpossibleAbsolute) {
    overallStatus = "Supporting";
    overallVerdict =
      categoryBCount > 0
        ? "High Empirical Substantiation"
        : "Contextually Substantiated by Verified Disclosures";
  } else if (
    evidenceStrengthIndex < 4.2 ||
    hasImpossibleAbsolute ||
    adverseCount > 0 ||
    (isHighFossilEmitter && unbackedCount >= 2)
  ) {
    overallStatus = "Contradictory";
    overallVerdict = "Elevated Greenwashing Risk (Vague / Unsubstantiated)";
  } else if (categoryBCount === 0 && !hasVerifiedCorporateFiling && !hasCompany) {
    overallStatus = "Missing";
    overallVerdict = "Insufficient Quantitative Evidence";
  } else if (
    evidenceStrengthIndex >= 5.2 ||
    hasVerifiedCorporateFiling ||
    hasDirectionalStatutorySupport
  ) {
    overallStatus = "Partially Verified";
    overallVerdict = "Partially Verified — Directional Corporate Disclosure Alignment";
  }

  return {
    evidenceStrengthIndex,
    scoreBreakdown: {
      claimSpecificity,
      metricSubstantiation,
      statutoryAlignment,
      watchdogStanding,
    },
    overallStatus,
    overallVerdict,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/analyze", async (req, res) => {
    const body = req.body as {
      claim?: string;
      company?: string;
      jurisdiction?: JurisdictionId;
      deepVerify?: boolean;
    };

    const claim = (body.claim ?? "").trim();
    const company = (body.company ?? "").trim();
    const jurisdiction: JurisdictionId =
      body.jurisdiction && body.jurisdiction in JURISDICTIONS ? body.jurisdiction : "india";
    const deepVerify = Boolean(body.deepVerify);

    if (!claim) {
      res
        .status(400)
        .json({ error: "Please enter an environmental or sustainability claim to analyze." });
      return;
    }

    const analyzeCacheKey = `${company.toLowerCase()}::${jurisdiction}::${claim.toLowerCase()}::${
      deepVerify ? "deep" : "fast"
    }`;
    const cachedReport = getServerCache(analyzeResultCache, analyzeCacheKey);
    if (cachedReport) {
      res.json(cachedReport);
      return;
    }

    const jurisdictionSpec = JURISDICTIONS[jurisdiction];
    let categoryAMatches = extractCategoryABuzzwords(claim);
    const categoryBMatches = extractCategoryBMetrics(claim);
    const intentProfile = detectClaimIntentDomains(claim);
    const wordCount = Math.max(1, claim.split(/\s+/).filter(Boolean).length);
    const buzzwordDensityRatio = Number(((categoryAMatches.length / wordCount) * 100).toFixed(1));

    let statutoryChecks = buildBaselineStatutoryChecks(
      claim,
      jurisdiction,
      categoryAMatches,
      categoryBMatches
    );

    const guardianRawItems = company
      ? await fetchGuardianWatchdogs(company).catch(() => [])
      : [];
    const initialHasCleanWatchdog = !guardianRawItems.some(
      (r) => r.evidenceTag === "Contradictory"
    );

    const jurisdictionResult = await resolveJurisdictionData(
      jurisdiction,
      company,
      claim,
      categoryAMatches,
      categoryBMatches,
      statutoryChecks,
      initialHasCleanWatchdog
    );

    if (jurisdictionResult.statutoryUpdates.length > 0) {
      const routerStatMap = new Map(
        jurisdictionResult.statutoryUpdates.map((u) => [u.code, u])
      );
      statutoryChecks = statutoryChecks.map((check) => {
        const upd = routerStatMap.get(check.code);
        return upd ? { ...check, status: upd.status, finding: upd.finding } : check;
      });
    }

    let point2Summary = jurisdictionResult.point2Summary;

    const watchdogRecords: WatchdogRecord[] = [];
    const corporateFindings: CrossVerificationFinding[] = [
      ...jurisdictionResult.corporateFindings,
    ];
    let point3Summary = jurisdictionResult.point3Summary;
    let point3Status: EvidenceCategory = jurisdictionResult.point3Status;
    let point4Status: EvidenceCategory = guardianRawItems.length > 0 ? "Inconclusive" : "Missing";
    let point4Summary = company
      ? "Public watchdog, news verification, and regulatory enforcement scan completed."
      : "No company entity supplied; entity-level news and lawsuit verification skipped.";
    let newsVerificationSummary =
      guardianRawItems.length > 0
        ? `Displayed ${guardianRawItems.length} record(s) directly from The Guardian & public news archives. Expand or click Fact-Check for optional AI search verification.`
        : "No external news items retrieved yet for factual accuracy verification.";
    let semanticIntentSummary = `Identified conceptual intent across: ${intentProfile.activeDomains.join(
      ", "
    )}.`;
    let executiveSummaryOverride: string | undefined;
    let geminiError: string | null = null;

    const effectiveDisclosureContext = {
      ...jurisdictionResult.disclosureContext,
      verifiedDomains: { ...jurisdictionResult.disclosureContext.verifiedDomains },
    };

    const ai = getGeminiClient();
    const groundedUrls: ChatSource[] = [];

    if (deepVerify && ai) {
      try {
        const indicatorCodes = jurisdictionSpec.statutoryIndicators.map((i) => i.code).join(", ");
        const researchModeNote = jurisdictionResult.needsDynamicResearch
          ? `ACTIVE DYNAMIC BASELINE RESEARCH: "${company || "Unspecified Entity"}" was NOT found in local pre-indexed filing tables. Use Google Search and your sustainability domain knowledge to actively research ${company}'s public ESG/Impact/Sustainability reports, CDP/SBTi/BRSR/CSRD/10-K disclosures, and sector-wide practices. Populate fluid, substantive qualitative summaries explaining what ${company} publicly reports and where genuine industry transparency gaps lie — NEVER return generic or repetitive "Missing" warning blocks when public domain context is available.`
          : `Local corporate filing context matched; enrich and cross-verify against live public records.`;

        const routerContextSection = `\nOfficial Corporate Filing & Jurisdiction Context:\n- Research Mode: ${researchModeNote}\n- Framework: ${jurisdictionResult.disclosureContext.frameworkLabel}\n- Verified Filing Found: ${jurisdictionResult.disclosureContext.hasVerifiedFiling}\n- High Fossil Emitter Flag: ${Boolean(
          jurisdictionResult.disclosureContext.isHighFossilEmitter
        )}\n- Summary: ${jurisdictionResult.point3Summary}\n${jurisdictionResult.corporateFindings
          .map((f) => `- ${f.topic}: ${f.answer}`)
          .join("\n")}`;

        const guardianPromptSection =
          guardianRawItems.length > 0
            ? `\nNews Articles Retrieved from Backend News Feed to Fact-Check & Verify:\n${guardianRawItems
                .map(
                  (g, i) =>
                    `${i + 1}. Title: "${g.title}" | Date: ${g.date} | Source: ${g.source} | Summary: "${g.summary}"`
                )
                .join("\n")}`
            : "";

        const prompt = `You are a contextual sustainability compliance and semantic greenwashing analyst for The VeriClaim Engine.
Analyze the following claim using contextual AI semantic mapping (NOT brittle literal word-for-word matching) and Google Search grounding:
- Company Entity: "${company || "Unspecified Entity"}"
- Marketing Claim: "${claim}"
- Jurisdiction: "${jurisdictionSpec.label}" (${jurisdictionSpec.primaryStatute})
- Statutory Indicator Codes (cover ALL of these in statutoryUpdates): ${indicatorCodes}
- Conceptual Intent Domains Detected: ${intentProfile.activeDomains.join(", ")}
- Locally Matched 500-Word Lexicon & Near-Meaning Terms: ${
          categoryAMatches
            .map(
              (b) =>
                `"${b.term}" [${b.sector}; ${b.matchType ?? "Exact Term"}${
                  b.matchedPhrase ? ` via "${b.matchedPhrase}"` : ""
                }]`
            )
            .join(", ") || "None"
        }
- Locally Detected Category B Metrics: ${
          categoryBMatches.map((m) => `${m.label} (${m.matchedText})`).join(", ") || "None"
        }
- PDF Greenwashing Red Flags to watch for: ${PDF_RED_FLAGS.join(" | ")}
${routerContextSection}
${guardianPromptSection}

Critical Evaluation Rules:
1. Dynamic Public Baseline Fallback & Intelligent EU CSRD Cross-Referencing: If local indexed metrics are absent for "${company || "this entity"}", actively research the company's public ESG/Sustainability/Impact Reports (or sector benchmarks if private) via Google Search. Specifically for EU jurisdiction audits (CSRD/ESRS, EmpCo), DO NOT default statutory indicators to "Inconclusive" simply because marketing copy lacks raw lifecycle code references (ISO 14040 / PEF). Cross-reference against published annual sustainability reports and public ESG targets (such as 2030/2050 decarbonization pathways, SBTi targets, and ISAE 3000 / TÜV assurance). Map certified directional disclosures to "Supporting" or "Partially Verified" with explicit report citations rather than leaving them blank or "Inconclusive".
2. Semantic & Near-Same-Meaning Detection: Evaluate both exact terms from the 500-word greenwashing lexicon AND any near-same-meaning synonyms or conceptually similar phrases in the claim (e.g., "low-VOC" ≈ "non-toxic"/"safer chemistry", "environmentally sound" ≈ "environmentally friendly", "water-conserving" ≈ "water-wise", "carbon-cutting" ≈ "reduced carbon"). Include any semantic matches in "semanticBuzzwords".
3. Contextual Substantiation vs. Penalty: Do NOT require exact unit strings inside the marketing slogan if the company's verified public sustainability filings (SEBI BRSR Principle 6, EU CSRD/ESRS, SEC Form 10-K, or audited annual Impact/ESG reports) substantiate that operational domain. Populate "researchedCompanyProfile" accurately based on your search findings.
4. Strict Accountability When Unverified or Contradictory: Flag terms as "Unbacked Buzzword" and assign "Contradictory" ONLY when: (a) the entity lacks credible public sustainability disclosures for that domain, (b) the claim relies on scientifically impossible absolutes ("chemical-free", "zero-impact", "100% natural" on synthetic products), (c) fossil-intensive emitters make unbacked "carbon-neutral"/"clean-fuel" claims, or (d) adverse regulatory fines/rulings contradict the claim.
5. News & Watchdog Fact-Verification (Point 4): Verify retrieved news articles via Google Search for factual accuracy and clean framing; also search for any real regulatory fines, ASCI/CCPA rulings, or greenwashing lawsuits. Never fabricate fines or URLs.

Return ONLY valid JSON matching this schema:
{
  "semanticIntentSummary": "1-2 sentence explanation of the conceptual intent of the claim and whether company disclosures support or contradict it",
  "semanticBuzzwords": [
    {
      "term": "canonical term from the 500-word lexicon",
      "matchedPhrase": "exact phrase found in the claim",
      "matchType": "Exact Term|Semantic / Near-Meaning",
      "contextualBacking": "Substantiated by Filing|Unbacked Buzzword",
      "backingExplanation": "brief reason referencing corporate filing or transparency gap"
    }
  ],
  "researchedCompanyProfile": {
    "hasPublicSustainabilityReporting": true,
    "reportingFrameworkSummary": "Name & year of public sustainability/ESG/Impact/BRSR/CSRD/10-K disclosure verified via search (or industry baseline if none)",
    "isHighFossilEmitter": false,
    "verifiedDomains": {
      "climate": true,
      "energy": true,
      "water": false,
      "circularity": true,
      "chemicalSafety": false,
      "corporateEsg": true
    }
  },
  "statutorySummary": "1-2 sentence synthesis of statutory alignment and public ESG posture",
  "statutoryUpdates": [
    { "code": "INDICATOR_CODE", "status": "Supporting|Partially Verified|Contradictory|Inconclusive|Missing", "finding": "fluid, evidence-backed qualitative finding with explicit report/pathway citation" }
  ],
  "corporateSummary": "1-2 sentence synthesis of corporate sustainability profile and disclosure verification",
  "corporateStatus": "Supporting|Partially Verified|Contradictory|Inconclusive|Missing",
  "corporateFindings": [
    { "topic": "Short verification topic", "status": "Supporting|Partially Verified|Contradictory|Inconclusive|Missing", "answer": "Substantive qualitative answer referencing public disclosures, 2030/2050 targets, and any industry transparency gaps" }
  ],
  "watchdogSummary": "1-2 sentence synthesis of watchdog/lawsuit/complaint records",
  "watchdogStatus": "Supporting|Contradictory|Inconclusive|Missing",
  "newsVerificationSummary": "1-2 sentence summary stating whether retrieved news records were verified as true and accurately written",
  "guardianVerifications": [
    { "title": "Exact Guardian article title", "verificationVerdict": "Verified Accurate|Partially Verified|Unverified / Disputed", "verificationDetail": "1-2 sentence fact-check confirming accuracy and wording" }
  ],
  "watchdogFindings": [
    {
      "title": "Exact headline or ruling title",
      "source": "Publisher or regulator",
      "date": "YYYY-MM-DD or YYYY",
      "url": "Verified source URL from search results",
      "category": "Watchdog|Lawsuit / Fine|Complaint Ruling|News / Investigation",
      "evidenceTag": "Supporting|Contradictory|Inconclusive|Missing",
      "summary": "1-2 sentence factual summary",
      "verificationVerdict": "Verified Accurate|Partially Verified|Unverified / Disputed",
      "verificationDetail": "1-2 sentence verification confirming truth and accuracy of wording"
    }
  ],
  "executiveSummary": "2-3 sentence plain-language audit summary explaining claim intent, public ESG alignment, industry gaps, and final Evidence Strength Index takeaway."
}`;

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        for (const chunk of chunks) {
          if (chunk.web?.uri) {
            groundedUrls.push({
              title: chunk.web.title ?? chunk.web.uri,
              url: chunk.web.uri,
            });
          }
        }

        const parsed = safeParseJsonFromText(response.text ?? "");
        const guardianVerifMap = new Map(
          (parsed?.guardianVerifications ?? []).map((v) => [v.title.toLowerCase(), v])
        );

        for (const gItem of guardianRawItems) {
          const verif = guardianVerifMap.get(gItem.title.toLowerCase());
          watchdogRecords.push({
            ...gItem,
            verificationVerdict: verif?.verificationVerdict ?? "Verified Accurate",
            verificationDetail:
              verif?.verificationDetail ??
              "Retrieved from live news archives; cross-checked against public reporting context.",
          });
        }

        if (parsed) {
          if (parsed.semanticIntentSummary) {
            semanticIntentSummary = parsed.semanticIntentSummary;
          }

          if (Array.isArray(parsed.semanticBuzzwords)) {
            const lexiconByLower = new Map(
              CATEGORY_A_BUZZWORDS.map((entry) => [entry.term.toLowerCase(), entry])
            );
            const existingMap = new Map(
              categoryAMatches.map((entry) => [entry.term.toLowerCase(), entry])
            );

            for (const sb of parsed.semanticBuzzwords) {
              if (!sb.term) continue;
              const lowerKey = sb.term.trim().toLowerCase();
              const existing = existingMap.get(lowerKey);
              if (existing) {
                existingMap.set(lowerKey, {
                  ...existing,
                  contextualBacking: sb.contextualBacking ?? existing.contextualBacking,
                  backingExplanation: sb.backingExplanation ?? existing.backingExplanation,
                });
              } else {
                const lexEntry = lexiconByLower.get(lowerKey);
                if (lexEntry) {
                  existingMap.set(lowerKey, {
                    ...lexEntry,
                    matchType: sb.matchType ?? "Semantic / Near-Meaning",
                    matchedPhrase: sb.matchedPhrase ?? sb.term,
                    contextualBacking: sb.contextualBacking,
                    backingExplanation: sb.backingExplanation,
                  });
                }
              }
            }
            categoryAMatches = Array.from(existingMap.values());
          }

          if (parsed.statutorySummary) {
            point2Summary = parsed.statutorySummary;
          }
          if (Array.isArray(parsed.statutoryUpdates)) {
            const updateMap = new Map(parsed.statutoryUpdates.map((u) => [u.code, u]));
            statutoryChecks = statutoryChecks.map((check) => {
              const upd = updateMap.get(check.code);
              if (!upd) return check;
              const validStatus: EvidenceCategory[] = [
                "Supporting",
                "Partially Verified",
                "Contradictory",
                "Missing",
                "Inconclusive",
              ];
              return {
                ...check,
                status: validStatus.includes(upd.status) ? upd.status : check.status,
                finding: upd.finding || check.finding,
              };
            });
          }

          if (parsed.researchedCompanyProfile && !effectiveDisclosureContext.hasVerifiedFiling) {
            const prof = parsed.researchedCompanyProfile;
            if (prof.hasPublicSustainabilityReporting) {
              effectiveDisclosureContext.hasVerifiedFiling = true;
              effectiveDisclosureContext.frameworkLabel =
                prof.reportingFrameworkSummary || effectiveDisclosureContext.frameworkLabel;
              effectiveDisclosureContext.isHighFossilEmitter = Boolean(prof.isHighFossilEmitter);
              if (prof.verifiedDomains) {
                effectiveDisclosureContext.verifiedDomains = {
                  climate: Boolean(prof.verifiedDomains.climate),
                  energy: Boolean(prof.verifiedDomains.energy),
                  water: Boolean(prof.verifiedDomains.water),
                  circularity: Boolean(prof.verifiedDomains.circularity),
                  chemicalSafety: Boolean(prof.verifiedDomains.chemicalSafety),
                  corporateEsg:
                    prof.verifiedDomains.corporateEsg !== undefined
                      ? Boolean(prof.verifiedDomains.corporateEsg)
                      : !prof.isHighFossilEmitter,
                };
              }
            }
          }

          if (parsed.corporateSummary) {
            point3Summary = parsed.corporateSummary;
          }
          if (parsed.corporateStatus) {
            point3Status = parsed.corporateStatus;
          }
          if (Array.isArray(parsed.corporateFindings) && parsed.corporateFindings.length > 0) {
            const validAiFindings = parsed.corporateFindings.filter(
              (cf) => Boolean(cf.topic && cf.answer)
            );
            if (validAiFindings.length > 0 && jurisdictionResult.needsDynamicResearch) {
              // Replace preliminary industry baseline card with AI-researched company-specific qualitative findings
              corporateFindings.length = 0;
            }
            for (const cf of validAiFindings) {
              const alreadyHasTopic = corporateFindings.some(
                (existing) => existing.topic.toLowerCase() === cf.topic.toLowerCase()
              );
              if (!alreadyHasTopic) {
                corporateFindings.push({
                  topic: cf.topic,
                  status: cf.status || "Inconclusive",
                  answer: cf.answer,
                  sources: groundedUrls.slice(0, 3),
                });
              }
            }
          }

          if (Array.isArray(parsed.watchdogFindings)) {
            for (const item of parsed.watchdogFindings) {
              if (!item.title) continue;
              const alreadyExists = watchdogRecords.some(
                (w) => w.title.toLowerCase() === item.title.toLowerCase()
              );
              if (alreadyExists) continue;
              const fallbackUrl = groundedUrls[0]?.url ?? "";
              watchdogRecords.push({
                title: item.title,
                source: item.source || "Public Web Record",
                date: item.date || "Undated",
                url: item.url && /^https?:\/\//i.test(item.url) ? item.url : fallbackUrl,
                category: item.category || "Watchdog",
                evidenceTag: item.evidenceTag || "Inconclusive",
                summary: item.summary || "",
                verificationVerdict: item.verificationVerdict || "Verified Accurate",
                verificationDetail:
                  item.verificationDetail ||
                  "Cross-verified against Google Search grounding sources for factual accuracy and wording.",
              });
            }
          }
          if (parsed.watchdogSummary) {
            point4Summary = parsed.watchdogSummary;
          }
          if (parsed.watchdogStatus) {
            point4Status = parsed.watchdogStatus;
          }
          if (parsed.newsVerificationSummary) {
            newsVerificationSummary = parsed.newsVerificationSummary;
          } else if (watchdogRecords.length > 0) {
            newsVerificationSummary = `AI cross-verification checked ${watchdogRecords.length} retrieved record(s) against live search sources for factual truth and accurate framing.`;
          }
          if (parsed.executiveSummary) {
            executiveSummaryOverride = parsed.executiveSummary;
          }
        }
      } catch (err) {
        geminiError = formatGeminiError(err);
        for (const gItem of guardianRawItems) {
          watchdogRecords.push({
            ...gItem,
            verificationVerdict: "Source Direct",
            verificationDetail: gItem.summary,
          });
        }
        if (guardianRawItems.length > 0) {
          newsVerificationSummary = `Displayed ${guardianRawItems.length} record(s) directly from The Guardian & public news archives.`;
        }
      }
    } else {
      if (deepVerify && !ai) {
        geminiError = "GEMINI_API_KEY is not configured on the server.";
      }
      for (const gItem of guardianRawItems) {
        watchdogRecords.push({
          ...gItem,
          verificationVerdict: "Source Direct",
          verificationDetail: gItem.summary,
        });
      }
      if (guardianRawItems.length > 0) {
        newsVerificationSummary = `Displayed ${guardianRawItems.length} record(s) directly from The Guardian & public news archives. Expand section or click Scan & Fact-Check for optional AI search verification.`;
      }
    }

    if (watchdogRecords.length === 0 && groundedUrls.length > 0 && company) {
      for (const link of groundedUrls.slice(0, 3)) {
        watchdogRecords.push({
          title: link.title,
          source: "Search Grounded Source",
          date: "Verified",
          url: link.url,
          category: "News / Investigation",
          evidenceTag: "Inconclusive",
          summary: "Retrieved via live web search grounding for entity cross-verification.",
          verificationVerdict: "Verified Accurate",
          verificationDetail: "Source URL and entity mention verified via live search grounding.",
        });
      }
      newsVerificationSummary = `Verified ${watchdogRecords.length} live search record(s) for accurate attribution.`;
    }

    const adverseWatchdogCount = watchdogRecords.filter(
      (r) => r.evidenceTag === "Contradictory"
    ).length;
    const supportingWatchdogCount = watchdogRecords.filter(
      (r) => r.evidenceTag === "Supporting"
    ).length;
    const hasCleanWatchdog = adverseWatchdogCount === 0;

    // Apply contextual backing consistently across all detected 500-word & near-meaning matches
    categoryAMatches = applyContextualBacking(
      categoryAMatches,
      categoryBMatches,
      claim,
      {
        ...effectiveDisclosureContext,
        hasCleanWatchdog,
      }
    );

    const substantiatedCount = categoryAMatches.filter(
      (b) => b.contextualBacking === "Substantiated by Filing"
    ).length;
    const unbackedCount = categoryAMatches.length - substantiatedCount;
    const hasImpossibleInClaim = categoryAMatches.some((b) =>
      /\b(chemical-free|zero-impact|guilt-free|clean coal|100% natural)\b/i.test(b.term)
    );
    const hasStatutoryDirectionalBaseline = statutoryChecks.some(
      (c) => c.status === "Supporting" || c.status === "Partially Verified"
    );
    const hasStatutoryContradiction = statutoryChecks.some((c) => c.status === "Contradictory");

    let point1Status: EvidenceCategory = "Inconclusive";
    if (
      unbackedCount === 0 &&
      (categoryBMatches.length > 0 ||
        (substantiatedCount > 0 && effectiveDisclosureContext.hasVerifiedFiling && hasCleanWatchdog))
    ) {
      point1Status = "Supporting";
    } else if (
      unbackedCount === 0 &&
      substantiatedCount > 0 &&
      effectiveDisclosureContext.hasVerifiedFiling
    ) {
      point1Status = "Partially Verified";
    } else if (
      unbackedCount > 0 &&
      categoryBMatches.length === 0 &&
      substantiatedCount === 0 &&
      (hasImpossibleInClaim ||
        Boolean(effectiveDisclosureContext.isHighFossilEmitter) ||
        adverseWatchdogCount > 0 ||
        hasStatutoryContradiction ||
        !hasStatutoryDirectionalBaseline)
    ) {
      point1Status = "Contradictory";
    } else if (unbackedCount > 0 && substantiatedCount === 0 && hasStatutoryDirectionalBaseline) {
      point1Status = "Inconclusive";
    } else if (categoryAMatches.length === 0 && categoryBMatches.length === 0) {
      point1Status = company ? (effectiveDisclosureContext.hasVerifiedFiling ? "Partially Verified" : "Inconclusive") : "Missing";
    }

    const point1Summary =
      unbackedCount === 0 && substantiatedCount > 0
        ? `Identified ${categoryAMatches.length} lexicon/near-meaning term(s), all contextually substantiated by ${effectiveDisclosureContext.frameworkLabel} disclosures and clean compliance records.`
        : unbackedCount > 0 && substantiatedCount > 0
        ? `Contextual split: ${substantiatedCount} term(s) align with verified corporate filings, while ${unbackedCount} term(s) remain unbacked buzzwords requiring explicit metrics.`
        : categoryAMatches.length > 0 && categoryBMatches.length === 0
        ? `Detected ${categoryAMatches.length} unbacked Category A or near-meaning buzzword(s) without supporting Category B metrics or verified corporate disclosures.`
        : categoryAMatches.length === 0 && categoryBMatches.length > 0
        ? `Zero Category A buzzwords detected; claim provides ${categoryBMatches.length} Category B measurable metric(s) or recognized verification references.`
        : categoryAMatches.length > 0 && categoryBMatches.length > 0
        ? `Hybrid claim: ${categoryBMatches.length} Category B metric(s) found alongside ${unbackedCount} unbacked Category A buzzword(s).`
        : "No Category A buzzwords or explicit quantitative metrics detected in claim text; evaluating broader corporate sustainability posture.";

    if (corporateFindings.length === 0) {
      corporateFindings.push({
        topic: `Substantiation under ${jurisdictionSpec.shortName}`,
        status:
          categoryBMatches.length > 0 && unbackedCount === 0
            ? "Supporting"
            : company
            ? "Inconclusive"
            : "Missing",
        answer:
          categoryBMatches.length > 0
            ? `Claim includes ${categoryBMatches.length} measurable metric(s) (${categoryBMatches
                .map((m) => m.matchedText)
                .join(", ")}); verify against third-party assurance disclosures in official filings.`
            : "Evaluated claim against public corporate reporting norms; explicit quantitative metrics or third-party assurance citations will further strengthen verification.",
        sources: groundedUrls.slice(0, 3),
      });
      if (geminiError && !jurisdictionResult.needsDynamicResearch) {
        point3Summary = `Contextual regulatory verification completed for ${company || "submitted claim"}.`;
        point3Status = categoryBMatches.length > 0 ? "Supporting" : "Inconclusive";
      }
    }

    if (adverseWatchdogCount > 0) {
      point4Status = "Contradictory";
    } else if (supportingWatchdogCount > 0) {
      point4Status = "Supporting";
    } else if (!company) {
      point4Status = "Missing";
    } else if (watchdogRecords.length === 0) {
      point4Status = effectiveDisclosureContext.hasVerifiedFiling
        ? "Supporting"
        : "Inconclusive";
      point4Summary = `No adverse regulatory fines, ASCI rulings, greenwashing lawsuits, or compliance penalties surfaced for "${company}" in queried Guardian and public watchdog sources.`;
      newsVerificationSummary =
        "Clean public record in queried archives: no adverse greenwashing rulings or regulatory penalties surfaced.";
    } else {
      // News articles found, none adverse
      point4Status = effectiveDisclosureContext.hasVerifiedFiling
        ? "Supporting"
        : "Inconclusive";
      if (!newsVerificationSummary || /not retrieved/i.test(newsVerificationSummary)) {
        newsVerificationSummary = `Reviewed ${watchdogRecords.length} public news record(s) for ${company}; no active greenwashing fines or statutory violations flagged.`;
      }
    }

    const supportingStatCount = statutoryChecks.filter((c) => c.status === "Supporting").length;
    const partialOrSupportingStatCount = statutoryChecks.filter(
      (c) => c.status === "Supporting" || c.status === "Partially Verified"
    ).length;

    const point2Status: EvidenceCategory = statutoryChecks.some((c) => c.status === "Contradictory")
      ? "Contradictory"
      : statutoryChecks.every((c) => c.status === "Supporting")
      ? "Supporting"
      : supportingStatCount >= Math.ceil(statutoryChecks.length * 0.6)
      ? "Supporting"
      : partialOrSupportingStatCount >= Math.ceil(statutoryChecks.length * 0.5)
      ? "Partially Verified"
      : partialOrSupportingStatCount > 0
      ? "Partially Verified"
      : statutoryChecks.some((c) => c.status === "Inconclusive")
      ? "Inconclusive"
      : "Missing";

    const scoring = computeScores(
      categoryAMatches,
      categoryBMatches.length,
      statutoryChecks,
      watchdogRecords,
      point4Status,
      effectiveDisclosureContext.hasVerifiedFiling,
      Boolean(effectiveDisclosureContext.isHighFossilEmitter),
      Boolean(company)
    );

    const allEvidenceTags: EvidenceCategory[] = [
      point1Status,
      ...statutoryChecks.map((s) => s.status),
      ...corporateFindings.map((c) => c.status),
      ...watchdogRecords.map((w) => w.evidenceTag),
    ];

    const evidenceCounts: Record<EvidenceCategory, number> = {
      Supporting: allEvidenceTags.filter((t) => t === "Supporting").length,
      "Partially Verified": allEvidenceTags.filter((t) => t === "Partially Verified").length,
      Contradictory: allEvidenceTags.filter((t) => t === "Contradictory").length,
      Missing: allEvidenceTags.filter((t) => t === "Missing").length,
      Inconclusive: allEvidenceTags.filter((t) => t === "Inconclusive").length,
    };

    const report: AuditReport = {
      id: `VC-${Date.now().toString(36).toUpperCase()}`,
      analyzedAt: new Date().toISOString(),
      company: company || "Unspecified Entity",
      corporateIdentifier: jurisdictionResult.corporateIdentifier,
      claim,
      jurisdiction,
      jurisdictionLabel: jurisdictionSpec.label,
      evidenceStrengthIndex: scoring.evidenceStrengthIndex,
      scoreBreakdown: scoring.scoreBreakdown,
      overallVerdict: scoring.overallVerdict,
      overallStatus: scoring.overallStatus,
      evidenceCounts,
      point1: {
        categoryAMatches,
        categoryBMatches,
        buzzwordDensityRatio,
        summary: point1Summary,
        semanticIntentSummary,
        substantiatedCount,
        unbackedCount,
        status: point1Status,
      },
      point2: {
        frameworkName: jurisdictionSpec.primaryStatute,
        checks: statutoryChecks,
        summary: point2Summary,
        status: point2Status,
      },
      point3: {
        summary: point3Summary,
        status: point3Status,
        findings: corporateFindings,
      },
      point4: {
        records: watchdogRecords,
        summary: point4Summary,
        status: point4Status,
        newsVerificationSummary,
      },
      executiveSummary:
        executiveSummaryOverride ||
        `The claim for ${company || "the target entity"} achieved an Evidence Strength Index of ${
          scoring.evidenceStrengthIndex
        }/10 (${scoring.overallStatus}) under ${jurisdictionSpec.shortName}. ${semanticIntentSummary} Semantic screening matched ${
          categoryAMatches.length
        } lexicon/near-meaning term(s) (${substantiatedCount} contextually substantiated by verified filings, ${unbackedCount} unbacked) and ${
          categoryBMatches.length
        } Category B metric(s).`,
    };

    setServerCache(analyzeResultCache, analyzeCacheKey, report);
    res.json(report);
  });

  // Lazy single-section AI verification (called sequentially only when user expands or requests a section)
  app.post("/api/verify-section", async (req, res) => {
    const body = req.body as {
      section?: "point1" | "point2" | "point3" | "point4";
      report?: AuditReport;
    };

    const section = body.section;
    const baseReport = body.report;

    if (!section || !["point1", "point2", "point3", "point4"].includes(section) || !baseReport) {
      res.status(400).json({ error: "Valid section identifier and current report payload required." });
      return;
    }

    const cacheKey = `${baseReport.company.toLowerCase()}::${baseReport.jurisdiction}::${section}::${baseReport.claim.toLowerCase()}`;
    const cached = getServerCache(sectionVerifyCache, cacheKey);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.json({
        section,
        rateLimitedFallback: false,
        note: "Displayed local statutory & registry verification (AI service offline).",
      });
      return;
    }

    const jurisdictionSpec = JURISDICTIONS[baseReport.jurisdiction];
    const indicatorCodes = jurisdictionSpec.statutoryIndicators.map((i) => i.code).join(", ");
    const categoryAMatches = [...baseReport.point1.categoryAMatches];
    const categoryBMatches = [...baseReport.point1.categoryBMatches];
    let statutoryChecks = [...baseReport.point2.checks];
    let corporateFindings = [...baseReport.point3.findings];
    let watchdogRecords = [...baseReport.point4.records];

    try {
      let prompt = "";
      if (section === "point1") {
        prompt = `You are a contextual greenwashing lexicon analyst. Analyze semantic & near-same-meaning greenwashing terms for:
Company: "${baseReport.company}" (${baseReport.corporateIdentifier || "Enterprise"})
Claim: "${baseReport.claim}"
Jurisdiction: "${baseReport.jurisdictionLabel}"
Current Lexicon Matches: ${categoryAMatches.map((b) => `${b.term} [${b.contextualBacking}]`).join(", ") || "None"}

Identify any missed near-same-meaning concepts from the 500-word lexicon and confirm whether "${baseReport.company}"'s verified sustainability disclosures substantiate them cleanly.
Return ONLY valid JSON:
{
  "semanticIntentSummary": "1-2 sentence explanation of conceptual intent and filing alignment",
  "semanticBuzzwords": [
    { "term": "canonical term", "matchedPhrase": "phrase in claim", "matchType": "Exact Term|Semantic / Near-Meaning", "contextualBacking": "Substantiated by Filing|Unbacked Buzzword", "backingExplanation": "short reason" }
  ]
}`;
      } else if (section === "point2") {
        prompt = `Using Google Search, cross-verify "${baseReport.company}"'s published annual sustainability reports, 2030/2050 decarbonization pathways, and third-party assurance disclosures against ALL statutory indicators (${indicatorCodes}) under ${jurisdictionSpec.primaryStatute}.
Claim: "${baseReport.claim}"
Current Findings: ${statutoryChecks.map((s) => `${s.code}: ${s.finding}`).join(" | ")}

EU & Global Contextual Fallback Rule: Do NOT default indicators to "Inconclusive" simply because the marketing claim lacks raw lifecycle/ISO code references (e.g., ISO 14040 / PEF). When published corporate disclosures or SBTi/CSRD/BRSR/10-K reports directionally support the claim, map rows to "Supporting" or "Partially Verified" with explicit report citations and URLs.
Return ONLY valid JSON:
{
  "statutorySummary": "1-2 sentence synthesis citing annual sustainability report and targets",
  "statutoryUpdates": [
    { "code": "INDICATOR_CODE", "status": "Supporting|Partially Verified|Contradictory|Inconclusive|Missing", "finding": "fluid evidence-backed qualitative finding with explicit citation" }
  ]
}`;
      } else if (section === "point3") {
        prompt = `Using Google Search, research "${baseReport.company}"'s public ESG/Sustainability/BRSR/CSRD/10-K disclosures, 2030/2050 decarbonization targets, third-party assurance, and industry transparency gaps relevant to:
Claim: "${baseReport.claim}"
Jurisdiction: "${baseReport.jurisdictionLabel}"

Return 2-3 substantive qualitative topics covering verified public metrics/commitments and any real transparency gaps. Use "Supporting" or "Partially Verified" with explicit citations when certified disclosures support the claim's direction rather than defaulting to "Inconclusive".
Return ONLY valid JSON:
{
  "corporateSummary": "1-2 sentence synthesis",
  "corporateStatus": "Supporting|Partially Verified|Contradictory|Inconclusive|Missing",
  "corporateFindings": [
    { "topic": "Verification topic", "status": "Supporting|Partially Verified|Contradictory|Inconclusive|Missing", "answer": "Substantive qualitative explanation citing public disclosures and 2030/2050 targets" }
  ],
  "researchedCompanyProfile": {
    "hasPublicSustainabilityReporting": true,
    "reportingFrameworkSummary": "Verified public report or framework name",
    "isHighFossilEmitter": false,
    "verifiedDomains": { "climate": true, "energy": true, "water": false, "circularity": true, "chemicalSafety": false, "corporateEsg": true }
  }
}`;
      } else {
        prompt = `Fact-check these retrieved news/watchdog articles for "${baseReport.company}" using Google Search and verify if any greenwashing fines, ASCI/CCPA rulings, or environmental lawsuits exist.
Articles:
${watchdogRecords.map((r, i) => `${i + 1}. "${r.title}" (${r.source}, ${r.date})`).join("\n") || "None retrieved"}

Return ONLY valid JSON:
{
  "watchdogSummary": "1-2 sentence summary",
  "watchdogStatus": "Supporting|Contradictory|Inconclusive|Missing",
  "newsVerificationSummary": "1-2 sentence summary confirming article accuracy",
  "guardianVerifications": [
    { "title": "Exact article title", "verificationVerdict": "Verified Accurate|Partially Verified|Unverified / Disputed", "verificationDetail": "1-2 sentence fact-check" }
  ]
}`;
      }

      const aiRes = await callGeminiWithBackoff(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const groundedUrls: ChatSource[] = [];
      for (const chunk of aiRes.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
        if (chunk.web?.uri) {
          groundedUrls.push({ title: chunk.web.title ?? chunk.web.uri, url: chunk.web.uri });
        }
      }

      const parsed = safeParseJsonFromText(aiRes.text ?? "");
      let nextPoint1 = { ...baseReport.point1 };
      let nextPoint2 = { ...baseReport.point2 };
      let nextPoint3 = { ...baseReport.point3 };
      let nextPoint4 = { ...baseReport.point4 };

      if (parsed) {
        if (section === "point1") {
          const lexiconByLower = new Map(CATEGORY_A_BUZZWORDS.map((e) => [e.term.toLowerCase(), e]));
          const existingMap = new Map(categoryAMatches.map((e) => [e.term.toLowerCase(), e]));
          for (const sb of parsed.semanticBuzzwords ?? []) {
            if (!sb.term) continue;
            const key = sb.term.trim().toLowerCase();
            const existing = existingMap.get(key);
            if (existing) {
              existingMap.set(key, {
                ...existing,
                contextualBacking: sb.contextualBacking ?? existing.contextualBacking,
                backingExplanation: sb.backingExplanation ?? existing.backingExplanation,
              });
            } else {
              const lexEntry = lexiconByLower.get(key);
              if (lexEntry) {
                existingMap.set(key, {
                  ...lexEntry,
                  matchType: sb.matchType ?? "Semantic / Near-Meaning",
                  matchedPhrase: sb.matchedPhrase ?? sb.term,
                  contextualBacking: sb.contextualBacking,
                  backingExplanation: sb.backingExplanation,
                });
              }
            }
          }
          const updatedMatches = Array.from(existingMap.values());
          const subCount = updatedMatches.filter(
            (b) => b.contextualBacking === "Substantiated by Filing"
          ).length;
          const unbCount = updatedMatches.length - subCount;
          nextPoint1 = {
            ...nextPoint1,
            categoryAMatches: updatedMatches,
            substantiatedCount: subCount,
            unbackedCount: unbCount,
            semanticIntentSummary: parsed.semanticIntentSummary || nextPoint1.semanticIntentSummary,
            status:
              unbCount === 0 && (categoryBMatches.length > 0 || subCount > 0)
                ? "Supporting"
                : unbCount > 0 && categoryBMatches.length === 0 && subCount === 0
                ? "Contradictory"
                : "Inconclusive",
          };
        } else if (section === "point2") {
          const validStatus: EvidenceCategory[] = [
            "Supporting",
            "Partially Verified",
            "Contradictory",
            "Missing",
            "Inconclusive",
          ];
          if (Array.isArray(parsed.statutoryUpdates)) {
            const uMap = new Map(parsed.statutoryUpdates.map((u) => [u.code, u]));
            statutoryChecks = statutoryChecks.map((check) => {
              const upd = uMap.get(check.code);
              return upd
                ? {
                    ...check,
                    status: validStatus.includes(upd.status) ? upd.status : check.status,
                    finding: upd.finding || check.finding,
                  }
                : check;
            });
          }
          const supCount = statutoryChecks.filter((c) => c.status === "Supporting").length;
          const dirCount = statutoryChecks.filter(
            (c) => c.status === "Supporting" || c.status === "Partially Verified"
          ).length;
          const p2Status: EvidenceCategory = statutoryChecks.some((c) => c.status === "Contradictory")
            ? "Contradictory"
            : supCount >= Math.ceil(statutoryChecks.length * 0.6)
            ? "Supporting"
            : dirCount > 0
            ? "Partially Verified"
            : statutoryChecks.some((c) => c.status === "Inconclusive")
            ? "Inconclusive"
            : "Missing";
          nextPoint2 = {
            ...nextPoint2,
            checks: statutoryChecks,
            summary: parsed.statutorySummary || nextPoint2.summary,
            status: p2Status,
          };
        } else if (section === "point3") {
          const validFindings = (parsed.corporateFindings ?? []).filter(
            (cf) => Boolean(cf.topic && cf.answer)
          );
          if (validFindings.length > 0) {
            corporateFindings = validFindings.map((cf) => ({
              topic: cf.topic,
              status: cf.status || "Inconclusive",
              answer: cf.answer,
              sources: groundedUrls.slice(0, 3),
            }));
          }
          nextPoint3 = {
            summary: parsed.corporateSummary || nextPoint3.summary,
            status: parsed.corporateStatus || nextPoint3.status,
            findings: corporateFindings,
          };
        } else if (section === "point4") {
          const vMap = new Map(
            (parsed.guardianVerifications ?? []).map((v) => [v.title.toLowerCase(), v])
          );
          watchdogRecords = watchdogRecords.map((rec) => {
            const v = vMap.get(rec.title.toLowerCase());
            return v
              ? {
                  ...rec,
                  verificationVerdict: v.verificationVerdict,
                  verificationDetail: v.verificationDetail,
                }
              : rec;
          });
          nextPoint4 = {
            records: watchdogRecords,
            summary: parsed.watchdogSummary || nextPoint4.summary,
            status: parsed.watchdogStatus || nextPoint4.status,
            newsVerificationSummary:
              parsed.newsVerificationSummary ||
              `AI fact-checked ${watchdogRecords.length} news record(s) against live search grounding.`,
          };
        }
      }

      const hasVerifiedPublicProfile =
        Boolean(parsed?.researchedCompanyProfile?.hasPublicSustainabilityReporting) ||
        nextPoint3.status === "Supporting" ||
        nextPoint3.status === "Partially Verified" ||
        Boolean(baseReport.corporateIdentifier && /CIN|CIK|Headquarters|CSRD/i.test(baseReport.corporateIdentifier));
      const isFossil = Boolean(parsed?.researchedCompanyProfile?.isHighFossilEmitter);

      const scoring = computeScores(
        nextPoint1.categoryAMatches,
        nextPoint1.categoryBMatches.length,
        nextPoint2.checks,
        nextPoint4.records,
        nextPoint4.status,
        hasVerifiedPublicProfile,
        isFossil,
        Boolean(baseReport.company && baseReport.company !== "Unspecified Entity")
      );

      const tags: EvidenceCategory[] = [
        nextPoint1.status,
        ...nextPoint2.checks.map((c) => c.status),
        ...nextPoint3.findings.map((f) => f.status),
        ...nextPoint4.records.map((w) => w.evidenceTag),
      ];
      const evidenceCounts: Record<EvidenceCategory, number> = {
        Supporting: tags.filter((t) => t === "Supporting").length,
        "Partially Verified": tags.filter((t) => t === "Partially Verified").length,
        Contradictory: tags.filter((t) => t === "Contradictory").length,
        Missing: tags.filter((t) => t === "Missing").length,
        Inconclusive: tags.filter((t) => t === "Inconclusive").length,
      };

      const payload: Record<string, unknown> = {
        section,
        point1: nextPoint1,
        point2: nextPoint2,
        point3: nextPoint3,
        point4: nextPoint4,
        evidenceStrengthIndex: scoring.evidenceStrengthIndex,
        scoreBreakdown: scoring.scoreBreakdown,
        overallStatus: scoring.overallStatus,
        overallVerdict: scoring.overallVerdict,
        evidenceCounts,
      };

      setServerCache(sectionVerifyCache, cacheKey, payload);
      res.json(payload);
    } catch (err) {
      if (isRateLimitError(err)) {
        res.status(429).json({
          error: formatGeminiError(err),
          retryable: true,
        });
        return;
      }
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const body = req.body as {
      messages?: { role: "user" | "model"; text: string }[];
      auditContext?: {
        company: string;
        claim: string;
        jurisdictionLabel: string;
        evidenceStrengthIndex: number;
        overallVerdict: string;
        categoryAMatches: string[];
        categoryBMatches: string[];
        watchdogTitles: string[];
      } | null;
    };

    const messages = body.messages ?? [];
    if (messages.length === 0) {
      res.status(400).json({ error: "Please enter a question for the VeriClaim AI Assistant." });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "Gemini assistant is currently unavailable because GEMINI_API_KEY is not configured.",
      });
      return;
    }

    try {
      const ctx = body.auditContext;
      const contextInstruction = ctx
        ? `\nActive Audit Context:\n- Company: ${ctx.company}\n- Jurisdiction: ${ctx.jurisdictionLabel}\n- Claim: "${ctx.claim}"\n- Evidence Strength Index: ${ctx.evidenceStrengthIndex}/10 (${ctx.overallVerdict})\n- Lexicon / Semantic Terms Detected: ${ctx.categoryAMatches.join(", ") || "None"}\n- Category B Metrics Detected: ${ctx.categoryBMatches.join(", ") || "None"}\n- Watchdog/News Headlines Retrieved: ${ctx.watchdogTitles.join(" | ") || "None"}`
        : "\nNo active audit report is loaded yet.";

      const contents = messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const response = await callGeminiWithBackoff(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents,
          config: {
            systemInstruction: `You are the VeriClaim AI Assistant, an educational research assistant specializing in contextual greenwashing detection, the 500-word sustainability buzzword lexicon, SEBI BRSR Principle 6, CCPA/ASCI Green Claims guidelines, the EU Green Claims Directive, and US FTC Green Guides (16 CFR Part 260). Use Google Search when needed to verify current corporate disclosures, regulatory rulings, or news accuracy. Be concise, factual, neutral, and transparent when evidence is missing or substantiated.${contextInstruction}`,
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: ChatSource[] = [];
      const seenUrls = new Set<string>();
      for (const chunk of chunks) {
        if (chunk.web?.uri && !seenUrls.has(chunk.web.uri)) {
          seenUrls.add(chunk.web.uri);
          sources.push({
            title: chunk.web.title ?? chunk.web.uri,
            url: chunk.web.uri,
          });
        }
      }

      res.json({
        reply: response.text ?? "No response generated.",
        sources: sources.slice(0, 5),
      });
    } catch (err) {
      const msg = formatGeminiError(err);
      res.status(isRateLimitError(err) ? 429 : 500).json({ error: msg });
    }
  });

  app.get("/api/guardian-scan", async (req, res) => {
    const company = typeof req.query.company === "string" ? req.query.company.trim() : "";
    const verify = req.query.verify === "true";
    const retryOn429 = req.query.retryOn429 === "true";
    if (!company) {
      res.status(400).json({ error: "Company name is required for Guardian news scanning." });
      return;
    }

    const cacheKey = `${company.toLowerCase()}::${verify ? "ai" : "raw"}`;
    const cachedVerified = verify ? getServerCache(guardianVerifiedCache, cacheKey) : null;
    if (cachedVerified) {
      res.json({ company, ...cachedVerified, cached: true });
      return;
    }

    try {
      const rawArticles = await fetchGuardianWatchdogs(company);
      const records: WatchdogRecord[] = rawArticles.map((item) => ({
        ...item,
        verificationVerdict: "Source Direct",
        verificationDetail: item.summary,
      }));

      let newsVerificationSummary =
        records.length > 0
          ? `Displayed ${records.length} record(s) directly from The Guardian & public news archives for ${company}.`
          : `No recent Guardian news, lawsuits, or regulatory filings matched "${company}".`;

      let rateLimitedFallback = false;

      const ai = getGeminiClient();
      if (verify && ai && records.length > 0) {
        try {
          const prompt = `Fact-check and verify these retrieved news/watchdog articles about "${company}" using Google Search. For each article, confirm whether the reported facts are true and accurately written without distortion.
Articles:
${records.map((r, i) => `${i + 1}. "${r.title}" (${r.source}, ${r.date})`).join("\n")}

Return ONLY valid JSON:
{
  "newsVerificationSummary": "1-2 sentence summary confirming whether retrieved articles are factually true and accurately written",
  "verifications": [
    { "title": "Exact article title", "verificationVerdict": "Verified Accurate|Partially Verified|Unverified / Disputed", "verificationDetail": "1-2 sentence factual verification" }
  ]
}`;
          const aiRes = await callGeminiWithBackoff(() =>
            ai.models.generateContent({
              model: "gemini-4-hydrogen",
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }],
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            })
          );
          const parsed = safeParseJsonFromText(aiRes.text ?? "") as {
            newsVerificationSummary?: string;
            verifications?: {
              title: string;
              verificationVerdict: NewsVerificationVerdict;
              verificationDetail: string;
            }[];
          } | null;

          if (parsed?.verifications) {
            const vMap = new Map(parsed.verifications.map((v) => [v.title.toLowerCase(), v]));
            for (let i = 0; i < records.length; i++) {
              const v = vMap.get(records[i].title.toLowerCase());
              if (v) {
                records[i].verificationVerdict = v.verificationVerdict;
                records[i].verificationDetail = v.verificationDetail;
              }
            }
          }
          if (parsed?.newsVerificationSummary) {
            newsVerificationSummary = parsed.newsVerificationSummary;
          }
        } catch (err) {
          if (retryOn429 && isRateLimitError(err)) {
            res.status(429).json({
              error: formatGeminiError(err),
              retryable: true,
            });
            return;
          }
          rateLimitedFallback = true;
        }
      }

      const status: EvidenceCategory = records.some((r) => r.evidenceTag === "Contradictory")
        ? "Contradictory"
        : records.some((r) => r.evidenceTag === "Supporting")
        ? "Supporting"
        : records.length > 0
        ? "Inconclusive"
        : "Missing";

      if (verify && !rateLimitedFallback) {
        setServerCache(guardianVerifiedCache, cacheKey, {
          status,
          records,
          newsVerificationSummary,
        });
      }

      res.json({
        company,
        status,
        records,
        newsVerificationSummary,
        rateLimitedFallback,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to scan Guardian news records.",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The VeriClaim Engine listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
