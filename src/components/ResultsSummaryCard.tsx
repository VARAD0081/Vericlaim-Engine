import { useState } from "react";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import { exportAuditReportToPdf } from "../lib/pdfExport.ts";
import type { AuditReport, EvidenceCategory } from "../types/audit.ts";
import { EvidenceBadge } from "./EvidenceBadge.tsx";

interface ResultsSummaryCardProps {
  report: AuditReport;
  onReset: () => void;
}

const EVIDENCE_ORDER: EvidenceCategory[] = [
  "Supporting",
  "Partially Verified",
  "Contradictory",
  "Missing",
  "Inconclusive",
];

function getCompanyInitials(company: string): string {
  const words = company
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "VC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function ResultsSummaryCard({ report, onReset }: ResultsSummaryCardProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const filledSegments = Math.round(report.evidenceStrengthIndex);
  const initials = getCompanyInitials(report.company);

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportAuditReportToPdf(report);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = async () => {
    const summaryText = [
      `THE VERICLAIM ENGINE — AUDIT REPORT (${report.id})`,
      `Entity: ${report.company}${report.corporateIdentifier ? ` (${report.corporateIdentifier})` : ""}`,
      `Jurisdiction: ${report.jurisdictionLabel}`,
      `Evidence Strength Index: ${report.evidenceStrengthIndex.toFixed(1)} / 10`,
      `Assessment: ${report.overallVerdict} (${report.overallStatus})`,
      `Claim: "${report.claim}"`,
      `Category A Buzzwords Detected (${report.point1.categoryAMatches.length}): ${
        report.point1.categoryAMatches.map((b) => b.term).join(", ") || "None"
      }`,
      `Category B Metrics Detected (${report.point1.categoryBMatches.length}): ${
        report.point1.categoryBMatches.map((m) => m.matchedText).join(", ") || "None"
      }`,
      `Summary: ${report.executiveSummary}`,
      `Note: Educational decision-support assessment; not formal legal counsel.`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-label="Audit Report Summary"
      className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 rounded-md"
    >
      <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-start gap-4 min-w-0">
          <div
            aria-hidden="true"
            className="h-11 w-11 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950 flex items-center justify-center font-mono text-sm font-semibold shrink-0"
          >
            {initials}
          </div>
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
              <span>Report {report.id}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {report.company}
              </span>
              {report.corporateIdentifier && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{report.corporateIdentifier}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{report.jurisdictionLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
                {report.overallVerdict}
              </h2>
              <EvidenceBadge category={report.overallStatus} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <div className="text-left lg:text-right mr-2">
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Evidence Strength Index
            </div>
            <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-3xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
                {report.evidenceStrengthIndex.toFixed(1)}
              </span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">/ 10.0</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isExporting ? "Generating PDF..." : "Export Report to PDF"}</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy Report"}</span>
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* 10-Point Meter & Sub-Score Breakdown */}
      <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
            <span>10-Point Verification Scale</span>
            <span className="font-mono tabular-nums">
              {filledSegments} / 10 index segments
            </span>
          </div>
          <div
            className="grid grid-cols-10 gap-1.5"
            role="img"
            aria-label={`Evidence Strength Index ${report.evidenceStrengthIndex.toFixed(1)} out of 10`}
          >
            {Array.from({ length: 10 }, (_, idx) => {
              const active = idx < filledSegments;
              const tone = !active
                ? "bg-neutral-100 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
                : report.evidenceStrengthIndex >= 7
                ? "bg-emerald-700 dark:bg-emerald-500 border-emerald-700 dark:border-emerald-500"
                : report.evidenceStrengthIndex >= 4
                ? "bg-amber-600 dark:bg-amber-500 border-amber-600 dark:border-amber-500"
                : "bg-red-700 dark:bg-red-500 border-red-700 dark:border-red-500";
              return <div key={idx} className={`h-2 rounded-xs border ${tone}`} />;
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Claim Specificity</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-neutral-950 dark:text-neutral-100">
              {report.scoreBreakdown.claimSpecificity.toFixed(1)}{" "}
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/ 2.5</span>
            </div>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Metric Substantiation</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-neutral-950 dark:text-neutral-100">
              {report.scoreBreakdown.metricSubstantiation.toFixed(1)}{" "}
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/ 2.5</span>
            </div>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Statutory Alignment</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-neutral-950 dark:text-neutral-100">
              {report.scoreBreakdown.statutoryAlignment.toFixed(1)}{" "}
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/ 2.5</span>
            </div>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Watchdog Standing</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-neutral-950 dark:text-neutral-100">
              {report.scoreBreakdown.watchdogStanding.toFixed(1)}{" "}
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/ 2.5</span>
            </div>
          </div>
        </div>
      </div>

      {/* Categorized Evidence Badges & Audit Summary */}
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Categorized Evidence Distribution
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {EVIDENCE_ORDER.map((category) => (
              <EvidenceBadge
                key={category}
                category={category}
                count={report.evidenceCounts[category]}
              />
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Audit Summary (Educational Decision-Support)
          </div>
          <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 max-w-4xl">
            {report.executiveSummary}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Educational positioning notice: The VeriClaim Engine surfaces lexical, statutory, and public-record indicators for academic and analytical decision support. It does not constitute formal legal advice or statutory certification.
          </p>
        </div>
      </div>
    </section>
  );
}
