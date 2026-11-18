import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import { JURISDICTIONS } from "../data/lexicon.ts";
import {
  buildSectionCacheKey,
  enqueueSequential,
  fetchJsonWithBackoff,
  getCachedItem,
  setCachedItem,
  type LazyAuditSectionId,
  type SectionVerificationResponse,
} from "../lib/apiClient.ts";
import type { AuditReport, JurisdictionId } from "../types/audit.ts";
import { EvidenceBadge } from "./EvidenceBadge.tsx";
import { GuardianNewsScanner } from "./GuardianNewsScanner.tsx";

interface FourPointEngineProps {
  report: AuditReport | null;
  company: string;
  selectedJurisdiction: JurisdictionId;
  onSectionEnriched?: (patch: SectionVerificationResponse) => void;
}

export function FourPointEngine({
  report,
  company,
  selectedJurisdiction,
  onSectionEnriched,
}: FourPointEngineProps) {
  const activeJurisdictionSpec = JURISDICTIONS[report?.jurisdiction ?? selectedJurisdiction];
  const statutoryRows = report
    ? report.point2.checks
    : activeJurisdictionSpec.statutoryIndicators.map((ind) => ({
        ...ind,
        status: "Inconclusive" as const,
        finding: "Awaiting claim submission for empirical & statutory cross-verification.",
      }));

  // Section 01 is open by default; 02, 03, 04 lazy-expand so Gemini API calls never fire in parallel on initial load
  const [expanded, setExpanded] = useState<Record<LazyAuditSectionId, boolean>>({
    point1: true,
    point2: false,
    point3: false,
    point4: false,
  });

  const [verifiedSections, setVerifiedSections] = useState<Record<LazyAuditSectionId, boolean>>({
    point1: false,
    point2: false,
    point3: false,
    point4: false,
  });

  const [loadingSection, setLoadingSection] = useState<LazyAuditSectionId | null>(null);
  const [sectionNotices, setSectionNotices] = useState<Partial<Record<LazyAuditSectionId, string>>>({});

  // Reset section expansion & verification markers only when the report ID changes
  useEffect(() => {
    setExpanded({
      point1: true,
      point2: false,
      point3: false,
      point4: false,
    });
    setVerifiedSections({
      point1: false,
      point2: false,
      point3: false,
      point4: false,
    });
    setSectionNotices({});
  }, [report?.id]);

  const verifySectionLazily = async (section: LazyAuditSectionId, force = false) => {
    if (!report) return;
    if (!force && verifiedSections[section]) return;

    const cacheKey = buildSectionCacheKey(
      report.company,
      report.jurisdiction,
      section,
      report.claim
    );
    const cached = getCachedItem<SectionVerificationResponse>(cacheKey);
    if (cached && !force) {
      setVerifiedSections((prev) => ({ ...prev, [section]: true }));
      setSectionNotices((prev) => ({
        ...prev,
        [section]: `Pulled AI cross-verification for ${report.company} from local cache.`,
      }));
      onSectionEnriched?.(cached);
      return;
    }

    await enqueueSequential(async () => {
      setLoadingSection(section);
      setSectionNotices((prev) => ({
        ...prev,
        [section]: `Running sequential AI cross-verification for ${report.company}...`,
      }));

      const res = await fetchJsonWithBackoff<SectionVerificationResponse>(
        "/api/verify-section",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, report }),
        },
        {
          maxRetries: 3,
          baseDelayMs: 2000,
          onRetry: (attempt, maxRetries, delayMs) => {
            setSectionNotices((prev) => ({
              ...prev,
              [section]: `Rate limit buffer active — retrying in ${Math.round(
                delayMs / 1000
              )}s (attempt ${attempt}/${maxRetries})...`,
            }));
          },
        }
      );

      setLoadingSection((curr) => (curr === section ? null : curr));

      if (res.ok && res.data) {
        setCachedItem(cacheKey, res.data);
        setVerifiedSections((prev) => ({ ...prev, [section]: true }));
        setSectionNotices((prev) => ({
          ...prev,
          [section]: res.data?.note || "AI search-grounded cross-verification applied.",
        }));
        onSectionEnriched?.(res.data);
      } else if (res.rateLimited) {
        // Never throw a harsh red 429 banner — keep local/registry findings intact calmly
        setVerifiedSections((prev) => ({ ...prev, [section]: true }));
        setSectionNotices((prev) => ({
          ...prev,
          [section]:
            "API rate limit buffer reached; retaining verified corporate filing & regulatory baseline.",
        }));
      } else {
        setSectionNotices((prev) => ({
          ...prev,
          [section]:
            "Live AI enrichment unavailable right now; displaying verified regulatory baseline.",
        }));
      }
    });
  };

  const toggleSection = (section: LazyAuditSectionId) => {
    const nextOpen = !expanded[section];
    setExpanded((prev) => ({ ...prev, [section]: nextOpen }));
    if (nextOpen && report && !verifiedSections[section] && section !== "point4") {
      void verifySectionLazily(section, false);
    }
  };

  return (
    <section id="four-point-engine" className="space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
          Four-Point Analytical &amp; Cross-Verification Engine
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl">
          Every claim is evaluated across contextual semantic mapping (500-term lexicon + near-meaning variants), statutory disclosure frameworks, corporate compliance records, and public watchdog news. Expand any section to inspect full tables and trigger cached sequential AI verification.
        </p>
      </div>

      {/* Point 1: Marketing Claim vs. Vague Words */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-md">
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-100">
              01. Marketing Claim vs. Contextual Lexicon Screening
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Evaluates 500 greenwashing terms and near-same-meaning concepts contextually against Category B metrics and verified corporate filings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report && (
              <button
                type="button"
                onClick={() => void verifySectionLazily("point1", true)}
                disabled={loadingSection === "point1"}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{loadingSection === "point1" ? "Verifying..." : "AI Semantic Check"}</span>
              </button>
            )}
            {report ? (
              <EvidenceBadge category={report.point1.status} />
            ) : (
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                Ready for scan
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-5">
          {sectionNotices.point1 && (
            <div className="border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 rounded px-3.5 py-2 text-xs text-neutral-700 dark:text-neutral-300">
              {sectionNotices.point1}
            </div>
          )}
          {report ? (
            <>
              <div className="space-y-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                  <p className="text-sm text-neutral-800 dark:text-neutral-200">
                    {report.point1.summary}
                  </p>
                  <div className="font-mono tabular-nums text-neutral-600 dark:text-neutral-400 whitespace-nowrap shrink-0">
                    Lexicon Density: {report.point1.buzzwordDensityRatio.toFixed(1)}%
                  </div>
                </div>
                {report.point1.semanticIntentSummary && (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    Conceptual Intent: {report.point1.semanticIntentSummary}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Category A — 500-Term &amp; Near-Meaning Matches
                    </span>
                    <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                      {report.point1.categoryAMatches.length} matched
                    </span>
                  </div>
                  {report.point1.categoryAMatches.length > 0 ? (
                    <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded">
                      {report.point1.categoryAMatches.map((match) => {
                        const isBacked = match.contextualBacking === "Substantiated by Filing";
                        const isSemantic = match.matchType === "Semantic / Near-Meaning";
                        return (
                          <li key={match.term} className="p-3 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`font-mono text-xs font-semibold ${
                                    isBacked
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-red-700 dark:text-red-400"
                                  }`}
                                >
                                  {match.term}
                                </span>
                                {isSemantic && match.matchedPhrase && (
                                  <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                                    (Semantic via &quot;{match.matchedPhrase}&quot;)
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[11px] font-medium ${
                                  isBacked
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-red-700 dark:text-red-400"
                                }`}
                              >
                                {match.contextualBacking ?? "Unbacked Buzzword"}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              {match.sector}
                            </div>
                            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                              {isBacked && match.backingExplanation
                                ? match.backingExplanation
                                : match.regulatoryRisk}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 text-xs text-neutral-600 dark:text-neutral-400">
                      No Category A greenwashing buzzwords or near-meaning variants detected in the submitted text.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Category B — Measurable Empirical Metrics
                    </span>
                    <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                      {report.point1.categoryBMatches.length} matched
                    </span>
                  </div>
                  {report.point1.categoryBMatches.length > 0 ? (
                    <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded">
                      {report.point1.categoryBMatches.map((metric, index) => (
                        <li key={`${metric.label}-${index}`} className="p-3 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              {metric.matchedText}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {metric.category}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-600 dark:text-neutral-400">
                            {metric.label}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 text-xs text-neutral-600 dark:text-neutral-400">
                      No explicit Category B units (tCO2e, PCR %, kWh/KL, or ISO standards) appeared verbatim in the marketing slogan; corporate filing verification is evaluated in Points 2 &amp; 3.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Point 2: Statutory Disclosures & BRSR (Lazy-loads sequential AI verification when expanded) */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-md">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggleSection("point2")}
            aria-expanded={expanded.point2}
            className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer group"
          >
            {expanded.point2 ? (
              <ChevronDown className="h-4 w-4 mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-100 group-hover:underline">
                02. Statutory Disclosures &amp; BRSR Alignment
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                {report ? report.point2.summary : activeJurisdictionSpec.primaryStatute}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleSection("point2")}
              className="px-2.5 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
            >
              {expanded.point2 ? "Collapse" : "Expand & Verify"}
            </button>
            {report ? (
              <EvidenceBadge category={report.point2.status} />
            ) : (
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                {activeJurisdictionSpec.shortName}
              </span>
            )}
          </div>
        </div>

        {expanded.point2 && (
          <div className="p-5 pt-0 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="pt-4 flex flex-wrap items-center justify-between gap-2">
              {sectionNotices.point2 ? (
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  {sectionNotices.point2}
                </div>
              ) : (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Showing {statutoryRows.length} statutory indicator checks.
                </div>
              )}
              {report && (
                <button
                  type="button"
                  onClick={() => void verifySectionLazily("point2", true)}
                  disabled={loadingSection === "point2"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {loadingSection === "point2" ? "Cross-Checking..." : "Refresh AI Statutory Check"}
                  </span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400">
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Code</th>
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Indicator</th>
                    <th className="py-2.5 px-3 font-medium">Statutory Benchmark</th>
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Evidence</th>
                    <th className="py-2.5 px-3 font-medium">Audit Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {statutoryRows.map((row) => (
                    <tr key={row.code} className="align-top">
                      <td className="py-3 px-3 font-mono whitespace-nowrap text-neutral-900 dark:text-neutral-100">
                        {row.code}
                      </td>
                      <td className="py-3 px-3 font-medium text-neutral-900 dark:text-neutral-100 min-w-[160px]">
                        <div>{row.title}</div>
                        <div className="text-[11px] font-normal text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {row.framework}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-neutral-600 dark:text-neutral-400 leading-relaxed min-w-[220px]">
                        {row.requirement}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <EvidenceBadge category={row.status} />
                      </td>
                      <td className="py-3 px-3 text-neutral-700 dark:text-neutral-300 leading-relaxed min-w-[220px]">
                        {row.finding}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Point 3: Corporate Filings & Directive Verification Answers (Lazy-loads when expanded) */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-md">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggleSection("point3")}
            aria-expanded={expanded.point3}
            className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer group"
          >
            {expanded.point3 ? (
              <ChevronDown className="h-4 w-4 mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-100 group-hover:underline">
                03. Corporate Filings &amp; Directive Cross-Verification
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                {report
                  ? report.point3.summary
                  : "Web-grounded verification of public BRSR/ESG disclosures, lifecycle claims, and jurisdiction rules."}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleSection("point3")}
              className="px-2.5 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
            >
              {expanded.point3 ? "Collapse" : "Expand & Verify"}
            </button>
            {report ? (
              <EvidenceBadge category={report.point3.status} />
            ) : (
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                Awaiting claim
              </span>
            )}
          </div>
        </div>

        {expanded.point3 && (
          <div className="p-5 pt-0 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="pt-4 flex flex-wrap items-center justify-between gap-2">
              {sectionNotices.point3 ? (
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  {sectionNotices.point3}
                </div>
              ) : (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Corporate disclosure dossier for {report?.company || company}.
                </div>
              )}
              {report && (
                <button
                  type="button"
                  onClick={() => void verifySectionLazily("point3", true)}
                  disabled={loadingSection === "point3"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {loadingSection === "point3"
                      ? "Researching..."
                      : "Deepen with Gemini Search"}
                  </span>
                </button>
              )}
            </div>

            {report ? (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded">
                {report.point3.findings.map((item, idx) => (
                  <div key={`${item.topic}-${idx}`} className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-neutral-950 dark:text-neutral-100">
                        {item.topic}
                      </h4>
                      <EvidenceBadge category={item.status} />
                    </div>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      {item.answer}
                    </p>
                    {item.sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {item.sources.map((src, sIdx) => (
                          <a
                            key={`${src.url}-${sIdx}`}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-100 underline underline-offset-2"
                          >
                            <span className="truncate max-w-[220px]">{src.title}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Point 4: GuardianNewsScanner (Collapsible, cached, sequential backoff) */}
      <GuardianNewsScanner
        company={report ? report.company : company}
        reportRecords={report?.point4.records}
        reportStatus={report?.point4.status}
        reportSummary={report?.point4.summary}
        reportVerificationSummary={report?.point4.newsVerificationSummary}
        hasActiveReport={Boolean(report)}
        isExpanded={expanded.point4}
        onToggleExpand={() => toggleSection("point4")}
      />
    </section>
  );
}
