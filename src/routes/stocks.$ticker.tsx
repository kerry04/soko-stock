import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Star } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SkeletonBlock, SkeletonRows, StateBlock } from "@/components/common/states";
import { TradeTicket } from "@/components/paper/TradeTicket";
import { EventBadge, LimitChip, SentimentDot, NewsSurgeChip } from "@/components/stocks/badges";
import { ChangeCell } from "@/components/stocks/change";
import { fmtPrice as fmt, timeAgo } from "@/lib/stocks/format";
import {
  classifyHeadline,
  HEADLINE_EVENT_LABELS,
  type HeadlineEvent,
} from "@/lib/news/events";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { estimateRealCost, LEVY_SPLIT } from "@/lib/stocks/real-cost";
import { Input } from "@/components/ui/input";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stocks/$ticker")({
  head: ({ params }) => ({
    meta: [{ title: `${params.ticker} — Soko Stock` }],
  }),
  component: StockDetail,
});

interface Bar {
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

interface QuoteExtras {
  sector: string | null;
  ytdPercent: number | null;
  volume: number | null;
  value: number | null;
  updated: string | null;
}

interface Technicals {
  rsi: number;
  rsiState: "Overbought" | "Oversold" | "Neutral";
  sma50: number;
  sma200: number;
  aboveSma50: boolean;
  aboveSma200: boolean;
  goldenCross: boolean;
  macdBullish: boolean;
  votes: { rsi: number; macd: number; vs50: number; vs200: number; cross: number };
  composite: number;
  label: "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";
  barsUsed: number;
  /** Latest volume ÷ 20-day average. Null without history. */
  relVolume: number | null;
}

interface QuoteResponse {
  ok: boolean;
  ticker: string;
  name: string;
  exchange: string;
  currencySymbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  /** Board-relative context: liquidity tier, speculation signature, limit hit. */
  board?: {
    liquidity: "liquid" | "active" | "thin";
    speculation: boolean;
    limitHit: "up" | "down" | null;
  } | null;
  asOf: string;
  timeNote: string;
  bars: Bar[];
  extras?: QuoteExtras;
  technicals?: Technicals | null;
}

interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment_score: number | null;
}

interface NewsSignal {
  ticker: string;
  keywords: string[];
  count24h: number;
  medianDaily: number;
  surgeRatio: number | null;
  surging: boolean;
  sentiment7d: {
    pos: number;
    neg: number;
    neu: number;
    unknown: number;
    tilt: "positive" | "negative" | "mixed" | null;
  };
  articles: NewsArticle[];
  latestAt: string | null;
}

const RANGES = [
  { id: "1mo", label: "1M" },
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
] as const;

/**
 * Folio section header — the stock page's section dialect: an amber
 * point, a mono slug, and a hairline rule. Sections are separated by
 * this, not by card slabs.
 */
function FolioHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-between gap-3 border-b border-border pb-2",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 shrink-0 bg-primary" aria-hidden />
        {title}
      </p>
      {right}
    </div>
  );
}

/**
 * 52-week range bar (TradingView pattern): current price positioned
 * between the verified 52-week low and high. Rendered only from real
 * 1y history — never for EOD-only listings.
 */
