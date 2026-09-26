import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Minus,
  Newspaper,
  Star,
} from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { supabase } from "@/integrations/supabase/client";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
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
  asOf: string;
  timeNote: string;
  bars: Bar[];
  extras?: QuoteExtras;
  technicals?: Technicals | null;
}

interface NewsHit {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

const RANGES = [
  { id: "1mo", label: "1M" },
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
] as const;

function fmt(v: number, sym: string): string {
  return `${sym}${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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
    <div className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          52-week range
        </p>
        <p
          className={cn(
            "num font-mono text-[11px] font-semibold",
            nearHigh ? "text-success" : nearLow ? "text-red-500" : "text-muted-foreground",
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
          <span className="text-red-500/90">Low</span> {fmt(low, sym)}
        </span>
        <span>
          <span className="text-success/90">High</span> {fmt(high, sym)}
        </span>
      </div>
    </div>
  );
}

const GAUGE_SEGS = [
  { label: "Strong Sell", color: "#ef4444" },
  { label: "Sell", color: "#f59e0b" },
  { label: "Neutral", color: "#6b7280" },
  { label: "Buy", color: "#a3e635" },
  { label: "Strong Buy", color: "#22c55e" },
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
 * Technical signals card (TradingView pattern): composite gauge from five
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
        ? ["Sell", "bg-red-500/15 text-red-500"]
        : ["Neutral", "bg-muted text-muted-foreground"];

  const rows: [string, string, [string, string]][] = [
    [`RSI (14)`, t.rsi.toFixed(1), pill(t.votes.rsi)],
    ["MACD (12, 26, 9)", t.macdBullish ? "Bullish" : "Bearish", pill(t.votes.macd)],
    [`Price vs 50-day ${fmt(t.sma50, sym)}`, t.aboveSma50 ? "Above" : "Below", pill(t.votes.vs50)],
    [`Price vs 200-day ${fmt(t.sma200, sym)}`, t.aboveSma200 ? "Above" : "Below", pill(t.votes.vs200)],
    [
      "50-day vs 200-day",
      t.goldenCross ? "Golden cross" : "Death cross",
      pill(t.votes.cross),
    ],
    [
      "Volume vs 20-day avg",
      t.relVolume != null ? `${t.relVolume.toFixed(1)}×` : "—",
      t.relVolume != null && t.relVolume >= 2
        ? ["Unusual", "bg-amber-500/15 text-amber-500"]
        : ["Normal", "bg-muted text-muted-foreground"],
    ],
  ];

  return (
    <section
      aria-label="Technical signals"
      className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Technical signals
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">{t.barsUsed}d of history</p>
      </div>

      <div className="mt-1 flex flex-col items-center sm:flex-row sm:gap-6">
        <div className="w-full max-w-[240px]">
          <svg viewBox="0 0 220 118" className="w-full" role="img" aria-label={`Technical rating: ${t.label}`}>
            {GAUGE_SEGS.map((s, i) => (
              <path
                key={s.label}
                d={arcPath(cx, cy, r, 180 - i * 36, 180 - (i + 1) * 36)}
                fill="none"
                stroke={s.color}
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
              t.composite >= 0.2 ? "text-success" : t.composite <= -0.2 ? "text-red-500" : "text-muted-foreground",
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

      <p className="mt-3 border-t border-border/50 pt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Pattern from delayed daily data — not a recommendation.
      </p>
    </section>
  );
}

/** First meaningful word of the company name, for news matching. */
function companyKeyword(name: string): string {
  const stop = new Set(["the", "group", "holdings", "limited", "ltd", "sa", "nv", "plc", "inc"]);
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/);
  return words.find((w) => w.length > 2 && !stop.has(w)) ?? words[0] ?? "";
}

function PriceChart({ bars, sym, up }: { bars: Bar[]; sym: string; up: boolean }) {
  const pts = useMemo(() => bars.filter((b) => b.c != null) as (Bar & { c: number })[], [bars]);
  if (pts.length < 2) return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Not enough history yet.</div>;

  const W = 720;
  const H = 240;
  const padX = 8;
  const padY = 14;
  const min = Math.min(...pts.map((p) => p.c));
  const max = Math.max(...pts.map((p) => p.c));
  const span = Math.max(0.0001, max - min);
  const x = (i: number) => padX + (i / (pts.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const color = up ? "#22c55e" : "#ef4444";
  const gid = `sg-${up ? "up" : "dn"}`;

  const firstT = new Date(pts[0].t);
  const lastT = new Date(pts[pts.length - 1].t);
  const dateFmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Price history chart">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].c)} r="3.5" fill={color} />
      </svg>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span>{fmt(max, sym)} high</span>
        <span>
          {dateFmt(firstT)} → {dateFmt(lastT)}
        </span>
        <span>{fmt(min, sym)} low</span>
      </div>
    </div>
  );
}

function StockDetail() {
  const { ticker } = Route.useParams();
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1y");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [news, setNews] = useState<NewsHit[]>([]);
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

  // Linked news: company keyword in title/keywords, last 7 days.
  useEffect(() => {
    if (!quote) return;
    const kw = companyKeyword(quote.name);
    if (!kw) return;
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("raw_news_data")
          .select("id, title, url, source, published_at")
          .gte("published_at", since)
          .ilike("title", `%${kw}%`)
          .order("published_at", { ascending: false })
          .limit(5);
        if (!cancelled && data) setNews(data as NewsHit[]);
      } catch {
        /* news is enrichment — never break the page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quote]);

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

  const pct = quote?.changePercent ?? null;
  const up = (pct ?? 0) >= 0;
  const sym = quote?.currencySymbol ?? "";

  return (
    <TerminalShell>
      <div className="mx-auto max-w-[1100px] px-3 py-4 sm:px-5">
        <Link
          to="/"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          ← Boards
        </Link>

        {loading && (
          <div className="mt-4 space-y-3">
            <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
            <div className="h-56 animate-pulse rounded-xl bg-muted/40" />
          </div>
        )}
        {!loading && (error || !quote) && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Quote unavailable right now — check back shortly.
          </p>
        )}
        {!loading && quote && (
          <>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold sm:text-2xl">{quote.name}</h1>
                  <button
                    onClick={() => toggle(ticker)}
                    aria-label={watched.includes(ticker) ? "Unwatch" : "Watch"}
                    aria-pressed={watched.includes(ticker)}
                    className={cn(
                      "rounded p-1",
                      watched.includes(ticker)
                        ? "text-amber-400"
                        : "text-muted-foreground/50 hover:text-amber-400",
                    )}
                  >
                    <Star
                      className="h-5 w-5"
                      fill={watched.includes(ticker) ? "currentColor" : "none"}
                      aria-hidden
                    />
                  </button>
                </div>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {quote.ticker} · {exchange?.name ?? quote.exchange}
                </p>
              </div>
              <div className="text-right">
                <p className="num font-mono text-3xl font-bold">
                  {quote.price != null ? fmt(quote.price, sym) : "—"}
                </p>
                <p
                  className={cn(
                    "num mt-0.5 inline-flex items-center gap-1 font-mono text-sm font-semibold",
                    up ? "text-success" : "text-red-500",
                  )}
                >
                  {pct == null ? (
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  ) : up ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {quote.change != null && (
                    <span>
                      {up && quote.change > 0 ? "+" : ""}
                      {fmt(quote.change, sym)}
                    </span>
                  )}
                  {pct != null && (
                    <span>
                      ({up ? "+" : ""}
                      {pct.toFixed(2)}%)
                    </span>
                  )}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{quote.timeNote}</p>
              </div>
            </div>

            {/* Range selector + chart, or EOD-only note */}
            {hasHistory ? (
              <>
                <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Chart range">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      role="tab"
                      aria-selected={range === r.id}
                      onClick={() => setRange(r.id)}
                      className={cn(
                        "rounded-md px-3 py-1.5 font-mono text-[11px] font-bold",
                        range === r.id
                          ? "bg-success/15 text-success"
                          : "text-muted-foreground hover:bg-card hover:text-foreground",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 rounded-xl border border-border/70 bg-card/40 p-3 sm:p-4">
                  <PriceChart bars={quote.bars} sym={sym} up={up} />
                </div>

                {/* 52-week position — only meaningful on the 1Y view */}
                {range === "1y" && quote.price != null && (
                  <Wk52Bar bars={quote.bars} price={quote.price} sym={sym} />
                )}

                {/* Technical signals — real history only */}
                {quote.technicals ? (
                  <SignalsCard t={quote.technicals} sym={sym} />
                ) : (
                  <p className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 font-mono text-[11px] text-muted-foreground">
                    Not enough price history yet for technical signals — check back as history
                    accumulates.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">
                    End-of-day quote{quote.extras?.updated ? ` · ${quote.extras.updated}` : ""}.
                  </p>
                  <p className="mt-1">
                    Price history isn't available for this listing yet — the board updates once per
                    trading day.
                  </p>
                </div>
                <div className="mt-3 rounded-xl border border-border/60 bg-card/40 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Technical signals · history building
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Signals like RSI, moving averages, and volume patterns need daily price
                    history. We're recording this listing's closes every trading day — signals
                    unlock automatically once there's enough to compute them honestly.
                  </p>
                </div>
              </>
            )}

            {/* Stats */}
            {hasHistory ? (
              stats && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Prev close", stats.prevClose],
                    ["Day high", stats.dayHigh],
                    ["Day low", stats.dayLow],
                    [`${range.toUpperCase()} high`, stats.allHigh],
                  ].map(([label, v]) => (
                    <div key={label as string} className="rounded-xl border border-border/60 bg-card/40 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {label}
                      </p>
                      <p className="num mt-1 font-mono text-sm font-semibold">
                        {typeof v === "number" ? fmt(v, sym) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              quote.extras && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Sector", quote.extras.sector],
                    [
                      "YTD",
                      quote.extras.ytdPercent != null
                        ? `${quote.extras.ytdPercent >= 0 ? "+" : ""}${quote.extras.ytdPercent.toFixed(2)}%`
                        : null,
                    ],
                    [
                      "Volume",
                      quote.extras.volume != null
                        ? quote.extras.volume.toLocaleString("en-ZA")
                        : null,
                    ],
                    [
                      "Value traded",
                      quote.extras.value != null
                        ? `${sym}${quote.extras.value.toLocaleString("en-ZA")}`
                        : null,
                    ],
                  ].map(([label, v]) => (
                    <div key={label as string} className="rounded-xl border border-border/60 bg-card/40 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {label}
                      </p>
                      <p className="num mt-1 font-mono text-sm font-semibold">{v ?? "—"}</p>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Why it's moving */}
            <section className="mt-6" aria-label="Related news signals">
              <div className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-success" aria-hidden />
                <h2 className="font-mono text-sm font-bold uppercase tracking-[0.18em]">
                  Signal wire
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Latest headlines mentioning {companyKeyword(quote.name) || "this company"} from our
                global news pipeline.
              </p>
              {news.length === 0 ? (
                <p className="mt-3 rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                  No headlines in the last 7 days.{" "}
                  <Link to="/map" className="text-success hover:underline">
                    Check the signal map
                  </Link>{" "}
                  for the wider picture.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {news.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm leading-snug hover:underline"
                      >
                        {n.title}
                        <ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" aria-hidden />
                      </a>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {n.source} · {timeAgo(n.published_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Educational terminal — not investment advice.
            </p>
          </>
        )}
      </div>
    </TerminalShell>
  );
}
