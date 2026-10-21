import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Flame } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SkeletonRows, StateBlock } from "@/components/common/states";
import { EventBadge, SentimentDot } from "@/components/stocks/badges";
import { timeAgo } from "@/lib/stocks/format";
import { compileMatchers, stockKeywords, titleMatches } from "@/lib/news/matching";
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

function ArticleRow({
  a,
  match,
}: {
  a: WireArticle;
  match?: { ticker: string; base: string };
}) {
  return (
    <li className="flex items-start gap-1 border-b border-border/50 py-2 last:border-0">
      <span className="mt-1.5 shrink-0">
        <SentimentDot score={a.sentiment_score} className="mr-2" />
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
          {match && (
            <Link
              to="/stocks/$ticker"
              params={{ ticker: match.ticker }}
              title={`Open ${match.ticker}`}
              className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-primary hover:bg-primary/20"
            >
              {match.base}
            </Link>
          )}
        </p>
      </div>
    </li>
  );
}

/** The most-covered rail — the same ranked markup as Home's rail. */
function HeatRail({ heat }: { heat: HeatItem[] }) {
  return (
    <Panel variant="plain" padding="md" role="region" aria-label="Most covered companies, last 24 hours">
      <PanelHeader>
        <PanelTitle>Most covered · 24h</PanelTitle>
        <Flame className="h-3.5 w-3.5 text-primary" aria-hidden />
      </PanelHeader>
      <ul>
        {heat.map((h, i) => (
          <li
            key={h.ticker}
            className="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-0"
          >
            <span className="num w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Link
              to="/stocks/$ticker"
              params={{ ticker: h.ticker }}
              title={`${h.name} — ${h.count24h} stories in 24h${h.surging && h.surgeRatio != null ? `, surging ${h.surgeRatio.toFixed(1)}×` : ""}${h.tilt ? `, 7-day tilt ${h.tilt}` : ""}`}
              className="font-mono text-[12px] font-bold text-foreground hover:underline"
            >
              {h.ticker.replace(/\.(JO|NSE|NGX|GSE|DSE|USE|LUSE|ZSE|BSE|MSE|SEM|VFEX)$/, "")}
            </Link>
            {h.tilt === "positive" && (
              <span className="text-success" aria-label="positive tilt">
                ▲
              </span>
            )}
            {h.tilt === "negative" && (
              <span className="text-destructive" aria-label="negative tilt">
                ▼
              </span>
            )}
            {h.tilt === "mixed" && (
              <span className="text-muted-foreground" aria-label="mixed tilt">
                ◆
              </span>
            )}
            <span className="num ml-auto font-mono text-[12px] text-muted-foreground">
              {h.count24h}
            </span>
            {h.surging && h.surgeRatio != null && (
              <span className="num font-mono text-[11px] font-bold text-primary">
                {h.surgeRatio.toFixed(1)}×
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
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

  // Headline→ticker chips: match each story against the companies the
  // wire itself is already tracking (the heat set), using the exact
  // matcher engine the server signals use — lib/news/matching is shared.
  const heatMatchers = useMemo(
    () =>
      (data?.heat ?? []).map((h) => ({
        ticker: h.ticker,
        base: h.ticker.split(".")[0],
        matchers: compileMatchers(stockKeywords(h.name)),
      })),
    [data],
  );
  const matchFor = (title: string) =>
    heatMatchers.find((h) => titleMatches(title, h.matchers));

  const hasHeat = !!data && data.heat.length > 0;
  const folioLine =
    active === "all"
      ? `The wire — ${articles.length} stories · 48h`
      : desk
        ? `${desk.label} — ${desk.count24h} in 24h · ${
            desk.surging && desk.surgeRatio != null
              ? `${desk.surgeRatio.toFixed(1)}× pace`
              : `baseline ${desk.medianDaily}/day`
          }`
        : "The wire";

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="NEWS · The wire"
          title="News Desk"
          description="Newest market-moving headlines across the pipeline, cut into topic desks that flag when a desk's story rate surges past its own baseline."
        />

        {/* Desk chips — the section index, in the one Chip dialect */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="News desks">
          <Chip
            role="tab"
            aria-selected={active === "all"}
            active={active === "all"}
            onClick={() => setActive("all")}
          >
            All wire
            <span className={cn("font-bold", active === "all" ? "" : "text-foreground")}>
              {data?.articles.length ?? "—"}
            </span>
          </Chip>
          {data?.desks.map((d) => (
            <Chip
              key={d.id}
              role="tab"
              aria-selected={active === d.id}
              active={active === d.id}
              onClick={() => setActive(d.id)}
              title={`${d.hint} — ${d.count24h} stories in 24h (baseline ${d.medianDaily}/day)`}
            >
              {d.surging && <Flame className="h-3 w-3 text-primary" aria-hidden />}
              {d.label}
              <span className={cn("font-bold", active === d.id ? "" : "text-foreground")}>
                {d.count24h}
              </span>
            </Chip>
          ))}
        </div>
        {desk ? (
          <p className="mb-3 text-xs text-muted-foreground">
            {desk.hint} — {desk.count24h} stories in 24h vs {desk.medianDaily}/day baseline
            {desk.surging && desk.surgeRatio != null && (
              <span className="ml-1 font-bold text-primary">
                · surging {desk.surgeRatio.toFixed(1)}×
              </span>
            )}
          </p>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            Newest headlines across the pipeline. A flame on a desk means its story rate is surging past its own 30-day baseline.
          </p>
        )}

        {error && data && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="grid items-start gap-3 lg:grid-cols-3">
          <div className={hasHeat ? "lg:col-span-2" : "lg:col-span-3"}>
            {!data ? (
              error ? (
                <StateBlock tone="error" message={error} />
              ) : (
                <Panel variant="folio" padding="md" role="region" aria-label="Loading the wire">
                  <SkeletonRows rows={6} />
                </Panel>
              )
            ) : articles.length === 0 ? (
              <StateBlock
                tone="empty"
                message={
                  active === "all"
                    ? "No stories in the last 48 hours — the pipeline may be between cycles."
                    : "No stories on this desk in the last 48 hours."
                }
              />
            ) : (
              <Panel variant="folio" padding="md" role="region" aria-label="News wire">
                <PanelHeader>
                  <PanelTitle>{folioLine}</PanelTitle>
                </PanelHeader>
                <ul>
                  {articles.map((a) => (
                    <ArticleRow key={a.id} a={a} match={matchFor(a.title)} />
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          {hasHeat && <HeatRail heat={data.heat} />}
        </div>

        <p className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <ExternalLink className="h-3 w-3" aria-hidden />
          Headlines link out to the outlet. Scores are pipeline VADER; hollow dots are not scored yet.
        </p>
      </PageContainer>
    </TerminalShell>
  );
}
