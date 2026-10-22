import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Flame, Search, Star } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { SkeletonRows, StateBlock } from "@/components/common/states";
import { BoardRowBadge, EventBadge, SentimentDot } from "@/components/stocks/badges";
import { ChangeCell } from "@/components/stocks/change";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/table";
import { EXCHANGES, LIVE_EXCHANGES, type Exchange } from "@/lib/stocks/exchanges";
import { fmtCompactValue, fmtPrice, timeAgo } from "@/lib/stocks/format";
import { compileMatchers, stockKeywords, titleMatches } from "@/lib/news/matching";
import { classifyHeadline } from "@/lib/news/events";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "The Soko Wire — Soko Stock" },
      {
        name: "description",
        content:
          "Follow stock prices on twelve African exchanges — Johannesburg, Nairobi, Lagos and nine more — practise trading with virtual cash, and read the news moving each market.",
      },
      { property: "og:title", content: "The Soko Wire — Soko Stock" },
    ],
  }),
  component: StocksBoard,
});

interface BoardRow {
  ticker: string;
  name: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  /** Value traded in display currency (EOD table for AF, price×volume for JSE). */
  value: number | null;
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
  /** Liquidity tier within this board (value-traded quartiles). */
  liquidity: "liquid" | "active" | "thin";
  /** ≥5% move on a thin counter with no news surge behind it. */
  speculation: boolean;
  asOf: string;
}

interface BoardResponse {
  ok: boolean;
  exchange: string;
  currencySymbol: string;
  timeNote: string;
  rows: BoardRow[];
}

type SortKey = "name" | "price" | "changePercent" | "value";

/* ── News wire (same endpoint and shapes as the News Desk) ─────────────── */

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