function Wk52Bar({
  bars,
  price,
  sym,
}: {
  bars: Bar[];
  price: number;
  sym: string;
}) {
  const stats = useMemo(() => {
    const highs = bars.map((b) => b.h ?? b.c).filter((v): v is number => v != null);
    const lows = bars.map((b) => b.l ?? b.c).filter((v): v is number => v != null);
    if (highs.length < 50 || lows.length < 50) return null;
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    if (!(high > low)) return null;
    return { high, low };
  }, [bars]);

  if (!stats) return null;
  const { high, low } = stats;
  const pos = Math.min(1, Math.max(0, (price - low) / (high - low)));
  const belowHigh = ((high - price) / high) * 100;
  const nearHigh = price >= high * 0.97;
  const nearLow = price <= low * 1.03;

  return (
    <Panel variant="stat" padding="sm">
      <div className="flex items-center justify-between">
        <PanelTitle>52-week range</PanelTitle>
        <p
          className={cn(
            "num font-mono text-[11px] font-semibold",
            nearHigh
              ? "text-success"
              : nearLow
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {nearHigh
            ? "At 52wk high"
            : nearLow
              ? "At 52wk low"
              : `${belowHigh.toFixed(1)}% below high`}
        </p>
      </div>
      <div
        className="relative mt-3 h-1.5 rounded-full bg-muted"
        role="img"
        aria-label={`Price ${fmt(price, sym)} between 52-week low ${fmt(low, sym)} and high ${fmt(high, sym)}`}
      >
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${(pos * 100).toFixed(1)}%` }}
        />
      </div>
      <div className="num mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>
          <span className="text-destructive/90">Low</span> {fmt(low, sym)}
        </span>
        <span>
          <span className="text-success/90">High</span> {fmt(high, sym)}
        </span>
      </div>
    </Panel>
  );
}

const GAUGE_SEGS = [
  { label: "Strong Sell", className: "stroke-destructive" },
  { label: "Sell", className: "stroke-warning" },
  { label: "Neutral", className: "stroke-muted-foreground" },
  { label: "Buy", className: "stroke-success/60" },
  { label: "Strong Buy", className: "stroke-success" },
] as const;

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy - r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy - r * Math.sin(rad(a1));
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/**
 * Technical signals panel (TradingView pattern): composite gauge from five
 * real votes — RSI(14), MACD, price vs 50D/200D, 50D vs 200D — plus the
 * breakdown. Delayed daily data only; labeled as pattern, not advice.
 */
function SignalsCard({ t, sym }: { t: Technicals; sym: string }) {
  const cx = 110;
  const cy = 104;
  const r = 84;
  const needleDeg = 180 - ((t.composite + 1) / 2) * 180;
  const nx = cx + 62 * Math.cos((needleDeg * Math.PI) / 180);
  const ny = cy - 62 * Math.sin((needleDeg * Math.PI) / 180);

  const pill = (vote: number): [string, string] =>
    vote > 0
      ? ["Buy", "bg-success/15 text-success"]
      : vote < 0
        ? ["Sell", "bg-destructive/15 text-destructive"]
        : ["Neutral", "bg-muted text-muted-foreground"];

  const rows: [string, string, [string, string]][] = [
    [`Momentum (RSI)`, t.rsi.toFixed(1), pill(t.votes.rsi)],
    ["Trend (MACD)", t.macdBullish ? "Bullish" : "Bearish", pill(t.votes.macd)],
    [`Price vs 50-day ${fmt(t.sma50, sym)}`, t.aboveSma50 ? "Above" : "Below", pill(t.votes.vs50)],
    [`Price vs 200-day ${fmt(t.sma200, sym)}`, t.aboveSma200 ? "Above" : "Below", pill(t.votes.vs200)],
    [
      "50-day vs 200-day average",
      t.goldenCross ? "Golden cross — 50-day above 200-day" : "Death cross — 50-day below 200-day",
      pill(t.votes.cross),
    ],
    [
      "Volume vs 20-day avg",
      t.relVolume != null ? `${t.relVolume.toFixed(1)}×` : "—",
      t.relVolume != null && t.relVolume >= 2
        ? ["Unusual", "bg-primary/15 text-primary"]
        : ["Normal", "bg-muted text-muted-foreground"],
    ],
  ];

  return (
    <Panel padding="md" aria-label="Technical signals">
      <PanelHeader>
        <PanelTitle>Technical signals</PanelTitle>
        <p className="font-mono text-[10px] text-muted-foreground">from {t.barsUsed} days of prices</p>
      </PanelHeader>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Five simple checks on this stock&apos;s recent prices: is it trending up or
        down, and has it moved unusually far, unusually fast? Each check votes Buy,
        Sell or Neutral. It is a summary of patterns in past prices — not advice,
        and not a prediction.
      </p>

      <div className="mt-1 flex flex-col items-center sm:flex-row sm:gap-6">
        <div className="w-full max-w-[240px]">
          <svg viewBox="0 0 220 118" className="w-full" role="img" aria-label={`Technical rating: ${t.label}`}>
            {GAUGE_SEGS.map((s, i) => (
              <path
                key={s.label}
                d={arcPath(cx, cy, r, 180 - i * 36, 180 - (i + 1) * 36)}
                fill="none"
                className={s.className}
                strokeWidth="11"
                strokeLinecap="butt"
                opacity={t.label === s.label ? 1 : 0.28}
              />
            ))}
            <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-foreground" />
            <circle cx={cx} cy={cy} r="5" className="fill-foreground" />
          </svg>
          <p
            className={cn(
              "num -mt-1 text-center font-mono text-sm font-bold",
              t.composite >= 0.2
                ? "text-success"
                : t.composite <= -0.2
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {t.label}
          </p>
        </div>

        <ul className="mt-3 w-full flex-1 space-y-1.5 sm:mt-0">
          {rows.map(([name, value, [pv, pc]]) => (
            <li key={name} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {name}{" "}
                <span className="num font-mono text-[12px] font-semibold text-foreground">
                  {value}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]",
                  pc,
                )}
              >
                {pv}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        RSI is a momentum score from 0 to 100. Above 70 means the price has risen
        fast and far (&lsquo;overbought&rsquo;); under 30, fallen fast and far
        (&lsquo;oversold&rsquo;).
      </p>
      <p className="mt-2 border-t border-border/50 pt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Worked out from daily prices, about 15 minutes behind the market. Patterns
        in past prices do not predict future prices.
      </p>
    </Panel>
  );
}

/** Headline sentiment, news surge, and 7-day coverage lean for one stock. */
function SignalWire({
  signal,
  updatedAt,
  name,
}: {
  signal: NewsSignal | null;
  updatedAt: number | null;
  name: string;
}) {
  const s = signal?.sentiment7d;
  const tiltLabel =
    s?.tilt === "positive"
      ? "mostly positive"
      : s?.tilt === "negative"
        ? "mostly negative"
        : s?.tilt === "mixed"
          ? "mixed"
          : null;
  return (
    <section aria-label="Related news signals">
      <FolioHeader
        title="News about this company"
        right={
          signal?.surging && signal.surgeRatio != null ? (
            <NewsSurgeChip
              ratio={signal.surgeRatio}
              title={`${signal.count24h} stories in 24h vs a usual ${signal.medianDaily} stories a day`}
            />
          ) : undefined
        }
      />
      <p className="text-sm text-muted-foreground">
        Recent headlines that mention {name}.
        {updatedAt != null && (
          <span className="font-mono text-[11px]">
            {" "}
            · updated {timeAgo(new Date(updatedAt).toISOString())}
          </span>
        )}
      </p>

      {tiltLabel && s && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Last 7 days:{" "}
          <span
            className={cn(
              s.tilt === "positive" && "text-success",
              s.tilt === "negative" && "text-destructive",
            )}
          >
            {tiltLabel} coverage
          </span>{" "}
          · {s.pos} positive · {s.neg} negative · {s.neu} neutral
        </p>
      )}

      {!signal || signal.articles.length === 0 ? (
        <StateBlock
          tone="empty"
          className="mt-3"
          title="No linked headlines in the last 7 days"
          action={
            <Link to="/map" className="text-sm text-success hover:underline">
              Check the signal map for the wider picture
            </Link>
          }
        />
      ) : (
        <ul className="mt-3 border-t border-border/60">
          {signal.articles.slice(0, 8).map((n) => (
            <li key={n.id} className="flex gap-2.5 border-b border-border/50 py-2.5">
              <SentimentDot score={n.sentiment_score} className="mt-1.5" />
              <div className="min-w-0">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm leading-snug hover:underline"
                >
                  {n.title}
                  <ExternalLink
                    className="ml-1 inline h-3 w-3 text-muted-foreground"
                    aria-hidden
                  />
                </a>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span>
                    {n.source} · {timeAgo(n.published_at)}
                  </span>
                  <EventBadge title={n.title} className="normal-case tracking-[0.1em]" />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Dots show per-article sentiment where scored. &lsquo;Surge&rsquo; means the
        last 24 hours had far more stories than this stock&apos;s usual daily count
        over the past 30 days.
      </p>
    </section>
  );
}

/** A classified headline pinned to the chart timeline. */
export interface ChartEvent {
  t: number;
  event: HeadlineEvent;
}

const DAY_MS = 86_400_000;

function PriceChart({
  bars,
  sym,
  events,
}: {
  bars: Bar[];
  sym: string;
  events: ChartEvent[];
}) {
  const pts = useMemo(() => bars.filter((b) => b.c != null) as (Bar & { c: number })[], [bars]);
  if (pts.length < 2) {
    return (
      <StateBlock
        tone="empty"
        className="border-none py-10"
        title="Not enough history yet"
      />
    );
  }

  // Plot geometry: left gutter carries price labels, right gutter the
  // last-value tag, bottom strip the time axis.
  const W = 720;
  const H = 248;
  const padL = 64;
  const padR = 62;
  const padT = 12;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const min = Math.min(...pts.map((p) => p.c));
  const max = Math.max(...pts.map((p) => p.c));
  const span = Math.max(0.0001, max - min);
  const x = (i: number) => padL + (i / (pts.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / span) * plotH;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${padT + plotH} L${x(0).toFixed(1)},${padT + plotH} Z`;

  const gridFracs = [0, 1 / 3, 2 / 3, 1];
  const dateFmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const timeIdx = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];

  const last = pts[pts.length - 1];
  const lastLabel = fmt(last.c, sym);
  const tagW = Math.ceil(lastLabel.length * 5.9) + 12;
  const tagX = W - tagW;
  const tagY = Math.min(padT + plotH - 18, Math.max(padT, y(last.c) - 9));

  // Event markers: snap each classified headline to its nearest trading
  // day and keep it only when that day is within four calendar days —
  // a marker is a date claim, so an out-of-span headline gets none.
  const stackAt = new Map<number, number>();
  const markers: { i: number; event: HeadlineEvent; stack: number }[] = [];
  for (const ev of events) {
    let best = -1;
    let bestDiff = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.t - ev.t);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    });
    if (best < 0 || bestDiff > 4 * DAY_MS) continue;
    const stack = stackAt.get(best) ?? 0;
    stackAt.set(best, stack + 1);
    markers.push({ i: best, event: ev.event, stack });
  }
  const legend: { event: HeadlineEvent; count: number }[] = [];
  for (const m of markers) {
    const row = legend.find((l) => l.event === m.event);
    if (row) row.count += 1;
    else legend.push({ event: m.event, count: 1 });
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full"
        role="img"
        aria-label={`Price history chart${markers.length ? ` with ${markers.length} news event markers` : ""}`}
      >
        <defs>
          <linearGradient id="sg-price" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--primary)" }} stopOpacity="0.22" />
            <stop offset="100%" style={{ stopColor: "var(--primary)" }} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + price axis */}
        {gridFracs.map((f) => {
          const v = min + span * f;
          const gy = y(v);
          return (
            <g key={f}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={gy}
                y2={gy}
                className="stroke-border"
                strokeWidth="1"
                opacity="0.55"
              />
              <text
                x={padL - 6}
                y={gy + 3}
                textAnchor="end"
                fontSize="9.5"
                className="fill-muted-foreground font-mono"
              >
                {fmt(v, sym)}
              </text>
            </g>
          );
        })}

        {/* Time axis */}
        {timeIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 5}
            textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}
            fontSize="9.5"
            className="fill-muted-foreground font-mono"
          >
            {dateFmt(new Date(pts[i].t))}
          </text>
        ))}

        <path d={area} fill="url(#sg-price)" />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Event markers — amber ticks on the timeline */}
        {markers.map((m, k) => {
          const mx = x(m.i);
          const dy = padT + 4 + m.stack * 10;
          return (
            <g key={k}>
              <line
                x1={mx}
                x2={mx}
                y1={padT}
                y2={padT + 7}
                className="stroke-primary"
                strokeWidth="1.5"
              />
              <path
                d={`M${mx},${dy} l4,5 l-4,5 l-4,-5 Z`}
                className="fill-primary"
              >
                <title>{HEADLINE_EVENT_LABELS[m.event]}</title>
              </path>
            </g>
          );
        })}

        {/* Last point + value tag */}
        <line
          x1={x(pts.length - 1)}
          x2={tagX}
          y1={y(last.c)}
          y2={y(last.c)}
          className="stroke-primary"
          strokeWidth="1"
          opacity="0.6"
        />
        <circle cx={x(pts.length - 1)} cy={y(last.c)} r="3.5" className="fill-primary" />
        <rect x={tagX} y={tagY} width={tagW} height="18" rx="2" className="fill-primary" />
        <text
          x={tagX + tagW / 2}
          y={tagY + 12.5}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="700"
          className="fill-primary-foreground font-mono"
        >
          {lastLabel}
        </text>
      </svg>

      {legend.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            On the timeline
          </span>
          {legend.map((l) => (
            <span
              key={l.event}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
            >
              <span className="inline-block h-2 w-2 rotate-45 bg-primary" aria-hidden />
              {HEADLINE_EVENT_LABELS[l.event]}
              {l.count > 1 ? ` ×${l.count}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "What it costs for real" — the NSE fee stack on a typed amount, for the
 * rail of an NSE stock page. Levies are fixed (0.34%); brokerage is shown
 * as the typical 1.5%–2.1% range, so the total is a range too. Estimates
 * from the fee table in lib/stocks/real-cost — not a quote from a broker.
 */
function RealCostPanel() {
  const [raw, setRaw] = useState("10000");
  const amount = Number(raw.replace(/[^0-9.]/g, ""));
  const cost = estimateRealCost(Number.isFinite(amount) ? amount : 0);
  const ksh = (v: number) => `KSh ${Math.round(v).toLocaleString("en-ZA")}`;
  const split = LEVY_SPLIT.map(
    (s) => `${s.label.replace(/ levy$/, "")} ${s.pct.toFixed(2)}%`,
  ).join(" · ");

  return (
    <Panel variant="plain" padding="md" className="mt-3">
      <PanelHeader>
        <PanelTitle>What it costs for real</PanelTitle>
      </PanelHeader>
      <label
        htmlFor="real-cost-amount"
        className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
      >
        Amount (KSh)
      </label>
      <Input
        id="real-cost-amount"
        inputMode="numeric"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="num mt-1.5 font-mono"
        aria-describedby="real-cost-note"
      />
      <p className="num mt-3 font-mono text-base font-semibold">
        Fees: {ksh(cost.totalLow)} – {ksh(cost.totalHigh)}
      </p>
      <dl className="num mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
        <div className="flex items-baseline justify-between gap-2">
          <dt>Market levies · 0.34%</dt>
          <dd className="text-foreground">{ksh(cost.levies)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt>Brokerage · 1.5%–2.1%</dt>
          <dd className="text-foreground">
            {ksh(cost.brokerageLow)} – {ksh(cost.brokerageHigh)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt>Stamp duty</dt>
          <dd className="text-foreground">{ksh(cost.stampDuty)}</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Levies: {split}. Stamp duty is KSh 2 per KSh 10,000 traded.
      </p>
      <p id="real-cost-note" className="mt-2 text-[13px] leading-relaxed">
        Small amounts pay a bigger share in fees, because stamp duty is a flat
        charge on every trade. Selling charges the same fees again.
      </p>
      <Link
        to="/brokers"
        className="mt-3 inline-block font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
      >
        Open a real account →
      </Link>
    </Panel>
  );
}

function StockDetail() {
  const { ticker } = Route.useParams();
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1y");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [news, setNews] = useState<NewsSignal | null>(null);
  const [newsAt, setNewsAt] = useState<number | null>(null);
  const { ids: watched, toggle } = useWatchlist();

  const exchange = Object.values(EXCHANGE_BY_ID).find(
    (e) => e.tickers.includes(ticker) || ticker.endsWith(`.${e.id}`),
  );
  const hasHistory = (quote?.bars.length ?? 0) > 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/stocks/quote?ticker=${encodeURIComponent(ticker)}&range=${range}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => {
        if (!cancelled) {
          setQuote(j as QuoteResponse);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, range]);

  // Linked news via the news-signals API: distinctive-phrase matching
  // server-side (no more bare "standard" / "price" pollution), with surge
  // detection and sentiment. Refreshes every 5 minutes while open.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(
          `/api/stocks/news-signals?tickers=${encodeURIComponent(ticker)}`,
        );
        if (!r.ok) return;
        const j = await r.json();
        const sig = (j.signals ?? [])[0] as NewsSignal | undefined;
        if (!cancelled && sig) {
          setNews(sig);
          setNewsAt(Date.now());
        }
      } catch {
        /* news is enrichment — never break the page */
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticker]);

  const stats = useMemo(() => {
    if (!quote) return null;
    const valid = quote.bars.filter((b) => b.c != null);
    const closes = valid.map((b) => b.c as number);
    const highs = valid.map((b) => b.h ?? b.c).filter((v): v is number => v != null);
    const lows = valid.map((b) => b.l ?? b.c).filter((v): v is number => v != null);
    const last = valid[valid.length - 1];
    return {
      prevClose: quote.previousClose,
      dayOpen: last?.o ?? null,
      dayHigh: last?.h ?? null,
      dayLow: last?.l ?? null,
      rangeHigh: closes.length ? Math.max(...closes) : null,
      rangeLow: closes.length ? Math.min(...closes) : null,
      allHigh: highs.length ? Math.max(...highs) : null,
      allLow: lows.length ? Math.min(...lows) : null,
    };
  }, [quote]);

  // Classified headlines for the chart timeline. Bars are Yahoo daily
  // closes with epoch-ms dates and the headlines carry ISO dates, so a
  // marker can be pinned to its nearest trading day honestly.
  const chartEvents = useMemo<ChartEvent[]>(() => {
    if (!news) return [];
    const out: ChartEvent[] = [];
    for (const a of news.articles) {
      const event = classifyHeadline(a.title);
      if (!event) continue;
      const t = new Date(a.published_at).getTime();
      if (Number.isFinite(t)) out.push({ t, event });
    }
    return out;
  }, [news]);

  const pct = quote?.changePercent ?? null;
  const up = (pct ?? 0) >= 0;
  const sym = quote?.currencySymbol ?? "";
  const asOfLabel = quote
    ? new Date(quote.asOf).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <Link
          to="/"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          ← All stocks
        </Link>

        {loading && (
          <div className="mt-4 space-y-3" aria-label="Loading quote">
            <SkeletonBlock className="h-9 w-72" />
            <SkeletonBlock className="h-56" />
            <SkeletonRows rows={4} />
          </div>
        )}
        {!loading && (error || !quote) && (
          <StateBlock
            tone="error"
            className="mt-8"
            title="Quote unavailable right now"
            message="Check back shortly."
          />
        )}
        {!loading && quote && (
          <>
            <PageHeader
              className="mt-3"
              slug={[
                "STK",
                quote.ticker,
                exchange?.name ?? quote.exchange,
                hasHistory ? "Delayed live" : "End of day",
                `As of ${asOfLabel}`,
              ].join(" · ")}
              title={quote.name}
              actions={
                <>
                  <button
                    onClick={() => toggle(ticker)}
                    aria-label={watched.includes(ticker) ? "Unwatch" : "Watch"}
                    aria-pressed={watched.includes(ticker)}
                    className={cn(
                      "rounded p-1",
                      watched.includes(ticker)
                        ? "text-primary"
                        : "text-muted-foreground/50 hover:text-primary",
                    )}
                  >
                    <Star
                      className="h-5 w-5"
                      fill={watched.includes(ticker) ? "currentColor" : "none"}
                      aria-hidden
                    />
                  </button>
                  <div className="text-right">
                    <p className="num font-mono text-3xl font-bold">
                      {quote.price != null ? fmt(quote.price, sym) : "—"}
                    </p>
                    <p className="num mt-0.5 flex items-center justify-end gap-2 font-mono text-sm font-semibold">
                      {quote.change != null && (
                        <span className={up ? "text-success" : "text-destructive"}>
                          {up && quote.change > 0 ? "+" : ""}
                          {fmt(quote.change, sym)}
                        </span>
                      )}
                      <ChangeCell value={pct} className="text-sm" />
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {quote.timeNote}
                    </p>
                  </div>
                </>
              }
            />

            {quote.board?.limitHit && (
              <p className="-mt-2 mb-4">
                <LimitChip hit={quote.board.limitHit} />
              </p>
            )}

            {quote.board?.speculation ? (
              <p className="mb-4 border-l-2 border-warning bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                Careful: this price jumped on very little trading, and no news explains
                it. Moves like this often fall back just as fast.
              </p>
            ) : quote.board?.liquidity === "thin" ? (
              <p className="mb-4 font-mono text-[11px] text-muted-foreground">
                This stock is bought and sold very little. Its price can jump on a
                single order, so treat a big move with care.
              </p>
            ) : null}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-4">
                {/* Range selector + chart, or EOD-only notes */}
                {hasHistory ? (
                  <>
                    <section aria-label="Price chart">
                      <div className="mb-2 flex gap-1.5" role="tablist" aria-label="Chart range">
                        {RANGES.map((r) => (
                          <Chip
                            key={r.id}
                            role="tab"
                            aria-selected={range === r.id}
                            active={range === r.id}
                            onClick={() => setRange(r.id)}
                          >
                            {r.label}
                          </Chip>
                        ))}
                      </div>
                      <Panel padding="sm">
                        <PriceChart bars={quote.bars} sym={sym} events={chartEvents} />
                      </Panel>
                    </section>

                    {/* 52-week position — only meaningful on the 1Y view */}
                    {range === "1y" && quote.price != null && (
                      <Wk52Bar bars={quote.bars} price={quote.price} sym={sym} />
                    )}

                    {/* Technical signals — real history only */}
                    {quote.technicals ? (
                      <SignalsCard t={quote.technicals} sym={sym} />
                    ) : (
                      <StateBlock
                        tone="empty"
                        title="Technical signals"
                        message="Not enough price history yet for technical signals — check back as history accumulates."
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Panel padding="md">
                      <PanelTitle>
                        End-of-day quote{quote.extras?.updated ? ` · ${quote.extras.updated}` : ""}
                      </PanelTitle>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Price history isn't available for this listing yet — the board updates
                        once per trading day.
                      </p>
                    </Panel>
                    <Panel padding="md">
                      <PanelTitle>Technical signals — still collecting prices</PanelTitle>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        We record this stock&apos;s closing price every trading day. These
                        signals need months of daily prices, so they will appear here once
                        enough days have built up.
                      </p>
                    </Panel>
                  </>
                )}

                {/* Stats */}
                {hasHistory
                  ? stats && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ["Prev close", stats.prevClose],
                          ["Day high", stats.dayHigh],
                          ["Day low", stats.dayLow],
                          [`${range.toUpperCase()} high`, stats.allHigh],
                        ].map(([label, v]) => (
                          <Panel key={label as string} variant="stat" padding="sm">
                            <PanelTitle>{label}</PanelTitle>
                            <p className="num mt-1 font-mono text-sm font-semibold">
                              {typeof v === "number" ? fmt(v, sym) : "—"}
                            </p>
                          </Panel>
                        ))}
                      </div>
                    )
                  : quote.extras && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Panel variant="stat" padding="sm">
                          <PanelTitle>Sector</PanelTitle>
                          <p className="num mt-1 font-mono text-sm font-semibold">
                            {quote.extras.sector ?? "—"}
                          </p>
                        </Panel>
                        <Panel variant="stat" padding="sm">
                          <PanelTitle>YTD</PanelTitle>
                          <p className="mt-1">
                            <ChangeCell value={quote.extras.ytdPercent} className="text-sm" />
                          </p>
                        </Panel>
                        <Panel variant="stat" padding="sm">
                          <PanelTitle>Volume</PanelTitle>
                          <p className="num mt-1 font-mono text-sm font-semibold">
                            {quote.extras.volume != null
                              ? quote.extras.volume.toLocaleString("en-ZA")
                              : "—"}
                          </p>
                        </Panel>
                        <Panel variant="stat" padding="sm">
                          <PanelTitle>Value traded</PanelTitle>
                          <p className="num mt-1 font-mono text-sm font-semibold">
                            {quote.extras.value != null ? fmt(quote.extras.value, sym) : "—"}
                          </p>
                        </Panel>
                      </div>
                    )}
              </div>

              <aside className="lg:sticky lg:top-4">
                <TradeTicket
                  ticker={ticker}
                  price={quote.price}
                  currencySymbol={sym}
                  eod={!hasHistory}
                  asOf={quote.asOf}
                  eodLabel={quote.extras?.updated ?? null}
                  timeNote={quote.timeNote}
                />
                {exchange?.id === "NSE" && <RealCostPanel />}
              </aside>

              <div className="lg:col-start-1">
                <SignalWire signal={news} updatedAt={newsAt} name={quote.name} />
              </div>
            </div>
          </>
        )}
      </PageContainer>
    </TerminalShell>
  );
}
