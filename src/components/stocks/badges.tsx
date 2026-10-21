import type { ReactNode } from "react";
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

/* ── Board row signal chip ─────────────────────────────────────────────── */

/** The signal fields a board row badge reads — structurally any board row. */
export interface BoardRowSignal {
  price: number;
  wk52High: number | null;
  wk52Low: number | null;
  rsi: number | null;
  aboveSma50: boolean | null;
  /** Latest volume ÷ 20-day average. Null without history (EOD listings). */
  relVolume: number | null;
  /** 24h news volume ÷ 30-day daily median, when surging (≥3×, ≥3 articles). */
  newsSurge: number | null;
  /** Set when the day's move has reached the exchange's daily price band. */
  limitHit: "up" | "down" | null;
  /** Liquidity tier within the board (value-traded quartiles). */
  liquidity: "liquid" | "active" | "thin";
  /** ≥5% move on a thin counter with no news surge behind it. */
  speculation: boolean;
}

function SignalChip({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "ml-2 inline-block rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * One badge slot per board row (Robinhood watchlist-density pattern).
 * Priority: limit hit > speculation > 52-week events > news surge >
 * unusual volume > RSI > 50-day trend. EOD-only listings carry no
 * history, so they get no badge. Surge and volume are attention, never
 * direction — and both are gated off thin counters, where a ratio is
 * arithmetic noise rather than a signal.
 */
export function BoardRowBadge({ row }: { row: BoardRowSignal }) {
  const {
    price,
    wk52High,
    wk52Low,
    rsi,
    aboveSma50,
    relVolume,
    newsSurge,
    limitHit,
    liquidity,
    speculation,
  } = row;

  // A limit hit is the day's defining fact — it outranks every other badge.
  if (limitHit) {
    return <LimitChip hit={limitHit} className="ml-2" />;
  }

  // Speculation signature next: a big move with nothing underneath it.
  if (speculation) {
    return (
      <SignalChip
        title="Big move on thin trading with no matching news — classic speculation signature"
        className="bg-warning/20 text-warning"
      >
        Spec?
      </SignalChip>
    );
  }

  if (wk52High != null && wk52Low != null && wk52High > 0) {
    let label: string | null = null;
    let cls = "";
    let short = "";
    if (price >= wk52High) {
      label = "New 52wk high";
      short = "52WK HI";
      cls = "bg-success/15 text-success";
    } else if (price <= wk52Low) {
      label = "New 52wk low";
      short = "52WK LO";
      cls = "bg-destructive/15 text-destructive";
    } else if (price >= wk52High * 0.97) {
      label = "Near 52wk high";
      short = "≈HI";
      cls = "bg-success/10 text-success/80";
    } else if (price <= wk52Low * 1.03) {
      label = "Near 52wk low";
      short = "≈LO";
      cls = "bg-destructive/10 text-destructive/80";
    }
    if (label) {
      return (
        <SignalChip title={label} className={cls}>
          {short}
        </SignalChip>
      );
    }
  }

  // News surge is attention without a direction — sky, never green/red.
  if (newsSurge != null && liquidity !== "thin") {
    return (
      <SignalChip
        title={`News volume ${newsSurge.toFixed(1)}× the 30-day daily pace`}
        className="bg-sky-500/15 text-sky-400"
      >
        News {newsSurge.toFixed(1)}×
      </SignalChip>
    );
  }

  // Volume is attention, not direction — amber, never green/red.
  if (relVolume != null && relVolume >= 2 && liquidity !== "thin") {
    return (
      <SignalChip
        title={`Volume ${relVolume.toFixed(1)}× the 20-day average`}
        className="bg-primary/15 text-primary"
      >
        Vol {relVolume.toFixed(1)}×
      </SignalChip>
    );
  }

  if (rsi != null) {
    if (rsi >= 70) {
      return (
        <SignalChip
          title={`RSI ${rsi.toFixed(0)} — overbought`}
          className="bg-destructive/15 text-destructive"
        >
          RSI hot
        </SignalChip>
      );
    }
    if (rsi <= 30) {
      return (
        <SignalChip
          title={`RSI ${rsi.toFixed(0)} — oversold`}
          className="bg-success/15 text-success"
        >
          RSI cold
        </SignalChip>
      );
    }
  }

  if (aboveSma50 != null) {
    return (
      <SignalChip
        title={aboveSma50 ? "Above 50-day average" : "Below 50-day average"}
        className={
          aboveSma50 ? "bg-success/10 text-success/80" : "bg-destructive/10 text-destructive/80"
        }
      >
        {aboveSma50 ? "▲50d" : "▼50d"}
      </SignalChip>
    );
  }

  return null;
}
