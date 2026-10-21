import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Flame,
  Landmark,
  MessageSquareText,
  Newspaper,
  Radio,
  Snowflake,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SkeletonBlock, StateBlock } from "@/components/common/states";
import { ChangeCell } from "@/components/stocks/change";
import { BandChip, type BandState } from "@/components/macro/BandChip";
import { isMarketRelevant } from "@/lib/news/relevance";
import { dedupeByTitle } from "@/lib/news/dedupe";
import { fmtPrice, timeAgo } from "@/lib/stocks/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: "Pulse — Soko Stock" },
      {
        name: "description",
        content: "What is moving today, biggest first: companies suddenly in the news, prices at their highest or lowest in a year, and shares changing hands far more than usual.",
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

interface MacroStrip {
  band: BandState | null;
  cpi: number | null;
  cbr: number | null;
  fxUsd: number | null;
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

/**
 * Kind chips in the shared badge recipes — semantic tokens only: amber
 * (primary) is attention, success/destructive are direction, muted is
 * neutral. RSI hot/cold follow the BoardRowBadge recipes.
 */
const KIND_META: Record<FeedKind, { icon: typeof Zap; chipCls: string; label: string }> = {
  "news-surge": { icon: Zap, chipCls: "bg-primary/15 text-primary", label: "News surge" },
  sentiment: { icon: MessageSquareText, chipCls: "bg-muted text-muted-foreground", label: "Sentiment" },
  "52wk-high": { icon: ArrowUpRight, chipCls: "bg-success/15 text-success", label: "52-week high" },
  "52wk-low": { icon: ArrowDownRight, chipCls: "bg-destructive/15 text-destructive", label: "52-week low" },
  "rsi-hot": { icon: Flame, chipCls: "bg-destructive/15 text-destructive", label: "RSI overbought" },
  "rsi-cold": { icon: Snowflake, chipCls: "bg-success/15 text-success", label: "RSI oversold" },
  volume: { icon: BarChart3, chipCls: "bg-primary/10 text-primary", label: "Unusual volume" },
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
  const [macro, setMacro] = useState<MacroStrip | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Economy strip: its own fetch and try/catch — a macro failure must
    // never break the signal feed.
    (async () => {
      try {
        const res = await fetch("/api/macro/overview");
        const json = res.ok ? await res.json() : null;
        if (!cancelled && json?.ok) {
          const ind = json.indicators ?? {};
          setMacro({
            band: (json.band as BandState | null) ?? null,
            cpi: ind.cpi_yoy?.value ?? null,
            cbr: ind.cbr?.value ?? null,
            fxUsd: ind.fx_usd?.value ?? null,
          });
        }
      } catch {
        /* absent on failure */
      }
    })();
    (async () => {
      const d24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const [sRes, sigRes, bRes] = await Promise.all([
        supabase
          .from("raw_news_data")
          .select("id, title, url, source, published_at")
          .eq("processed", true)
          .gte("published_at", d24)
          .order("published_at", { ascending: false })
          .limit(40),
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
            headline: `${name} news volume ${s.surgeRatio.toFixed(1)}× its usual rate`,
            detail: `${s.count24h} stories in 24h · usually ${s.medianDaily}/day`,
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
            headline: `${name} coverage mostly ${t.tilt} this week`,
            detail: `${t.pos} positive · ${t.neg} negative stories scored`,
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
            detail: "Momentum score above 70 — the price has risen fast and far",
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
            detail: "Momentum score under 30 — the price has fallen fast and far",
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
            detail: "Today's trading vs its 20-day average",
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
        setStories(
          dedupeByTitle(
            ((sRes.data ?? []) as Story[]).filter((s) =>
              isMarketRelevant(s.title),
            ),
          ).slice(0, 10),
        );
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
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="PLS · Signal feed"
          title="Pulse"
          description="What is moving today, biggest first: companies suddenly in the news, prices at their highest or lowest in a year, and shares changing hands far more than usual."
          actions={
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {asOf ? `As of ${fmtTime(asOf.toISOString())}` : loading ? "Loading…" : "No data"}
            </p>
          }
        />

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="h-72" />
            ))}
          </div>
        ) : (
          <>
            {/* Economy strip — one section above the signal list. Absent on failure. */}
            {macro && (macro.cpi != null || macro.cbr != null || macro.fxUsd != null) && (
              <Panel variant="stat" padding="md" role="region" aria-label="Economy snapshot">
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2">
                    <Landmark className="h-3.5 w-3.5" aria-hidden /> Economy
                  </PanelTitle>
                  <Link
                    to="/economy"
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Full view →
                  </Link>
                </PanelHeader>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  {macro.cpi != null && (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Inflation
                      </span>
                      <span className="num font-mono text-lg font-bold tabular-nums">
                        {macro.cpi.toFixed(2)}%
                      </span>
                      <BandChip band={macro.band} />
                    </span>
                  )}
                  {macro.cbr != null && (
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Central bank rate
                      </span>
                      <span className="num font-mono text-lg font-bold tabular-nums">
                        {macro.cbr.toFixed(2)}%
                      </span>
                    </span>
                  )}
                  {macro.fxUsd != null && (
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        KES/USD
                      </span>
                      <span className="num font-mono text-lg font-bold tabular-nums">
                        {macro.fxUsd.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>
              </Panel>
            )}

            {/* Ranked signal feed — a ruled ledger, not cards */}
            <Panel
              variant="plain"
              padding="md"
              className={macro ? "mt-4" : undefined} role="region"
              aria-label="Ranked market signals"
            >
              <PanelHeader>
                <PanelTitle className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" aria-hidden /> Today&apos;s signals, biggest first
                </PanelTitle>
              </PanelHeader>
              {feed.length === 0 ? (
                <StateBlock
                  tone="empty"
                  className="border-none py-4"
                  title="No strong signals right now"
                  message="This list fills up as news and prices move during the day."
                />
              ) : (
                <ol>
                  {feed.map((f, i) => {
                    const meta = KIND_META[f.kind];
                    const Icon = meta.icon;
                    return (
                      <li key={f.id} className="border-b border-border/50 last:border-0">
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: f.ticker }}
                          className="-mx-1 flex items-center gap-3 rounded px-1 py-2.5 transition-colors hover:bg-accent/40"
                        >
                          <span
                            className="num w-6 shrink-0 font-mono text-[11px] text-muted-foreground"
                            aria-hidden
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.headline}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]",
                                  meta.chipCls,
                                )}
                              >
                                <Icon className="h-3 w-3" aria-hidden />
                                {meta.label}
                              </span>
                              <span>
                                {f.detail}
                                {f.at ? ` · ${timeAgo(f.at)}` : ""}
                              </span>
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Ordered by how unusual each item is. Everything here is counted
                from news and prices — none of it is a recommendation.
              </p>
            </Panel>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* Top stories */}
              <Panel variant="plain" padding="md" role="region" aria-label="Top stories, last 24 hours">
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2">
                    <Newspaper className="h-3.5 w-3.5" aria-hidden /> Top stories
                  </PanelTitle>
                </PanelHeader>
                {stories.length === 0 ? (
                  <StateBlock
                    tone="empty"
                    className="border-none py-4"
                    message="No stories in the last 24 hours."
                  />
                ) : (
                  <ol>
                    {stories.map((s, i) => (
                      <li
                        key={s.id}
                        className="flex gap-3 border-b border-border/50 py-2.5 first:pt-0 last:border-0"
                      >
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
              </Panel>

              {/* Biggest movers */}
              <Panel variant="plain" padding="md" role="region" aria-label="Biggest market movers, last 24 hours">
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2">
                    <Radio className="h-3.5 w-3.5" aria-hidden /> Market movers
                  </PanelTitle>
                </PanelHeader>
                {movers.length === 0 ? (
                  <StateBlock
                    tone="empty"
                    className="border-none py-4"
                    message="No stock moves to report right now."
                  />
                ) : (
                  <ul>
                    {movers.map((m) => (
                      <li key={m.ticker} className="border-b border-border/50 last:border-0">
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: m.ticker }}
                          className="-mx-1 flex items-center justify-between gap-3 rounded px-1 py-2 transition-colors hover:bg-accent/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.name}</p>
                            <p className="num mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {fmtPrice(m.price, m.currencySymbol)}
                            </p>
                          </div>
                          <ChangeCell value={m.changePercent} className="shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Biggest daily moves on the JSE board.
                </p>
              </Panel>
            </div>
          </>
        )}
      </PageContainer>
    </TerminalShell>
  );
}
