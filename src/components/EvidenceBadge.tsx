import { AlertCircle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { EvidenceCategory } from "../types/audit.ts";

interface EvidenceBadgeProps {
  category: EvidenceCategory;
  count?: number;
}

const STYLES: Record<
  EvidenceCategory,
  {
    wrapper: string;
    Icon: typeof CheckCircle2;
  }
> = {
  Supporting: {
    wrapper:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  "Partially Verified": {
    wrapper:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
    Icon: CheckCircle2,
  },
  Contradictory: {
    wrapper:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300",
    Icon: XCircle,
  },
  Missing: {
    wrapper:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    Icon: AlertCircle,
  },
  Inconclusive: {
    wrapper:
      "border-neutral-300 bg-neutral-100 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    Icon: HelpCircle,
  },
};

export function EvidenceBadge({ category, count }: EvidenceBadgeProps) {
  const { wrapper, Icon } = STYLES[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${wrapper}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{category}</span>
      {typeof count === "number" && (
        <span className="font-mono tabular-nums opacity-80">({count})</span>
      )}
    </span>
  );
}
