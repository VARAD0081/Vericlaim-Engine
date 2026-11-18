import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  buildGuardianCacheKey,
  enqueueSequential,
  fetchJsonWithBackoff,
  getCachedItem,
  setCachedItem,
  type GuardianScanResponse,
} from "../lib/apiClient.ts";
import type {
  EvidenceCategory,
  NewsVerificationVerdict,
  WatchdogRecord,
} from "../types/audit.ts";
import { EvidenceBadge } from "./EvidenceBadge.tsx";

interface GuardianNewsScannerProps {
  company: string;
  reportRecords?: WatchdogRecord[];
  reportStatus?: EvidenceCategory;
  reportSummary?: string;
  reportVerificationSummary?: string;
  hasActiveReport: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

type CategoryFilter = "All" | WatchdogRecord["category"];

const CATEGORY_FILTERS: CategoryFilter[] = [
  "All",
  "Lawsuit / Fine",
  "Complaint Ruling",
  "Watchdog",
  "News / Investigation",
];

function VerificationTag({ verdict }: { verdict: NewsVerificationVerdict }) {
  if (verdict === "Verified Accurate") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Verified Accurate</span>
      </span>
    );
  }
  if (verdict === "Source Direct") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-neutral-100 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0">
        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Guardian Source Direct</span>
      </span>
    );
  }
  if (verdict === "Partially Verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0">
        <HelpCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Partially Verified</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0">
      <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Unverified / Disputed</span>
    </span>
  );
}

