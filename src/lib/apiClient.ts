import type {
  AuditReport,
  CrossVerificationFinding,
  EvidenceCategory,
  JurisdictionId,
  ScoreBreakdown,
  StatutoryCheckItem,
  WatchdogRecord,
} from "../types/audit.ts";

export type LazyAuditSectionId = "point1" | "point2" | "point3" | "point4";

export interface SectionVerificationResponse {
  section: LazyAuditSectionId;
  cached?: boolean;
  rateLimitedFallback?: boolean;
  note?: string;
  point1?: AuditReport["point1"];
  point2?: AuditReport["point2"];
  point3?: AuditReport["point3"];
  point4?: AuditReport["point4"];
  evidenceStrengthIndex?: number;
  scoreBreakdown?: ScoreBreakdown;
  overallVerdict?: string;
  overallStatus?: EvidenceCategory;
  evidenceCounts?: Record<EvidenceCategory, number>;
  executiveSummary?: string;
}

export interface GuardianScanResponse {
  company: string;
  status: EvidenceCategory;
  records: WatchdogRecord[];
  newsVerificationSummary: string;
  cached?: boolean;
  rateLimitedFallback?: boolean;
}

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_PREFIX = "vericlaim-cache-v1:";

const memoryCache = new Map<string, CacheEntry<unknown>>();

// Strict sequential queue so background Gemini requests execute one step at a time
let backgroundQueue: Promise<void> = Promise.resolve();

export function enqueueSequential<T>(task: () => Promise<T>): Promise<T> {
  const run = backgroundQueue.then(task, task);
  backgroundQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function normalizeCacheCompany(company: string): string {
  return company.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildAnalyzeCacheKey(
  company: string,
  jurisdiction: JurisdictionId,
  claim: string
): string {
  return `analyze::${normalizeCacheCompany(company)}::${jurisdiction}::${claim
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

export function buildSectionCacheKey(
  company: string,
  jurisdiction: JurisdictionId,
  section: LazyAuditSectionId,
  claim: string
): string {
  return `section::${normalizeCacheCompany(company)}::${jurisdiction}::${section}::${claim
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

export function buildGuardianCacheKey(company: string, verified: boolean): string {
  return `guardian::${normalizeCacheCompany(company)}::${verified ? "ai" : "raw"}`;
}

export function getCachedItem<T>(key: string): T | null {
  const now = Date.now();
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) {
    if (now - mem.storedAt < CACHE_TTL_MS) {
      return mem.value;
    }
    memoryCache.delete(key);
  }

  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (parsed && now - parsed.storedAt < CACHE_TTL_MS) {
          memoryCache.set(key, parsed);
          return parsed.value;
        }
        window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      }
    } catch {
      // Ignore storage quota or serialization errors
    }
  }

  return null;
}

export function setCachedItem<T>(key: string, value: T): void {
  const entry: CacheEntry<T> = { value, storedAt: Date.now() };
  memoryCache.set(key, entry);

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function getCachedCompanyFilings(
  company: string,
  jurisdiction: JurisdictionId
): {
  corporateIdentifier?: string;
  point2Checks?: StatutoryCheckItem[];
  point3Findings?: CrossVerificationFinding[];
  point4Records?: WatchdogRecord[];
} | null {
  const key = `company-profile::${normalizeCacheCompany(company)}::${jurisdiction}`;
  return getCachedItem(key);
}

export function cacheCompanyFilingsFromReport(report: AuditReport): void {
  if (!report.company || report.company === "Unspecified Entity") return;
  const key = `company-profile::${normalizeCacheCompany(report.company)}::${report.jurisdiction}`;
  setCachedItem(key, {
    corporateIdentifier: report.corporateIdentifier,
    point2Checks: report.point2.checks,
    point3Findings: report.point3.findings,
    point4Records: report.point4.records,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRateLimitErrorPayload(status: number, bodyText: string): boolean {
  return (
    status === 429 ||
    status === 503 ||
    /429|RESOURCE_EXHAUSTED|quota|rate[- ]limit/i.test(bodyText)
  );
}

export interface RetryFetchOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number) => void;
  signal?: AbortSignal;
}

export async function fetchJsonWithBackoff<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryFetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T | null; rateLimited: boolean; errorText?: string }> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 2000;

  let attempt = 0;
  while (true) {
    const res = await fetch(input, { ...init, signal: options.signal ?? init?.signal });
    const text = await res.text();
    let parsed: T | null = null;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      parsed = null;
    }

    const rateLimited = isRateLimitErrorPayload(res.status, text);

    if (res.ok) {
      return { ok: true, status: res.status, data: parsed, rateLimited: false };
    }

    if (rateLimited && attempt < maxRetries) {
      attempt += 1;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      options.onRetry?.(attempt, maxRetries, delayMs);
      await sleep(delayMs);
      continue;
    }

    const errObj = parsed as { error?: string } | null;
    return {
      ok: false,
      status: res.status,
      data: parsed,
      rateLimited,
      errorText: errObj?.error || `Request failed (${res.status})`,
    };
  }
}
