import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { CATEGORY_A_BUZZWORDS, PDF_RED_FLAGS, type BuzzwordSector } from "../data/lexicon.ts";
import type { BuzzwordEntry } from "../types/audit.ts";

interface BuzzwordLibraryProps {
  matchedTerms?: string[];
  matchedEntries?: BuzzwordEntry[];
}

const SECTORS: ("All" | BuzzwordSector)[] = [
  "All",
  'A. General "green" language',
  "B. Climate and carbon",
  "C. Materials, packaging, ingredients",
  "D. Corporate, ESG, and purpose claims",
  "E. Energy, fuel, transport",
  "F. Food, agriculture, water, land",
  "G. Fashion, textiles, beauty, luxury",
  'H. Construction, industry, self-made "certifications"',
  "I. Finance, technology, travel, hospitality",
  "J. Household goods, labels, imagery, slogans",
];

function getSectorShortLabel(sector: "All" | BuzzwordSector): string {
  if (sector === "All") return "All Sectors";
  return sector;
}

export function BuzzwordLibrary({
  matchedTerms = [],
  matchedEntries = [],
}: BuzzwordLibraryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState<"All" | BuzzwordSector>("All");

  const matchedEntryMap = useMemo(() => {
    const map = new Map<string, BuzzwordEntry>();
    for (const entry of matchedEntries) {
      map.set(entry.term.toLowerCase(), entry);
    }
    for (const term of matchedTerms) {
      const key = term.toLowerCase();
      if (!map.has(key)) {
        const found = CATEGORY_A_BUZZWORDS.find((b) => b.term.toLowerCase() === key);
        if (found) map.set(key, found);
      }
    }
    return map;
  }, [matchedEntries, matchedTerms]);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = { All: CATEGORY_A_BUZZWORDS.length };
    for (const item of CATEGORY_A_BUZZWORDS) {
      counts[item.sector] = (counts[item.sector] ?? 0) + 1;
    }
    return counts;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORY_A_BUZZWORDS.filter((item) => {
      const matchesSector = selectedSector === "All" || item.sector === selectedSector;
      const matchesQuery =
        !q ||
        item.term.toLowerCase().includes(q) ||
        item.regulatoryRisk.toLowerCase().includes(q) ||
        item.sector.toLowerCase().includes(q) ||
        item.subcategory.toLowerCase().includes(q);
      return matchesSector && matchesQuery;
    });
  }, [query, selectedSector]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim() && !isOpen) {
      setIsOpen(true);
    }
  };

  const handleSectorClick = (sector: "All" | BuzzwordSector) => {
    setSelectedSector(sector);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const hasActiveFilter = query.trim().length > 0 || selectedSector !== "All";

  return (
    <section
      id="buzzword-lexicon"
      className="border border-neutral-200 dark:border-neutral-800 rounded-md"
    >
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
              <span>Category A Reference Library</span>
              <span aria-hidden="true">·</span>
              <span>{CATEGORY_A_BUZZWORDS.length} Global Terms (Sectors A–J)</span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
              Vague Words &amp; Unregulated Greenwashing Buzzwords
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-3xl">
              Searchable and collapsible lexicon of {CATEGORY_A_BUZZWORDS.length} greenwashing terms across 10 sectors, evaluated contextually alongside near-same-meaning wording against corporate filings and SEBI/CCPA/ASCI, EU Green Claims Directive, and FTC Green Guides.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-900 dark:text-neutral-100 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{isOpen ? "Collapse Lexicon" : "Expand Full Lexicon"}</span>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Always-accessible search bar and sector filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="relative w-full md:max-w-sm">
            <Search
              className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={`Search ${CATEGORY_A_BUZZWORDS.length} buzzwords, sectors, or risks...`}
              aria-label="Search Category A buzzwords"
              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-950 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-950 dark:focus:ring-neutral-200"
            />
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedSector("All");
                }}
                className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-100 cursor-pointer whitespace-nowrap shrink-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear filter</span>
              </button>
            )}
            <div className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
              {filtered.length} of {CATEGORY_A_BUZZWORDS.length} terms
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {SECTORS.map((sector) => (
            <button
              key={sector}
              type="button"
              onClick={() => handleSectorClick(sector)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSector === sector
                  ? "bg-neutral-950 text-white border-neutral-950 dark:bg-neutral-100 dark:text-neutral-950 dark:border-neutral-100"
                  : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-950 dark:text-neutral-300 dark:border-neutral-800 dark:hover:bg-neutral-900"
              }`}
            >
              {getSectorShortLabel(sector)} ({sectorCounts[sector] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3.5 bg-neutral-50 dark:bg-neutral-900/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Contextual Red Flags That Make Sustainability Terms Riskier</span>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
              {PDF_RED_FLAGS.map((flag) => (
                <li key={flag} className="leading-relaxed">
                  · {flag}
                </li>
              ))}
            </ul>
          </div>

          {filtered.length > 0 ? (
            <div className="max-h-[440px] overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
                  <tr>
                    <th className="py-2 px-3 font-medium w-12 font-mono">#</th>
                    <th className="py-2 px-3 font-medium">Category A Term</th>
                    <th className="py-2 px-3 font-medium">PDF Sector</th>
                    <th className="py-2 px-3 font-medium">Regulatory Scrutiny Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filtered.map((entry, idx) => {
                    const matched = matchedEntryMap.get(entry.term.toLowerCase());
                    const isSubstantiated = matched?.contextualBacking === "Substantiated by Filing";
                    return (
                      <tr
                        key={`${entry.id ?? idx}-${entry.term}`}
                        className={
                          matched
                            ? isSubstantiated
                              ? "bg-emerald-50/60 dark:bg-emerald-950/25"
                              : "bg-red-50/70 dark:bg-red-950/30"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                        }
                      >
                        <td className="py-2 px-3 font-mono tabular-nums text-neutral-400">
                          {entry.id ?? idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-medium text-neutral-950 dark:text-neutral-100 whitespace-nowrap">
                          {entry.term}
                          {matched && (
                            <span
                              className={`ml-2 text-[11px] font-sans ${
                                isSubstantiated
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-red-700 dark:text-red-400"
                              }`}
                            >
                              (
                              {matched.matchType === "Semantic / Near-Meaning"
                                ? `Semantic via "${matched.matchedPhrase}"`
                                : "Detected"}
                              )
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                          {entry.sector}
                        </td>
                        <td className="py-2 px-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">
                          {entry.regulatoryRisk}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
              No Category A terms match "{query}".
            </div>
          )}
        </div>
      )}
    </section>
  );
}
