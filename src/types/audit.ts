import type { BuzzwordSector } from "../data/buzzwords500.ts";

export type { BuzzwordSector };

export type JurisdictionId = "india" | "eu" | "us";

export type EvidenceCategory =
  | "Supporting"
  | "Partially Verified"
  | "Contradictory"
  | "Missing"
  | "Inconclusive";

export type NewsVerificationVerdict =
  | "Verified Accurate"
  | "Partially Verified"
  | "Source Direct"
  | "Unverified / Disputed";

export type BuzzwordMatchType = "Exact Term" | "Semantic / Near-Meaning";

export type ContextualBacking = "Substantiated by Filing" | "Unbacked Buzzword";

export interface BuzzwordEntry {
  id?: number;
  term: string;
  sector: BuzzwordSector;
  subcategory:
    | "Absolute & Purity"
    | "Eco & Green Compounds"
    | "Climate & Carbon"
    | "Circularity & Packaging"
    | "Ethical & Lifestyle"
    | "Energy & Mobility"
    | "Food, Water & Land"
    | "Corporate, ESG & Finance"
    | "Industry & Self-Certs"
    | "Household & Slogans";
  regulatoryRisk: string;
  matchType?: BuzzwordMatchType;
  matchedPhrase?: string;
  contextualBacking?: ContextualBacking;
  backingExplanation?: string;
}

export interface CategoryBMatch {
  label: string;
  matchedText: string;
  category:
    | "Emissions"
    | "Circularity / PCR"
    | "EPR Compliance"
    | "Resource Metric"
    | "Certification / Standard";
}

export interface StatutoryCheckItem {
  code: string;
  framework: string;
  title: string;
  requirement: string;
  status: EvidenceCategory;
  finding: string;
}

export interface WatchdogRecord {
  title: string;
  source: string;
  date: string;
  url: string;
  category: "Watchdog" | "Lawsuit / Fine" | "Complaint Ruling" | "News / Investigation";
  evidenceTag: EvidenceCategory;
  summary: string;
  verificationVerdict: NewsVerificationVerdict;
  verificationDetail: string;
}

export interface CrossVerificationFinding {
  topic: string;
  status: EvidenceCategory;
  answer: string;
  sources: { title: string; url: string }[];
}

export interface ScoreBreakdown {
  claimSpecificity: number; // out of 2.5
  metricSubstantiation: number; // out of 2.5
  statutoryAlignment: number; // out of 2.5
  watchdogStanding: number; // out of 2.5
}

export interface AuditReport {
  id: string;
  analyzedAt: string;
  company: string;
  corporateIdentifier?: string;
  claim: string;
  jurisdiction: JurisdictionId;
  jurisdictionLabel: string;
  evidenceStrengthIndex: number; // 0 to 10
  scoreBreakdown: ScoreBreakdown;
  overallVerdict: string;
  overallStatus: EvidenceCategory;
  evidenceCounts: Record<EvidenceCategory, number>;
  point1: {
    categoryAMatches: BuzzwordEntry[];
    categoryBMatches: CategoryBMatch[];
    buzzwordDensityRatio: number;
    summary: string;
    semanticIntentSummary?: string;
    substantiatedCount?: number;
    unbackedCount?: number;
    status: EvidenceCategory;
  };
  point2: {
    frameworkName: string;
    checks: StatutoryCheckItem[];
    summary: string;
    status: EvidenceCategory;
  };
  point3: {
    summary: string;
    status: EvidenceCategory;
    findings: CrossVerificationFinding[];
  };
  point4: {
    records: WatchdogRecord[];
    summary: string;
    status: EvidenceCategory;
    newsVerificationSummary: string;
  };
  executiveSummary: string;
}

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  sources?: ChatSource[];
}
