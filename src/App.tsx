import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { AboutSection } from "./components/AboutSection.tsx";
import { BuzzwordLibrary } from "./components/BuzzwordLibrary.tsx";
import { FourPointEngine } from "./components/FourPointEngine.tsx";
import { GeminiChatbot } from "./components/GeminiChatbot.tsx";
import { ResultsSummaryCard } from "./components/ResultsSummaryCard.tsx";
import { JURISDICTIONS } from "./data/lexicon.ts";
import {
  buildAnalyzeCacheKey,
  cacheCompanyFilingsFromReport,
  fetchJsonWithBackoff,
  getCachedItem,
  setCachedItem,
  type SectionVerificationResponse,
} from "./lib/apiClient.ts";
import type { AuditReport, JurisdictionId } from "./types/audit.ts";

interface SamplePreset {
  label: string;
  company: string;
  jurisdiction: JurisdictionId;
  claim: string;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    label: "Vague Packaging Claim (India)",
    company: "Hindustan Unilever",
    jurisdiction: "india",
    claim:
      "Our new eco-friendly, chemical-free, and 100% natural packaging is earth-friendly, green, and biodegradable for a guilt-free, planet-safe future.",
  },
  {
    label: "Metric-Backed BRSR Disclosure (India)",
    company: "ITC Limited",
    jurisdiction: "india",
    claim:
      "Manufacturing unit achieved 28% reduction in Scope 1 & Scope 2 tCO2e emissions against FY2020 baseline, utilizes 45% PCR content in rigid packaging, and maintains 100% CPCB EPR compliance under SEBI BRSR Principle 6.",
  },
  {
    label: "Contextual BRSR Alignment (India)",
    company: "Asian Paints",
    jurisdiction: "india",
    claim:
      "Asian Paints manufactures eco-friendly, low-VOC decorative coatings through water-wise and green operations.",
  },
  {
    label: "Carbon-Neutral Marketing Claim (EU)",
    company: "Shell",
    jurisdiction: "eu",
    claim:
      "Drive climate-neutral and green-transition miles with our sustainable, carbon-neutral fuel program designed to be nature-positive.",
  },
];

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("vericlaim-theme") === "dark";
    } catch {
      return false;
    }
  });

  const [claim, setClaim] = useState("");
  const [company, setCompany] = useState("");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionId>("india");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeNote, setAnalyzeNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      window.localStorage.setItem("vericlaim-theme", darkMode ? "dark" : "light");
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [darkMode]);

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCompany = company.trim();
    const trimmedClaim = claim.trim();
    if (!trimmedCompany) {
      setErrorMessage("Enter a company or entity name to analyze.");
      return;
    }
    if (!trimmedClaim) {
      setErrorMessage("Enter an environmental or sustainability claim to analyze.");
      return;
    }

    setErrorMessage(null);
    setAnalyzeNote(null);

    const cacheKey = buildAnalyzeCacheKey(trimmedCompany, jurisdiction, trimmedClaim);
    const cached = getCachedItem<AuditReport>(cacheKey);
    if (cached) {
      setReport(cached);
      setAnalyzeNote(`Loaded verified baseline report for ${trimmedCompany} from local cache.`);
      return;
    }

    setReport(null);
    setIsAnalyzing(true);

    try {
      const result = await fetchJsonWithBackoff<AuditReport>(
        "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim: trimmedClaim,
            company: trimmedCompany,
            jurisdiction,
            deepVerify: false,
          }),
        },
        {
          maxRetries: 2,
          baseDelayMs: 1500,
          onRetry: (attempt, maxRetries, delayMs) => {
            setAnalyzeNote(
              `Service busy — retrying automatically in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${maxRetries})...`
            );
          },
        }
      );

      if (!result.ok || !result.data) {
        throw new Error(result.errorText || `Analysis failed with status ${result.status}`);
      }

      setCachedItem(cacheKey, result.data);
      cacheCompanyFilingsFromReport(result.data);
      setReport(result.data);
      setAnalyzeNote(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to complete claim analysis."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySectionEnrichment = useCallback((patch: SectionVerificationResponse) => {
    setReport((prev) => {
      if (!prev) return prev;
      const updated: AuditReport = {
        ...prev,
        point1: patch.point1 ?? prev.point1,
        point2: patch.point2 ?? prev.point2,
        point3: patch.point3 ?? prev.point3,
        point4: patch.point4 ?? prev.point4,
        evidenceStrengthIndex: patch.evidenceStrengthIndex ?? prev.evidenceStrengthIndex,
        scoreBreakdown: patch.scoreBreakdown ?? prev.scoreBreakdown,
        overallVerdict: patch.overallVerdict ?? prev.overallVerdict,
        overallStatus: patch.overallStatus ?? prev.overallStatus,
        evidenceCounts: patch.evidenceCounts ?? prev.evidenceCounts,
        executiveSummary: patch.executiveSummary ?? prev.executiveSummary,
      };
      const key = buildAnalyzeCacheKey(updated.company, updated.jurisdiction, updated.claim);
      setCachedItem(key, updated);
      cacheCompanyFilingsFromReport(updated);
      return updated;
    });
  }, []);

  const handleReset = () => {
    setClaim("");
    setCompany("");
    setReport(null);
    setAnalyzeNote(null);
    setErrorMessage(null);
  };

  const applySample = (preset: SamplePreset) => {
    setCompany(preset.company);
    setJurisdiction(preset.jurisdiction);
    setClaim(preset.claim);
    setAnalyzeNote(null);
    setErrorMessage(null);
  };

  return (
    <div id="top" className="min-h-screen bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Top Bar Contract: 1 row, 3 zones */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="inline-flex items-center gap-2.5 text-base font-semibold tracking-tight text-neutral-950 dark:text-neutral-100 whitespace-nowrap shrink-0"
          >
            <img
              src="/assets/aistudio/vericlaim-icon.png"
              alt="The VeriClaim Engine logo"
              className="h-8 w-auto object-contain shrink-0 select-none dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.45)]"
            />
            <span>The VeriClaim Engine</span>
          </a>

          {report && (
            <nav
              aria-label="Primary Navigation"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600 dark:text-neutral-400"
            >
              <a
                href="#analyzer"
                className="hover:text-neutral-950 dark:hover:text-neutral-100 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                Analyzer
              </a>
              <a
                href="#four-point-engine"
                className="hover:text-neutral-950 dark:hover:text-neutral-100 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                Four-Point Audit
              </a>
              <a
                href="#ai-assistant"
                className="hover:text-neutral-950 dark:hover:text-neutral-100 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                AI Assistant
              </a>
              <a
                href="#buzzword-lexicon"
                className="hover:text-neutral-950 dark:hover:text-neutral-100 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                Buzzword Lexicon
              </a>
              <a
                href="#about"
                className="hover:text-neutral-950 dark:hover:text-neutral-100 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
              >
                About
              </a>
            </nav>
          )}

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {darkMode ? (
              <>
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        {/* Header Inputs Section */}
        <section id="analyzer" className="space-y-6">
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-100 [text-wrap:balance]">
              Empirical &amp; Regulatory Claim Verification
            </h1>
            <p className="text-sm md:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Cross-verify corporate environmental marketing claims against 500 Category A greenwashing buzzwords and near-same-meaning variants, Category B empirical metrics, statutory BRSR/EU/FTC disclosures, and AI-verified public watchdog records.
            </p>
          </div>

          <form
            onSubmit={handleAnalyze}
            className="border border-neutral-200 dark:border-neutral-800 rounded-md p-6 space-y-5 bg-white dark:bg-neutral-950"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="company-input"
                  className="block text-xs font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Company / Entity Name
                </label>
                <input
                  id="company-input"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g., ITC Limited, Hindustan Unilever, Shell"
                  className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-950 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-950 dark:focus:ring-neutral-200"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="jurisdiction-select"
                  className="block text-xs font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Regulatory Jurisdiction
                </label>
                <select
                  id="jurisdiction-select"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value as JurisdictionId)}
                  className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-950 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-950 dark:focus:ring-neutral-200"
                >
                  {Object.values(JURISDICTIONS).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="claim-textarea"
                className="block text-xs font-medium text-neutral-800 dark:text-neutral-200"
              >
                Marketing or Sustainability Claim
              </label>
              <textarea
                id="claim-textarea"
                rows={4}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                placeholder="Paste the exact product label, advertisement copy, or ESG press statement to audit..."
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-950 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-950 dark:focus:ring-neutral-200 leading-relaxed"
              />
            </div>

            {analyzeNote && (
              <div
                aria-live="polite"
                className="border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-neutral-700 dark:text-neutral-300 rounded px-3.5 py-2.5 text-xs"
              >
                {analyzeNote}
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-300 rounded px-3.5 py-2.5 text-xs"
              >
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Examples:
                </span>
                {SAMPLE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applySample(preset)}
                    className="px-2.5 py-1 text-xs border border-neutral-200 dark:border-neutral-800 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isAnalyzing}
                className="px-5 py-2.5 text-sm font-medium bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isAnalyzing ? "Analyzing..." : "Analyze Claim"}
              </button>
            </div>
          </form>
        </section>

        {isAnalyzing && !report && (
          <section
            aria-live="polite"
            className="border border-neutral-200 dark:border-neutral-800 rounded-md p-5 text-xs font-mono text-neutral-600 dark:text-neutral-400"
          >
            {analyzeNote ||
              "Running semantic lexicon screening, statutory filing verification, and public watchdog scan..."}
          </section>
        )}

        {/* Audit Results, Four-Point Engine & Sticky AI Assistant (Rendered Only After Submission) */}
        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 min-w-0 space-y-10">
              <ResultsSummaryCard report={report} onReset={handleReset} />

              <FourPointEngine
                report={report}
                company={company}
                selectedJurisdiction={jurisdiction}
                onSectionEnriched={handleApplySectionEnrichment}
              />

              <BuzzwordLibrary
                matchedTerms={report.point1.categoryAMatches.map((m) => m.term)}
                matchedEntries={report.point1.categoryAMatches}
              />

              <AboutSection />
            </div>

            <aside
              aria-label="Sticky AI Assistant"
              className="lg:col-span-4 lg:sticky lg:top-6 self-start"
            >
              <GeminiChatbot report={report} />
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <div>
            The VeriClaim Engine · Woxsen University Undergraduate Research Team
          </div>
          <div>
            Educational decision-support tool for sustainability claim scrutiny.
          </div>
        </div>
      </footer>
    </div>
  );
}