export function GuardianNewsScanner({
  company,
  reportRecords,
  reportStatus,
  reportSummary,
  reportVerificationSummary,
  hasActiveReport,
  isExpanded = true,
  onToggleExpand,
}: GuardianNewsScannerProps) {
  const [scannedRecords, setScannedRecords] = useState<WatchdogRecord[] | null>(null);
  const [scannedStatus, setScannedStatus] = useState<EvidenceCategory | null>(null);
  const [scannedVerificationSummary, setScannedVerificationSummary] = useState<string | null>(null);
  const [scannedForCompany, setScannedForCompany] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");

  useEffect(() => {
    if (hasActiveReport) {
      setScannedRecords(null);
      setScannedStatus(null);
      setScannedVerificationSummary(null);
      setStatusNotice(null);
    }
  }, [hasActiveReport, reportRecords, reportSummary]);

  const runGuardianScan = async (targetCompany: string, withAiVerify: boolean) => {
    const clean = targetCompany.trim();
    if (!clean) return;

    const cacheKey = buildGuardianCacheKey(clean, withAiVerify);
    const cached = getCachedItem<GuardianScanResponse>(cacheKey);
    if (cached) {
      setScannedRecords(cached.records);
      setScannedStatus(cached.status);
      setScannedVerificationSummary(cached.newsVerificationSummary);
      setScannedForCompany(clean);
      setStatusNotice(`Loaded ${withAiVerify ? "AI-verified" : "Guardian"} records for ${clean} from local cache.`);
      return;
    }

    await enqueueSequential(async () => {
      setIsScanning(true);
      setStatusNotice(
        withAiVerify
          ? `Running search-grounded AI verification on ${clean} news articles...`
          : `Fetching live Guardian coverage for ${clean}...`
      );

      const url = `/api/guardian-scan?company=${encodeURIComponent(clean)}${
        withAiVerify ? "&verify=true&retryOn429=true" : ""
      }`;

      const result = await fetchJsonWithBackoff<GuardianScanResponse>(
        url,
        undefined,
        {
          maxRetries: withAiVerify ? 3 : 1,
          baseDelayMs: 2000,
          onRetry: (attempt, maxRetries, delayMs) => {
            setStatusNotice(
              `AI verification rate-limited — waiting ${Math.round(
                delayMs / 1000
              )}s before retry ${attempt}/${maxRetries}...`
            );
          },
        }
      );

      if (result.ok && result.data) {
        const payload = result.data;
        setCachedItem(cacheKey, payload);
        setScannedRecords(Array.isArray(payload.records) ? payload.records : []);
        setScannedStatus(payload.status ?? "Inconclusive");
        setScannedVerificationSummary(payload.newsVerificationSummary ?? null);
        setScannedForCompany(clean);
        setStatusNotice(
          payload.rateLimitedFallback
            ? "Displaying raw Guardian articles directly while AI verification quota recovers."
            : null
        );
      } else if (result.rateLimited) {
        // Gracefully fall back to displaying raw Guardian articles instead of throwing a red 429 banner
        const rawFallback = await fetchJsonWithBackoff<GuardianScanResponse>(
          `/api/guardian-scan?company=${encodeURIComponent(clean)}`,
          undefined,
          { maxRetries: 0 }
        );
        if (rawFallback.ok && rawFallback.data) {
          setScannedRecords(rawFallback.data.records);
          setScannedStatus(rawFallback.data.status);
          setScannedVerificationSummary(rawFallback.data.newsVerificationSummary);
          setScannedForCompany(clean);
        }
        setStatusNotice(
          "API quota buffer reached — displaying direct Guardian & public archive headlines without interruption."
        );
      } else {
        setStatusNotice(result.errorText || "Unable to refresh Guardian news records right now.");
      }

      setIsScanning(false);
    });
  };

  const activeRecords = scannedRecords ?? reportRecords ?? [];
  const activeStatus: EvidenceCategory =
    scannedStatus ?? reportStatus ?? (company.trim() ? "Inconclusive" : "Missing");
  const activeVerificationSummary =
    scannedVerificationSummary ?? reportVerificationSummary ?? null;

  const filteredRecords = useMemo(() => {
    if (categoryFilter === "All") return activeRecords;
    return activeRecords.filter((rec) => rec.category === categoryFilter);
  }, [activeRecords, categoryFilter]);

  const hasDataToShow = hasActiveReport || scannedRecords !== null;

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-md">
      <div className="p-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onToggleExpand?.()}
          aria-expanded={isExpanded}
          className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer group"
        >
          {onToggleExpand ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
            )
          ) : null}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-100 group-hover:underline">
              04. Public Watchdogs, News Fact-Check &amp; Lawsuits
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              {activeRecords.length > 0
                ? `${activeRecords.length} Guardian/public news record(s) retrieved for ${
                    company.trim() || "target company"
                  }.`
                : `Scans Guardian coverage, regulatory rulings, and litigation for ${
                    company.trim() || "the target company"
                  }.`}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {onToggleExpand && (
            <button
              type="button"
              onClick={() => onToggleExpand()}
              className="px-2.5 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
            >
              {isExpanded ? "Collapse" : "Expand Feed"}
            </button>
          )}
          {hasDataToShow ? (
            <EvidenceBadge category={activeStatus} />
          ) : (
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              Awaiting entity query
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
          {company.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Raw headlines load without Gemini calls; click AI Fact-Check for optional search verification.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runGuardianScan(company, false)}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isScanning ? "opacity-50" : ""}`}
                    aria-hidden="true"
                  />
                  <span>{isScanning ? "Scanning..." : "Scan Guardian News"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void runGuardianScan(company, true)}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isScanning ? "Verifying..." : "Fact-Check with AI"}</span>
                </button>
              </div>
            </div>
          )}

          {statusNotice && (
            <div className="border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-neutral-700 dark:text-neutral-300 rounded px-3.5 py-2.5 text-xs">
              {statusNotice}
            </div>
          )}

          {hasDataToShow ? (
            <>
              <div className="space-y-2">
                {reportSummary && !scannedRecords && (
                  <p className="text-sm text-neutral-800 dark:text-neutral-200">
                    {reportSummary}
                  </p>
                )}
                {scannedRecords && (
                  <p className="text-sm text-neutral-800 dark:text-neutral-200">
                    Guardian news &amp; litigation scan completed for{" "}
                    <span className="font-semibold">{scannedForCompany}</span>.
                  </p>
                )}
                {activeVerificationSummary && (
                  <div className="border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 rounded px-3.5 py-2.5 text-xs text-neutral-700 dark:text-neutral-300">
                    <span className="font-semibold text-neutral-950 dark:text-neutral-100">
                      News Archive Status:{" "}
                    </span>
                    {activeVerificationSummary}
                  </div>
                )}
              </div>

              {activeRecords.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CATEGORY_FILTERS.map((cat) => {
                      const count =
                        cat === "All"
                          ? activeRecords.length
                          : activeRecords.filter((r) => r.category === cat).length;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                            categoryFilter === cat
                              ? "bg-neutral-950 text-white border-neutral-950 dark:bg-neutral-100 dark:text-neutral-950 dark:border-neutral-100"
                              : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-950 dark:text-neutral-300 dark:border-neutral-800 dark:hover:bg-neutral-900"
                          }`}
                        >
                          {cat} ({count})
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                    {filteredRecords.length} record{filteredRecords.length === 1 ? "" : "s"}
                  </span>
                </div>
              )}

              {filteredRecords.length > 0 ? (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded">
                  {filteredRecords.map((rec, index) => (
                    <li key={`${rec.title}-${index}`} className="p-4 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-medium text-neutral-700 dark:text-neutral-300">
                              {rec.source}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{rec.date}</span>
                            <span aria-hidden="true">·</span>
                            <span>{rec.category}</span>
                          </div>
                          {rec.url ? (
                            <a
                              href={rec.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-950 dark:text-neutral-100 hover:underline"
                            >
                              <span>{rec.title}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            </a>
                          ) : (
                            <div className="text-sm font-medium text-neutral-950 dark:text-neutral-100">
                              {rec.title}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <VerificationTag verdict={rec.verificationVerdict} />
                          <EvidenceBadge category={rec.evidenceTag} />
                        </div>
                      </div>
                      {rec.summary && (
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-4xl">
                          {rec.summary}
                        </p>
                      )}
                      {rec.verificationVerdict !== "Source Direct" && rec.verificationDetail && (
                        <div className="text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded px-3 py-2">
                          <span className="font-medium text-neutral-950 dark:text-neutral-100">
                            Fact &amp; Wording Check:{" "}
                          </span>
                          {rec.verificationDetail}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 text-xs text-neutral-600 dark:text-neutral-400">
                  {activeRecords.length > 0
                    ? `No records match the "${categoryFilter}" category filter.`
                    : "No adverse watchdog records, ASCI rulings, or lawsuits were surfaced for this query."}
                </div>
              )}
            </>
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Enter a company name and submit the claim above to surface recent news articles, lawsuits, and regulatory filings.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
