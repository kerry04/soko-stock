import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Flame, Newspaper } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { EventBadge } from "@/components/stocks/badges";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News Desk — Soko Stock" },
      {
        name: "description",
        content:
          "The 48-hour news wire plus topic desks that flag when a story rate surges past its own baseline.",
      },
    ],
  }),
  component: NewsDeskPage,
});

interface WireArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment_score: number | null;
}

interface Desk {
  id: string;
  label: string;
  hint: string;
  count24h: number;
  medianDaily: number;
  surgeRatio: number | null;
  surging: boolean;
  articles: WireArticle[];
}

interface HeatItem {
  ticker: string;
  name: string;
  count24h: number;
  surgeRatio: number | null;
  surging: boolean;
  tilt: "positive" | "negative" | "mixed" | null;
}

interface WireResponse {
  ok: boolean;
  articles: WireArticle[];
  desks: Desk[];
  heat: HeatItem[];
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

/** Per-headline sentiment dot: green/red/grey, hollow when unscored — Pulse's rule. */
function SentimentDot({ score }: { score: number | null }) {
  const cls =
    score == null
      ? "border border-muted-foreground/50 bg-transparent"
      : score >= 0.2
        ? "bg-success"
        : score <= -0.2
          ? "bg-destructive"
          : "bg-muted-foreground";
  return (
    <span
      className={cn("mr-2 inline-block h-2 w-2 shrink-0 rounded-full", cls)}
      title={score == null ? "not scored yet" : `sentiment ${score.toFixed(2)}`}
      aria-hidden
    />
  );
}

function ArticleRow({ a }: { a: WireArticle }) {
  return (
    <li className="flex items-start gap-1 border-b border-border/50 py-2 last:border-0">
      <span className="mt-1.5 shrink-0">
        <SentimentDot score={a.sentiment_score} />
      </span>
      <div className="min-w-0">
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm leading-snug text-foreground underline-offset-2 hover:underline"
        >
          {a.title}
        </a>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground">
          <span>
            {a.source} · {timeAgo(a.published_at)}
          </span>
          <EventBadge title={a.title} />
        </p>
      </div>
    </li>
  );
}

function NewsDeskPage() {
  const [data, setData] = useState<WireResponse | null>(null);
  const [active, setActive] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/stocks/news-wire")
        .then((r) => r.json())
        .then((d: WireResponse) => {
          if (cancelled) return;
          if (d.ok) {
            setData(d);
            setError(null);
          } else setError("News wire unavailable — retrying shortly.");
        })
        .catch(() => {
          if (!cancelled) setError("News wire unavailable — retrying shortly.");
        });
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const desk = data?.desks.find((d) => d.id === active) ?? null;
  const articles = useMemo(
    () => (active === "all" ? (data?.articles ?? []) : (desk?.articles ?? [])),
    [data, active, desk],
  );

  return (
    <TerminalShell>
      <div className="mx-auto max-w-[1100px] px-3 py-4 sm:px-5">
        <div className="mb-3 flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.1em]">
            News Desk <span className="text-muted-foreground">· 48h wire</span>
          </h1>
        </div>

        {/* Company heat — the listed names the wire is talking about */}
        {data && data.heat.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Most covered companies, last 24 hours">
            <span className="mr-1 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <Flame className="h-3 w-3 text-amber-500" aria-hidden /> News heat
            </span>
            {data.heat.map((h) => (
              <Link
                key={h.ticker}
                to="/stocks/$ticker"
                params={{ ticker: h.ticker }}
                title={`${h.name} — ${h.count24h} stories in 24h${h.surging && h.surgeRatio != null ? `, surging ${h.surgeRatio.toFixed(1)}×` : ""}${h.tilt ? `, 7-day tilt ${h.tilt}` : ""}`}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="font-bold text-foreground">{h.ticker.replace(/\.(JO|NSE|NGX|GSE|DSE|USE|LUSE|ZSE|BSE|MSE|SEM|VFEX)$/, "")}</span>
                <span className="num">{h.count24h}</span>
                {h.surging && h.surgeRatio != null && (
                  <span className="font-bold text-amber-500">{h.surgeRatio.toFixed(1)}×</span>
                )}
                {h.tilt === "positive" && <span className="text-success" aria-label="positive tilt">▲</span>}
                {h.tilt === "negative" && <span className="text-red-500" aria-label="negative tilt">▼</span>}
                {h.tilt === "mixed" && <span className="text-muted-foreground" aria-label="mixed tilt">◆</span>}
              </Link>
            ))}
          </div>
        )}

        {/* Desk chips */}
        <div className="mb-2 flex flex-wrap items-center gap-2" role="tablist" aria-label="News desks">
          <button
            role="tab"
            aria-selected={active === "all"}
            onClick={() => setActive("all")}
            className={cn(
              "rounded border px-3 py-1.5 font-mono text-xs",
              active === "all"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            All wire
            <span className={cn("ml-1.5 font-bold", active === "all" ? "text-background" : "text-foreground")}>
              {data?.articles.length ?? "—"}
            </span>
          </button>
          {data?.desks.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={active === d.id}
              onClick={() => setActive(d.id)}
              title={`${d.hint} — ${d.count24h} stories in 24h (baseline ${d.medianDaily}/day)`}
              className={cn(
                "rounded border px-3 py-1.5 font-mono text-xs",
                active === d.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {d.surging && <Flame className="mr-1 inline h-3 w-3 text-amber-500" aria-hidden />}
              {d.label}
              <span className={cn("ml-1.5 font-bold", active === d.id ? "text-background" : "text-foreground")}>
                {d.count24h}
              </span>
            </button>
          ))}
        </div>
        {desk ? (
          <p className="mb-3 text-xs text-muted-foreground">
            {desk.hint} — {desk.count24h} stories in 24h vs {desk.medianDaily}/day baseline
            {desk.surging && desk.surgeRatio != null && (
              <span className="ml-1 font-bold text-amber-500">
                · surging {desk.surgeRatio.toFixed(1)}×
              </span>
            )}
          </p>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            Newest headlines across the pipeline. A flame on a desk means its story rate is surging past its own 30-day baseline.
          </p>
        )}

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        {!data ? (
          <p className="font-mono text-sm text-muted-foreground">Tuning the wire…</p>
        ) : articles.length === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">
            {active === "all"
              ? "No stories in the last 48 hours — the pipeline may be between cycles."
              : "No stories on this desk in the last 48 hours."}
          </p>
        ) : (
          <section className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5" aria-label="News wire">
            <ul>
              {articles.map((a) => (
                <ArticleRow key={a.id} a={a} />
              ))}
            </ul>
          </section>
        )}

        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3" aria-hidden />
          Headlines link out to the outlet. Scores are pipeline VADER; hollow dots are not scored yet.
        </p>
      </div>
    </TerminalShell>
  );
}
