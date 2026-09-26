import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Flame,
  MessageSquareText,
  Newspaper,
  Radio,
  Snowflake,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: "Pulse — Soko Stock" },
      {
        name: "description",
        content: "Ranked market signals: news surges, sentiment tilts, 52-week events, RSI extremes, unusual volume.",
      },
    ],
  }),
  component: PulsePage,
});

interface Story {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

interface Mover {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  currencySymbol: string;
}

interface NewsSignal {
  ticker: string;
  count24h: number;
  medianDaily: number;
  surgeRatio: number | null;
  surging: boolean;
  sentiment7d: {
    pos: number;
    neg: number;
    tilt: "positive" | "negative" | "mixed" | null;
  };
  latestAt: string | null;
}

interface BoardRow {
  ticker: string;
  name: string;
  price: number;
  changePercent: number | null;
  wk52High: number | null;
  wk52Low: number | null;
  rsi: number | null;
  relVolume: number | null;
}

type FeedKind =
  | "news-surge"
  | "sentiment"
  | "52wk-high"
  | "52wk-low"
  | "rsi-hot"
  | "rsi-cold"
  | "volume";

interface FeedItem {
  id: string;
  kind: FeedKind;
  ticker: string;
  name: string;
  headline: string;
  detail: string;
  score: number;
  at: string | null;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const KIND_META: Record<FeedKind, { icon: typeof Zap; cls: string; label: string }> = {
  "news-surge": { icon: Zap, cls: "text-sky-400", label: "News surge" },
  sentiment: { icon: MessageSquareText, cls: "text-violet-400", label: "Sentiment" },
  "52wk-high": { icon: ArrowUpRight, cls: "text-success", label: "52-week high" },
  "52wk-low": { icon: ArrowDownRight, cls: "text-red-500", label: "52-week low" },
  "rsi-hot": { icon: Flame, cls: "text-orange-400", label: "RSI overbought" },
  "rsi-cold": { icon: Snowflake, cls: "text-sky-300", label: "RSI oversold" },
  volume: { icon: BarChart3, cls: "text-amber-400", label: "Unusual volume" },
};

/**
 * Pulse: a ranked, factual signal feed. Every item states something the
 * data actually says — a news surge, a sentiment tilt, a 52-week event, an
 * RSI extreme, an unusual-volume session — ordered by signal intensity.
 * Public, no cron, no migration.
 */
function PulsePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const [sRes, sigRes, bRes] = await Promise.all([
        supabase
          .from("raw_news_data")
          .select("id, title, url, source, published_at")
          .eq("processed", true)
          .gte("published_at", d24)
          .order("published_at", { ascending: false })
          .limit(10),
        fetch("/api/stocks/news-signals?exchange=JSE").then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch("/api/stocks/board?exchange=JSE").then((r) =>
          r.ok ? r.json() : null,
        ),
      ]);

      const names = new Map<string, string>();
      const rows = (bRes?.rows ?? []) as BoardRow[];
      for (const r of rows) names.set(r.ticker, r.name);

      const items: FeedItem[] = [];
      const seen = new Set<string>();
      const push = (it: FeedItem) => {
        // One item per ticker per kind at most; a ticker can still appear
        // under several kinds (e.g. surge + 52wk high).
        const k = `${it.ticker}:${it.kind}`;
        if (seen.has(k)) return;
        seen.add(k);
        items.push(it);
      };

      // News surges + sentiment tilts.
      for (const s of (sigRes?.signals ?? []) as NewsSignal[]) {
        const name = names.get(s.ticker) ?? s.ticker;
        if (s.surging && s.surgeRatio != null) {
          push({
            id: `surge-${s.ticker}`,
            kind: "news-surge",
            ticker: s.ticker,
            name,
            headline: `${name} news volume ${s.surgeRatio.toFixed(1)}× its 30-day pace`,
            detail: `${s.count24h} linked stories in 24h · baseline ${s.medianDaily}/day`,
            score: s.surgeRatio * (1 + Math.log10(Math.max(1, s.count24h))),
            at: s.latestAt,
          });
        }
        const t = s.sentiment7d;
        if (t.tilt === "positive" || t.tilt === "negative") {
          push({
            id: `sent-${s.ticker}`,
            kind: "sentiment",
            ticker: s.ticker,
            name,
            headline: `${name} headlines tilt ${t.tilt} this week`,
            detail: `${t.pos} positive · ${t.neg} negative (scored articles)`,
            score: 3,
            at: s.latestAt,
          });
        }
      }

