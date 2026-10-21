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

/**
 * Per-headline sentiment dot — the single copy (absorbed from the stock
 * page, the news wire and the country broadcast). Green ≥ 0.2, red ≤ −0.2,
 * grey in between, hollow when unscored. Semantic tokens only.
 */
export function SentimentDot({
  score,
  className,
}: {
  score: number | null;
  className?: string;
}) {
  const cls =
    score == null
      ? "border-muted-foreground/50 bg-transparent"
      : score >= 0.2
        ? "border-success bg-success"
        : score <= -0.2
          ? "border-destructive bg-destructive"
          : "border-muted-foreground/50 bg-muted-foreground/40";
  return (
    <span
      title={
        score == null
          ? "Not scored yet"
          : `Sentiment ${score >= 0 ? "+" : ""}${score.toFixed(2)}`
      }
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full border", cls, className)}
      aria-hidden
    />
  );
}
