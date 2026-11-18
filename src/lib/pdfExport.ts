import { jsPDF } from "jspdf";
import type { AuditReport, EvidenceCategory } from "../types/audit.ts";

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

function translateStatusForPresentation(status: EvidenceCategory): string {
  switch (status) {
    case "Supporting":
      return "Supported by Evidence";
    case "Partially Verified":
      return "Partially Verified (Directional Alignment)";
    case "Contradictory":
      return "Flagged / Contradictory";
    case "Missing":
      return "Evidence Missing";
    case "Inconclusive":
      return "Needs Further Verification";
  }
}

let cachedLogoDataUrl: string | null = null;

async function loadLogoPngDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch("/assets/aistudio/vericlaim-icon.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (dataUrl) cachedLogoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

export async function exportAuditReportToPdf(report: AuditReport): Promise<void> {
  const logoDataUrl = await loadLogoPngDataUrl();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  let y = 16;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const writeWrappedText = (
    text: string,
    x: number,
    maxWidth: number,
    lineHeight: number,
    fontSize = 9.5,
    color: [number, number, number] = [38, 38, 38],
    fontStyle: "normal" | "bold" = "normal"
  ) => {
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      doc.text(line, x, y);
      y += lineHeight;
    }
  };

  const writeClickableLink = (label: string, url: string, x: number, maxWidth: number) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(29, 78, 216);
    const safeLabel = label.length > 88 ? `${label.slice(0, 85)}...` : label;
    const lines = doc.splitTextToSize(`Source: ${safeLabel}`, maxWidth) as string[];
    ensureSpace(lines.length * 4.2 + 2);
    doc.textWithLink(lines[0], x, y, { url });
    // Draw subtle underline for link clarity
    const linkWidth = Math.min(maxWidth, doc.getTextWidth(lines[0]));
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.2);
    doc.line(x, y + 0.8, x + linkWidth, y + 0.8);
    y += 4.8;
  };

  const drawSectionHeading = (title: string) => {
    ensureSpace(14);
    y += 3;
    doc.setDrawColor(229, 229, 229);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(10, 10, 10);
    doc.text(title, marginX, y);
    y += 5.5;
  };

  // ============================================================================
  // 1. HEADER & BRANDING
  // ============================================================================
  // Crisp top accent bar and clean white masthead so the logo blends seamlessly
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 2, "F");

  let titleStartX = marginX;
  if (logoDataUrl) {
    // Icon aspect ratio is 256:203 -> 16.4mm x 13mm
    doc.addImage(logoDataUrl, "PNG", marginX, 7.5, 16.4, 13);
    titleStartX = marginX + 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("The VeriClaim Engine - Audit Report", titleStartX, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(82, 82, 91);
  doc.text(
    "Academic & Regulatory Sustainability Audit · Woxsen University Research Initiative",
    titleStartX,
    18.5
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Report ${report.id} · ${new Date(report.analyzedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`,
    pageWidth - marginX,
    13,
    { align: "right" }
  );

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.35);
  doc.line(marginX, 24, pageWidth - marginX, 24);

  y = 30;

  // Company Identity Card + 10-Point Score Block
  doc.setDrawColor(212, 212, 216);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(marginX, y, contentWidth, 30, 1.5, 1.5, "FD");

  // Corporate Logo / Monogram Identifier
  const initials = getCompanyInitials(report.company);
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(marginX + 4, y + 5, 14, 14, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(initials, marginX + 11, y + 13.5, { align: "center" });

  // Company Name & Corporate Identifier
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.setTextColor(10, 10, 10);
  doc.text(report.company, marginX + 22, y + 10.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  const identifierText = report.corporateIdentifier
    ? `${report.corporateIdentifier}  ·  ${report.jurisdictionLabel}`
    : report.jurisdictionLabel;
  doc.text(identifierText, marginX + 22, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(39, 39, 42);
  doc.text(`Overall Assessment: ${report.overallVerdict}`, marginX + 22, y + 23.5);

  // Prominent 10-Point Evidence Strength Index Box on Right
  const scoreBoxW = 46;
  const scoreBoxX = pageWidth - marginX - scoreBoxW - 3;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(212, 212, 216);
  doc.roundedRect(scoreBoxX, y + 3.5, scoreBoxW, 23, 1.2, 1.2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(82, 82, 91);
  doc.text("EVIDENCE STRENGTH INDEX", scoreBoxX + scoreBoxW / 2, y + 8.5, {
    align: "center",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  if (report.evidenceStrengthIndex >= 7) {
    doc.setTextColor(21, 128, 61);
  } else if (report.evidenceStrengthIndex >= 4) {
    doc.setTextColor(180, 83, 9);
  } else {
    doc.setTextColor(185, 28, 28);
  }
  doc.text(
    `${report.evidenceStrengthIndex.toFixed(1)} / 10`,
    scoreBoxX + scoreBoxW / 2,
    y + 17.5,
    { align: "center" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(82, 82, 91);
  doc.text(translateStatusForPresentation(report.overallStatus), scoreBoxX + scoreBoxW / 2, y + 23.5, {
    align: "center",
  });

  y += 37;

  // Score Pillars Strip
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(63, 63, 70);
  doc.text(
    `Index Breakdown:  Claim Specificity ${report.scoreBreakdown.claimSpecificity.toFixed(
      1
    )}/2.5  |  Metric Proof ${report.scoreBreakdown.metricSubstantiation.toFixed(
      1
    )}/2.5  |  Regulatory Alignment ${report.scoreBreakdown.statutoryAlignment.toFixed(
      1
    )}/2.5  |  Public Record ${report.scoreBreakdown.watchdogStanding.toFixed(1)}/2.5`,
    marginX,
    y
  );
  y += 6;

  // Audited Claim Box
  writeWrappedText("Submitted Marketing Claim:", marginX, contentWidth, 4.5, 9, [82, 82, 91], "bold");
  writeWrappedText(`"${report.claim}"`, marginX, contentWidth, 4.6, 9.5, [15, 23, 42], "normal");
  y += 2;

  // ============================================================================
  // 2. PLAIN-LANGUAGE EXECUTIVE AUDIT SUMMARY
  // ============================================================================
  drawSectionHeading("1. Plain-Language Audit Summary (Academic & Presentation Overview)");
  writeWrappedText(report.executiveSummary, marginX, contentWidth, 4.8, 9.5);
  y += 1.5;
  writeWrappedText(
    `Evidence Distribution: ${report.evidenceCounts.Supporting} Supporting · ${
      report.evidenceCounts["Partially Verified"] ?? 0
    } Partially Verified · ${report.evidenceCounts.Contradictory} Contradictory · ${
      report.evidenceCounts.Missing
    } Missing · ${report.evidenceCounts.Inconclusive} Inconclusive.`,
    marginX,
    contentWidth,
    4.5,
    8.5,
    [82, 82, 91]
  );

  // ============================================================================
  // 3. CLAIM LANGUAGE VS. MEASURABLE PROOF
  // ============================================================================
  drawSectionHeading("2. Marketing Language, Semantic Intent & Measurable Proof");
  if (report.point1.semanticIntentSummary) {
    writeWrappedText(
      `Conceptual Intent: ${report.point1.semanticIntentSummary}`,
      marginX,
      contentWidth,
      4.6,
      9,
      [39, 39, 42]
    );
    y += 1;
  }

  const unbackedTerms = report.point1.categoryAMatches.filter(
    (m) => m.contextualBacking !== "Substantiated by Filing"
  );
  const backedTerms = report.point1.categoryAMatches.filter(
    (m) => m.contextualBacking === "Substantiated by Filing"
  );

  const formatTermLabel = (m: (typeof report.point1.categoryAMatches)[number]) =>
    m.matchType === "Semantic / Near-Meaning" && m.matchedPhrase
      ? `${m.term} (via "${m.matchedPhrase}")`
      : m.term;

  const plainPoint1 =
    unbackedTerms.length === 0 && backedTerms.length > 0
      ? `In plain terms, the ${backedTerms.length} sustainability phrase(s) detected (${backedTerms
          .map(formatTermLabel)
          .join(", ")}) are contextually supported by verified corporate disclosures and clean public compliance records.`
      : unbackedTerms.length > 0 && report.point1.categoryBMatches.length === 0 && backedTerms.length === 0
      ? `In plain terms, this claim relies on ${unbackedTerms.length} broad marketing phrase(s) (${unbackedTerms
          .map(formatTermLabel)
          .join(", ")}) without providing concrete numbers, scientific standards, or verified filing proof.`
      : report.point1.categoryAMatches.length === 0 && report.point1.categoryBMatches.length > 0
      ? `In plain terms, this claim avoids vague marketing buzzwords and supports its statement with ${report.point1.categoryBMatches.length} concrete, measurable fact(s) (${report.point1.categoryBMatches
          .map((m) => m.matchedText)
          .join(", ")}).`
      : `In plain terms, this claim contains ${backedTerms.length} filing-supported phrase(s), ${report.point1.categoryBMatches.length} measurable metric(s), and ${unbackedTerms.length} unbacked marketing term(s).`;

  writeWrappedText(plainPoint1, marginX, contentWidth, 4.8, 9.5);

  if (backedTerms.length > 0) {
    y += 1;
    writeWrappedText(
      `Contextually Substantiated by Verified Filings: ${backedTerms.map(formatTermLabel).join(", ")}`,
      marginX,
      contentWidth,
      4.5,
      8.8,
      [22, 101, 52]
    );
  }
  if (unbackedTerms.length > 0) {
    y += 1;
    writeWrappedText(
      `Unbacked Buzzwords / Red-Flag Terms: ${unbackedTerms.map(formatTermLabel).join(", ")}`,
      marginX,
      contentWidth,
      4.5,
      8.8,
      [153, 27, 27]
    );
  }
  if (report.point1.categoryBMatches.length > 0) {
    y += 1;
    writeWrappedText(
      `Verified Quantitative Metrics (Category B): ${report.point1.categoryBMatches
        .map((m) => `${m.label}: ${m.matchedText}`)
        .join("; ")}`,
      marginX,
      contentWidth,
      4.5,
      8.8,
      [22, 101, 52]
    );
  }

  // ============================================================================
  // 4. STATUTORY STANDARDS & OFFICIAL CORPORATE FILINGS (SEC / BRSR / CSRD)
  // ============================================================================
  drawSectionHeading("3. Official Corporate Filings & Regulatory Compliance");
  writeWrappedText(report.point2.summary, marginX, contentWidth, 4.7, 9.5);
  y += 1;

  for (const finding of report.point3.findings) {
    ensureSpace(18);
    writeWrappedText(
      `• ${finding.topic} [${translateStatusForPresentation(finding.status)}]`,
      marginX,
      contentWidth,
      4.6,
      9.2,
      [15, 23, 42],
      "bold"
    );
    writeWrappedText(finding.answer, marginX + 3, contentWidth - 3, 4.5, 8.8, [63, 63, 70]);
    for (const src of finding.sources) {
      writeClickableLink(`${src.title} (${src.url})`, src.url, marginX + 3, contentWidth - 3);
    }
    y += 1;
  }

  writeWrappedText(
    "Key Legal & Reporting Benchmarks Checked:",
    marginX,
    contentWidth,
    4.6,
    9,
    [15, 23, 42],
    "bold"
  );
  for (const check of report.point2.checks) {
    ensureSpace(12);
    writeWrappedText(
      `• ${check.title} (${check.code}) — ${translateStatusForPresentation(check.status)}: ${check.finding}`,
      marginX + 2,
      contentWidth - 2,
      4.4,
      8.6,
      [63, 63, 70]
    );
  }

  // ============================================================================
  // 5. PUBLIC WATCHDOGS, NEWS & LITIGATION RECORDS
  // ============================================================================
  drawSectionHeading("4. Public Watchdogs, News & Litigation Records");
  writeWrappedText(report.point4.newsVerificationSummary, marginX, contentWidth, 4.7, 9.2);
  y += 1.5;

  if (report.point4.records.length > 0) {
    for (const rec of report.point4.records) {
      ensureSpace(20);
      writeWrappedText(
        `• ${rec.title} (${rec.source}, ${rec.date}) — ${translateStatusForPresentation(rec.evidenceTag)}`,
        marginX,
        contentWidth,
        4.6,
        9.1,
        [15, 23, 42],
        "bold"
      );
      if (rec.summary) {
        writeWrappedText(rec.summary, marginX + 3, contentWidth - 3, 4.4, 8.6, [63, 63, 70]);
      }
      if (rec.url) {
        writeClickableLink(rec.url, rec.url, marginX + 3, contentWidth - 3);
      }
      y += 1;
    }
  } else {
    writeWrappedText(
      "No adverse lawsuits, regulatory fines, or public news disputes were surfaced for this entity in the queried archives.",
      marginX,
      contentWidth,
      4.5,
      8.8,
      [82, 82, 91]
    );
  }

  // ============================================================================
  // 6. EDUCATIONAL DISCLAIMER & PAGE NUMBERS
  // ============================================================================
  ensureSpace(16);
  y += 4;
  doc.setDrawColor(229, 229, 229);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;
  writeWrappedText(
    "Educational Decision-Support Disclaimer: Prepared by The VeriClaim Engine (Woxsen University Undergraduate Research Team: Varad, Yatharth Singh, Nidhish, and Ayush Kumar). This report synthesizes public regulatory records and news archives for academic and analytical reference and does not constitute formal legal advice.",
    marginX,
    contentWidth,
    4.0,
    7.8,
    [113, 113, 122]
  );

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `The VeriClaim Engine · Report ${report.id} · Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const safeCompany = report.company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "entity";
  doc.save(`VeriClaim-Audit-${safeCompany}-${report.id}.pdf`);
}