      // Technical events from the live board.
      for (const r of rows) {
        const sym = bRes?.currencySymbol ?? "";
        const px = `${sym}${r.price.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (r.wk52High != null && r.price >= r.wk52High) {
          push({
            id: `hi-${r.ticker}`,
            kind: "52wk-high",
            ticker: r.ticker,
            name: r.name,
            headline: `${r.name} at a new 52-week high`,
            detail: px,
            score: 5,
            at: null,
          });
        } else if (r.wk52Low != null && r.price <= r.wk52Low) {
          push({
            id: `lo-${r.ticker}`,
            kind: "52wk-low",
            ticker: r.ticker,
            name: r.name,
            headline: `${r.name} at a new 52-week low`,
            detail: px,
            score: 5,
            at: null,
          });
        }
        if (r.rsi != null && r.rsi >= 70) {
          push({
            id: `rsi-${r.ticker}`,
            kind: "rsi-hot",
            ticker: r.ticker,
            name: r.name,
            headline: `${r.name} RSI ${r.rsi.toFixed(0)} — overbought`,
            detail: "RSI(14) above 70",
            score: 4,
            at: null,
          });
        } else if (r.rsi != null && r.rsi <= 30) {
          push({
            id: `rsi-${r.ticker}`,
            kind: "rsi-cold",
            ticker: r.ticker,
            name: r.name,
            headline: `${r.name} RSI ${r.rsi.toFixed(0)} — oversold`,
            detail: "RSI(14) below 30",
            score: 4,
            at: null,
          });
        }
        if (r.relVolume != null && r.relVolume >= 2) {
          push({
            id: `vol-${r.ticker}`,
            kind: "volume",
            ticker: r.ticker,
            name: r.name,
            headline: `${r.name} trading ${r.relVolume.toFixed(1)}× average volume`,
            detail: "Latest session vs 20-day average",
            score: r.relVolume * 1.2,
            at: null,
          });
        }
      }

      items.sort((a, b) => b.score - a.score);

      // Biggest stock movers of the day, from the live board.
      const computedMovers: Mover[] = rows
        .filter((r) => r.changePercent != null)
        .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
        .slice(0, 8)
        .map((r) => ({
          ticker: r.ticker,
          name: r.name,
          price: r.price,
          changePercent: r.changePercent as number,
          currencySymbol: bRes.currencySymbol as string,
        }));

      if (!cancelled) {
        setFeed(items);
        setStories((sRes.data ?? []) as Story[]);
        setMovers(computedMovers);
        setAsOf(new Date());
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TerminalShell>
      <main className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5 sm:py-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-success">
          Terminal · signal feed
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Pulse</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {asOf ? `As of ${fmtTime(asOf.toISOString())}` : loading ? "Loading…" : "No data"}
          </p>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-xl border border-border/70 bg-card/40"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Ranked signal feed */}
            <section
              aria-label="Ranked market signals"
              className="mt-6 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
            >
              <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <Zap className="h-3.5 w-3.5" aria-hidden /> Signals, ranked
              </h2>
              {feed.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No strong signals right now — the feed updates as the news
                  pipeline and the market move.
                </p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {feed.map((f, i) => {
                    const meta = KIND_META[f.kind];
                    const Icon = meta.icon;
                    return (
                      <li key={f.id}>
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: f.ticker }}
                          className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 transition-colors hover:bg-accent/40"
                        >
                          <span
                            className="num w-6 shrink-0 font-mono text-[11px] text-muted-foreground"
                            aria-hidden
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Icon className={cn("h-4 w-4 shrink-0", meta.cls)} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.headline}</p>
                            <p className="num mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {meta.label} · {f.detail}
                              {f.at ? ` · ${timeAgo(f.at)}` : ""}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Ranked by signal intensity. Facts from the live pipeline and
                market data — not recommendations.
              </p>
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* Top stories */}
              <section
                aria-label="Top stories, last 24 hours"
                className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
              >
                <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  <Newspaper className="h-3.5 w-3.5" aria-hidden /> Top stories
                </h2>
                {stories.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No processed stories in the last 24 hours.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {stories.map((s, i) => (
                      <li key={s.id} className="flex gap-3">
                        <span
                          className="num w-6 shrink-0 font-mono text-[11px] text-muted-foreground"
                          aria-hidden
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm leading-snug text-foreground hover:underline"
                          >
                            {s.title}
                            <ExternalLink
                              className="ml-1 inline h-3 w-3 text-muted-foreground"
                              aria-hidden
                            />
                          </a>
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {s.source} · {timeAgo(s.published_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Biggest movers */}
              <section
                aria-label="Biggest market movers, last 24 hours"
                className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
              >
                <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  <Radio className="h-3.5 w-3.5" aria-hidden /> Market movers
                </h2>
                {movers.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No stock moves to report right now.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {movers.map((m) => {
                      const up = m.changePercent >= 0;
                      return (
                        <li key={m.ticker}>
                          <Link
                            to="/stocks/$ticker"
                            params={{ ticker: m.ticker }}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 transition-colors hover:bg-accent/40"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{m.name}</p>
                              <p className="num mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                {m.currencySymbol}
                                {m.price.toLocaleString("en-ZA", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "num inline-flex shrink-0 items-center gap-1 font-mono text-sm font-bold tabular-nums",
                                up ? "text-success" : "text-destructive",
                              )}
                            >
                              {up ? (
                                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {up ? "+" : ""}
                              {m.changePercent.toFixed(2)}%
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Biggest daily moves on the JSE board.
                </p>
              </section>
            </div>
          </>
        )}
      </main>
    </TerminalShell>
  );
}
