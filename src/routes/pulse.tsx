import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Newspaper, Radio, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: "Pulse — Soko Stock" },
      {
        name: "description",
        content: "The 24-hour signal pulse: top stories, fastest keywords, biggest stock movers.",
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

interface Keyword {
  keyword: string;
  velocity: number;
  mentions_1h: number;
  growth: number | null;
  avg_sentiment: number | null;
  category: string | null;
}

interface Mover {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  currencySymbol: string;
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

/**
 * Pulse: the 24h signal digest. Top stories, fastest-moving keywords, and
 * the biggest price movers — all from the live pipeline, timestamped.
 * Public, no cron, no migration.
 */
function PulsePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const [sRes, kRes, bRes] = await Promise.all([
        supabase
          .from("raw_news_data")
          .select("id, title, url, source, published_at")
          .eq("processed", true)
          .gte("published_at", d24)
          .order("published_at", { ascending: false })
          .limit(12),
        supabase
          .from("trending_keywords")
          .select("keyword, velocity, mentions_1h, growth, avg_sentiment, category")
          .order("velocity", { ascending: false })
          .limit(10),
        fetch("/api/stocks/board?exchange=JSE").then((r) => (r.ok ? r.json() : null)),
      ]);

      // Biggest stock movers of the day, from the live board.
      const computedMovers: Mover[] = [];
      const boardRows = (bRes?.rows ?? []) as {
        ticker: string;
        name: string;
        price: number;
        changePercent: number | null;
      }[];
      computedMovers.push(
        ...boardRows
          .filter((r) => r.changePercent != null)
          .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
          .slice(0, 8)
          .map((r) => ({
            ticker: r.ticker,
            name: r.name,
            price: r.price,
            changePercent: r.changePercent as number,
            currencySymbol: bRes.currencySymbol as string,
          })),
      );

      if (!cancelled) {
        setStories((sRes.data ?? []) as Story[]);
        setKeywords((kRes.data ?? []) as Keyword[]);
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
          Terminal · 24h digest
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
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
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

            {/* Velocity keywords */}
            <section
              aria-label="Fastest-moving keywords"
              className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
            >
              <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <Zap className="h-3.5 w-3.5" aria-hidden /> Velocity keywords
              </h2>
              {keywords.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No keyword velocity tracked right now.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {keywords.map((k) => (
                    <li
                      key={k.keyword}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{k.keyword}</p>
                        <p className="num mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {k.mentions_1h} mentions/hr
                          {k.growth !== null &&
                            ` · ${k.growth >= 0 ? "+" : ""}${Math.round(k.growth * 100)}%`}
                        </p>
                      </div>
                      <span className="num shrink-0 font-mono text-sm font-bold text-success tabular-nums">
                        {Number(k.velocity).toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Mentions-per-hour momentum, refreshed by the pipeline.
              </p>
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
        )}
      </main>
    </TerminalShell>
  );
}