function StocksBoard() {
  const [exchangeId, setExchangeId] = useState("JSE");
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const { ids: watched, toggle } = useWatchlist();
  const [wire, setWire] = useState<WireResponse | null>(null);
  const [wireFailed, setWireFailed] = useState(false);

  const exchange: Exchange = EXCHANGES.find((e) => e.id === exchangeId) ?? EXCHANGES[0];

  useEffect(() => {
    if (exchange.status !== "live") {
      setBoard(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = () => {
      fetch(`/api/stocks/board?exchange=${exchangeId}`)
        .then((r) => {
          if (!r.ok) throw new Error(`board ${r.status}`);
          return r.json();
        })
        .then((j) => {
          if (!cancelled) {
            setBoard(j as BoardResponse);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("Board unreachable — retrying shortly.");
            setLoading(false);
          }
        });
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [exchangeId, exchange.status]);

  // The lead-story block reads the same wire as the News Desk. It is an
  // enrichment: if the wire fails, the block hides and the board stands.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/stocks/news-wire")
        .then((r) => r.json())
        .then((d: WireResponse) => {
          if (cancelled) return;
          if (d.ok) {
            setWire(d);
            setWireFailed(false);
          } else setWireFailed(true);
        })
        .catch(() => {
          if (!cancelled) setWireFailed(true);
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

  const rows = useMemo(() => {
    const list = board?.rows ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (r) => r.name.toLowerCase().includes(q) || r.ticker.toLowerCase().includes(q),
        )
      : list;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      if (typeof av === "string") return sortDir * av.localeCompare(bv as string);
      return sortDir * ((av as number) - (bv as number));
    });
    return sorted;
  }, [board, query, sortKey, sortDir]);

  const movers = useMemo(() => {
    const list = (board?.rows ?? []).filter((r) => r.changePercent != null);
    const active = (board?.rows ?? [])
      .filter((r) => r.value != null && r.value > 0)
      .sort((a, b) => (b.value as number) - (a.value as number))
      .slice(0, 3);
    return {
      gainers: [...list].sort((a, b) => b.changePercent! - a.changePercent!).slice(0, 3),
      losers: [...list].sort((a, b) => a.changePercent! - b.changePercent!).slice(0, 3),
      active,
    };
  }, [board]);

  /** Advancers / decliners / unchanged across the board in view. */
  const breadth = useMemo(() => {
    let adv = 0;
    let dec = 0;
    let flat = 0;
    for (const r of board?.rows ?? []) {
      if (r.changePercent == null) continue;
      if (r.changePercent > 0) adv++;
      else if (r.changePercent < 0) dec++;
      else flat++;
    }
    return { adv, dec, flat, counted: adv + dec + flat };
  }, [board]);

  // The lead is an editorial pick, not just the newest story: the first
  // wire article that names a company the wire is tracking (the heat
  // set, matched with the shared engine) or carries a classified market
  // event. Falls back to the newest story when nothing qualifies, so
  // the front page never renders empty.
  const leadPick = useMemo(() => {
    const arts = wire?.articles ?? [];
    if (arts.length === 0) return { lead: null, secondary: [] as typeof arts };
    const matchers = (wire?.heat ?? []).map((h) =>
      compileMatchers(stockKeywords(h.name)),
    );
    const qualifies = (title: string) =>
      matchers.some((m) => titleMatches(title, m)) ||
      classifyHeadline(title) != null;
    const idx = arts.findIndex((a) => qualifies(a.title));
    const leadIdx = idx >= 0 ? idx : 0;
    return {
      lead: arts[leadIdx],
      secondary: arts.filter((_, i) => i !== leadIdx).slice(0, 3),
    };
  }, [wire]);
  const { lead, secondary } = leadPick;
  const leadDesk = lead
    ? wire?.desks.find((d) => d.articles.some((a) => a.id === lead.id))
    : undefined;
  const surgingDesks = wire?.desks.filter((d) => d.surging && d.surgeRatio != null) ?? [];

  const flipSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? 1 : -1);
    }
  };

  // Browse-by-topic: the desks ride the same wire payload the lead
  // block already fetched — chips switch the article list below the board.
  const [deskId, setDeskId] = useState("all");
  const activeDesk = wire?.desks.find((d) => d.id === deskId) ?? null;
  const deskArticles =
    deskId === "all" ? (wire?.articles ?? []) : (activeDesk?.articles ?? []);
  const heatMatchers = useMemo(
    () =>
      (wire?.heat ?? []).map((h) => ({
        ticker: h.ticker,
        base: h.ticker.split(".")[0],
        matchers: compileMatchers(stockKeywords(h.name)),
      })),
    [wire],
  );
  const matchFor = (title: string) =>
    heatMatchers.find((h) => titleMatches(title, h.matchers));
  const folioLine =
    deskId === "all"
      ? `The wire — ${deskArticles.length} stories · 48h`
      : activeDesk
        ? `${activeDesk.label} — ${activeDesk.count24h} in 24h${
            activeDesk.surging && activeDesk.surgeRatio != null
              ? ` · ${activeDesk.surgeRatio.toFixed(1)}× the usual rate`
              : activeDesk.medianDaily > 0
                ? ` · usually ${activeDesk.medianDaily}/day`
                : ""
          }`
        : "The wire";

  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const slugParts = [
    `STK · ${today}`,
    `${LIVE_EXCHANGES.length} exchanges live`,
  ];
  if (board && breadth.counted > 0) {
    slugParts.push(
      `${exchange.shortName}: ${breadth.adv} up · ${breadth.dec} down · ${breadth.flat} unchanged`,
    );
  }

  const sortMark = (k: SortKey) =>
    sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "";

  const sortHeader = (label: string, k: SortKey) => (
    <button
      type="button"
      onClick={() => flipSort(k)}
      className="uppercase tracking-[inherit] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {label}
      {sortMark(k)}
    </button>
  );

  const columns: DataTableColumn<BoardRow>[] = [
    {
      key: "watch",
      header: <span className="sr-only">Watch</span>,
      align: "center",
      headerClassName: "w-10",
      cellClassName: "w-10",
      render: (r) => (
        <button
          onClick={() => toggle(r.ticker)}
          aria-label={watched.includes(r.ticker) ? "Unwatch" : "Watch"}
          aria-pressed={watched.includes(r.ticker)}
          className={cn(
            "rounded p-1 transition-colors",
            watched.includes(r.ticker)
              ? "text-primary"
              : "text-muted-foreground/50 hover:text-primary",
          )}
        >
          <Star
            className="h-4 w-4"
            fill={watched.includes(r.ticker) ? "currentColor" : "none"}
            aria-hidden
          />
        </button>
      ),
    },
    {
      key: "name",
      header: sortHeader("Company", "name"),
      cellClassName: "max-w-[180px] truncate sm:max-w-none",
      render: (r) => (
        <>
          <Link
            to="/stocks/$ticker"
            params={{ ticker: r.ticker }}
            className="font-medium hover:text-success hover:underline"
          >
            {r.name}
          </Link>
          <BoardRowBadge row={r} />
        </>
      ),
    },
    {
      key: "ticker",
      header: "Ticker",
      headerClassName: "hidden sm:table-cell",
      cellClassName: "hidden font-mono text-[11px] text-muted-foreground sm:table-cell",
      render: (r) => r.ticker,
    },
    {
      key: "price",
      header: sortHeader("Price", "price"),
      numeric: true,
      cellClassName: "font-semibold",
      render: (r) => fmtPrice(r.price, board?.currencySymbol ?? ""),
    },
    {
      key: "change",
      header: sortHeader("24h", "changePercent"),
      numeric: true,
      render: (r) => <ChangeCell value={r.changePercent} />,
    },
    {
      key: "value",
      header: sortHeader("Value", "value"),
      numeric: true,
      headerClassName: "hidden md:table-cell",
      cellClassName: "hidden text-[12px] text-muted-foreground md:table-cell",
      render: (r) =>
        r.value != null ? fmtCompactValue(r.value, board?.currencySymbol ?? "") : "—",
    },
  ];

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug={slugParts.join(" · ")}
          title="The Soko Wire"
          description="Prices from twelve African stock exchanges on one page. Johannesburg updates through the day, about 15 minutes behind the market. The other eleven update once a day, after each exchange closes. Tap any company to see its prices and the news that mentions it."
        />

        {/* Lead story + most-covered rail, from the news wire. Enrichment
            only: a failed wire hides the block; the board still renders. */}
        {!wireFailed &&
          (wire == null ? (
            <Panel variant="folio" padding="md" className="mb-5" aria-label="Loading top stories">
              <SkeletonRows rows={4} />
            </Panel>
          ) : lead ? (
            <section aria-label="Top stories" className="mb-5 grid gap-3 lg:grid-cols-3">
              <Panel variant="folio" padding="md" className="lg:col-span-2">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  <span className="text-primary">The lead</span>
                  {leadDesk ? ` · ${leadDesk.label}` : " · The wire"}
                </p>
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-display mt-2 block text-[28px] font-semibold leading-tight tracking-tight text-foreground underline-offset-4 hover:underline"
                >
                  {lead.title}
                </a>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  <SentimentDot score={lead.sentiment_score} />
                  <span>
                    {lead.source} · {timeAgo(lead.published_at)}
                  </span>
                  <EventBadge title={lead.title} />
                </p>
                {secondary.length > 0 && (
                  <ul className="mt-4 border-t border-border/60">
                    {secondary.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-1 border-b border-border/50 py-2 last:border-0"
                      >
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
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  The coloured dot shows whether coverage of a story reads mostly
                  positive (green) or negative (red); a hollow dot means the story
                  has not been scored yet.
                </p>
              </Panel>

              <Panel variant="plain" padding="md">
                <PanelHeader>
                  <PanelTitle>Most covered · 24h</PanelTitle>
                  <Flame className="h-3.5 w-3.5 text-primary" aria-hidden />
                </PanelHeader>
                {wire.heat.length > 0 ? (
                  <ul>
                    {wire.heat.map((h, i) => (
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
                          title={h.name}
                          className="font-mono text-[12px] font-bold text-foreground hover:underline"
                        >
                          {h.ticker.replace(
                            /\.(JO|NSE|NGX|GSE|DSE|USE|LUSE|ZSE|BSE|MSE|SEM|VFEX)$/,
                            "",
                          )}
                        </Link>
                        {h.tilt === "positive" && (
                          <span className="text-success" aria-label="mostly positive coverage in the last 7 days">
                            ▲
                          </span>
                        )}
                        {h.tilt === "negative" && (
                          <span className="text-destructive" aria-label="mostly negative coverage in the last 7 days">
                            ▼
                          </span>
                        )}
                        {h.tilt === "mixed" && (
                          <span className="text-muted-foreground" aria-label="mixed coverage in the last 7 days">
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
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    No listed company coverage in the last 24 hours.
                  </p>
                )}
                {surgingDesks.length > 0 && (
                  <div className="mt-4 space-y-1 border-t border-border/60 pt-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Topics heating up
                    </p>
                    {surgingDesks.map((d) => (
                      <p
                        key={d.id}
                        className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-muted-foreground"
                      >
                        <span className="uppercase tracking-[0.12em]">{d.label}</span>
                        <span className="num shrink-0">
                          {d.count24h} stories in 24h ·{" "}
                          <span className="font-bold text-primary">
                            {(d.surgeRatio as number).toFixed(1)}× the usual rate
                          </span>
                        </span>
                      </p>
                    ))}
                    <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                      3.2× means 3.2 times the usual number of stories per day.
                    </p>
                  </div>
                )}
              </Panel>
            </section>
          ) : null)}

        {/* Exchange switcher — the one Chip dialect, state printed on the chip */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Exchanges">
          {EXCHANGES.map((e) => (
            <Chip
              key={e.id}
              role="tab"
              aria-selected={exchangeId === e.id}
              active={exchangeId === e.id}
              size="sm"
              onClick={() => setExchangeId(e.id)}
            >
              {e.shortName}
              <span className="text-[9px] opacity-70">
                {e.status === "soon" ? "Soon" : e.source === "yahoo" ? "Live" : "End of day"}
              </span>
            </Chip>
          ))}
        </div>

        {exchange.status !== "live" ? (
          <StateBlock
            tone="empty"
            title={exchange.name}
            message="We are still looking for a reliable free price feed for this exchange. The board will appear here as soon as we find one. Nothing on this page is estimated or filled in by hand."
            className="mt-6"
          />
        ) : (
          <>
            {/* Session strip for the selected exchange */}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-border/60 py-2.5">
              <h2 className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground">
                {exchange.name}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {exchange.country} ·{" "}
                {exchange.source === "yahoo" ? "Live · delayed" : "End of day"} ·{" "}
                {board ? `${board.rows.length} listed · ${board.timeNote}` : exchange.timeNote}
              </span>
              <div className="relative ml-auto w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search stocks…"
                  aria-label="Search stocks"
                  className="pl-8"
                />
              </div>
            </div>

            {/* Movers — ranked ledger rows */}
            {!loading && !error && movers.gainers.length > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Panel variant="plain" padding="sm">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-success">
                    Top gainers
                  </p>
                  <ul className="mt-1">
                    {movers.gainers.map((r, i) => (
                      <li
                        key={r.ticker}
                        className="flex items-baseline gap-2 border-b border-border/40 py-1.5 text-sm last:border-0"
                      >
                        <span className="num shrink-0 font-mono text-[10px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: r.ticker }}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {r.name}
                        </Link>
                        <ChangeCell value={r.changePercent} />
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel variant="plain" padding="sm">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-destructive">
                    Top losers
                  </p>
                  <ul className="mt-1">
                    {movers.losers.map((r, i) => (
                      <li
                        key={r.ticker}
                        className="flex items-baseline gap-2 border-b border-border/40 py-1.5 text-sm last:border-0"
                      >
                        <span className="num shrink-0 font-mono text-[10px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: r.ticker }}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {r.name}
                        </Link>
                        <ChangeCell value={r.changePercent} />
                      </li>
                    ))}
                  </ul>
                </Panel>
                {movers.active.length > 0 && (
                  <Panel variant="plain" padding="sm" className="sm:col-span-2 lg:col-span-1">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Most active · value traded
                    </p>
                    <ul className="mt-1">
                      {movers.active.map((r, i) => (
                        <li
                          key={r.ticker}
                          className="flex items-baseline gap-2 border-b border-border/40 py-1.5 text-sm last:border-0"
                        >
                          <span className="num shrink-0 font-mono text-[10px] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Link
                            to="/stocks/$ticker"
                            params={{ ticker: r.ticker }}
                            className="min-w-0 flex-1 truncate hover:underline"
                          >
                            {r.name}
                          </Link>
                          <span className="num shrink-0 font-mono text-[12px] font-semibold text-muted-foreground">
                            {fmtCompactValue(r.value as number, board?.currencySymbol ?? "")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
            )}

            {/* The Continental Board — a ruled ledger */}
            <div className="mt-3">
              {error && !loading ? (
                <StateBlock tone="error" title={exchange.name} message={error} />
              ) : (
                <Panel variant="plain" padding="none" className="overflow-hidden">
                  <DataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(r) => r.ticker}
                    loading={loading}
                    skeletonRows={8}
                    emptyState={
                      query
                        ? `No stocks match "${query}".`
                        : "No quotes right now — check back shortly."
                    }
                  />
                </Panel>
              )}
            </div>
          </>
        )}

        {/* Browse the wire by topic — the desks (Africa, World, and the
            market desks), riding the same wire payload as the lead. */}
        {wire && !wireFailed && (
          <section aria-label="Browse the wire by topic" className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
              <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 shrink-0 bg-primary" aria-hidden />
                Browse the wire by topic
              </p>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="News desks">
              <Chip
                role="tab"
                aria-selected={deskId === "all"}
                active={deskId === "all"}
                onClick={() => setDeskId("all")}
              >
                All wire
                <span className={cn("font-bold", deskId === "all" ? "" : "text-foreground")}>
                  {wire.articles.length}
                </span>
              </Chip>
              {wire.desks.map((d) => (
                <Chip
                  key={d.id}
                  role="tab"
                  aria-selected={deskId === d.id}
                  active={deskId === d.id}
                  onClick={() => setDeskId(d.id)}
                  title={
                    d.medianDaily > 0
                      ? `${d.hint} — ${d.count24h} stories in 24h (usually ${d.medianDaily}/day)`
                      : `${d.hint} — ${d.count24h} stories in 24h`
                  }
                >
                  {d.surging && <Flame className="h-3 w-3 text-primary" aria-hidden />}
                  {d.label}
                  <span className={cn("font-bold", deskId === d.id ? "" : "text-foreground")}>
                    {d.count24h}
                  </span>
                </Chip>
              ))}
            </div>
            {activeDesk ? (
              <p className="mb-3 text-xs text-muted-foreground">
                {activeDesk.hint} — {activeDesk.count24h} stories in 24h
                {activeDesk.medianDaily > 0 && <> · usually {activeDesk.medianDaily}/day</>}
                {activeDesk.surging && activeDesk.surgeRatio != null && (
                  <span className="ml-1 font-bold text-primary">
                    · surging {activeDesk.surgeRatio.toFixed(1)}×
                  </span>
                )}
              </p>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">
                Newest headlines first. A flame next to a topic means it is getting far
                more stories than usual — 3.2× means 3.2 times the usual number of
                stories per day.
              </p>
            )}
            {deskArticles.length === 0 ? (
              <StateBlock
                tone="empty"
                message={
                  deskId === "all"
                    ? "No stories in the last 48 hours. Check back in a few minutes — new headlines arrive through the day."
                    : "No stories on this desk in the last 48 hours."
                }
              />
            ) : (
              <Panel variant="folio" padding="md" role="region" aria-label="News wire">
                <PanelHeader>
                  <PanelTitle>{folioLine}</PanelTitle>
                </PanelHeader>
                <ul>
                  {deskArticles.map((a) => {
                    const match = matchFor(a.title);
                    return (
                      <li
                        key={a.id}
                        className="flex items-start gap-1 border-b border-border/50 py-2 last:border-0"
                      >
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
                  })}
                </ul>
              </Panel>
            )}
            <p className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <ExternalLink className="h-3 w-3" aria-hidden />
              Headlines open at the outlet that published them.
            </p>
          </section>
        )}
      </PageContainer>
    </TerminalShell>
  );
}
