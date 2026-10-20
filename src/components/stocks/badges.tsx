import { classifyHeadline, HEADLINE_EVENT_LABELS, type HeadlineEvent } from "@/lib/news/events";
import { cn } from "@/lib/utils";

/**
 * Shared signal chips. One visual language everywhere a board row or a
 * headline appears: mono, 9px, uppercase, tinted by meaning — direction
 * is green/red, attention is amber/sky, warnings are red.
 */

const EVENT_CLASSES: Record<HeadlineEvent, string> = {
  "profit-warning": "bg-red-500/15 text-red-500",
  management: "bg-violet-500/15 text-violet-400",
  enforcement: "bg-orange-500/15 text-orange-400",
  dividend: "bg-success/15 text-success",
  results: "bg-primary/15 text-primary",
  "corporate-action": "bg-sky-500/15 text-sky-400",
  contract: "bg-teal-500/15 text-teal-400",
  policy: "bg-slate-400/15 text-slate-300",
};

/** Event chip for a headline (Results / Dividend / Profit warning…). Null when general news. */
export function EventBadge({ title, className }: { title: string; className?: string }) {
  const event = classifyHeadline(title);
  if (!event) return null;
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]",
        EVENT_CLASSES[event],
        className,
      )}
    >
      {HEADLINE_EVENT_LABELS[event]}
    </span>
  );
}

/** Limit-hit chip for a board row at its exchange's daily price band. */
export function LimitChip({ hit, className }: { hit: "up" | "down"; className?: string }) {
  return (
    <span
      title={hit === "up" ? "At the daily limit up" : "At the daily limit down"}
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]",
        hit === "up" ? "bg-success/15 text-success" : "bg-red-500/15 text-red-500",
        className,
      )}
    >
      Limit {hit === "up" ? "↑" : "↓"}
    </span>
  );
}
