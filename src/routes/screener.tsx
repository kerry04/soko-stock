import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/table";
import { StateBlock } from "@/components/common/states";
import { LimitChip, NewsSurgeChip } from "@/components/stocks/badges";
import { ChangeCell } from "@/components/stocks/change";
import { fmtPrice } from "@/lib/stocks/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Screener — Soko Stock" },
      {
        name: "description",
        content:
          "Filter African stocks by what they did today: biggest gains and losses, prices near a one-year high or low, and shares in the news far more than usual.",
      },
    ],
  }),
  component: ScreenerPage,
});

type ScreenId =
  | "gainers"
  | "losers"
  | "limit-hits"
  | "52wk-high"
  | "52wk-low"
  | "rsi-oversold"
  | "rsi-overbought"
  | "volume-surge"
  | "news-surge"
  | "uptrend"
  | "downtrend";

interface ScreenerRow {
  ticker: string;
  name: string;
  exchange: string;
  currencySymbol: string;
  price: number;
  changePercent: number | null;
  wk52High: number | null;
  wk52Low: number | null;
  rsi: number | null;
  relVolume: number | null;
  newsSurge: number | null;
  limitHit: "up" | "down" | null;
  screens: ScreenId[];
  asOf: string;
}

interface ScreenInfo {
  id: ScreenId;
  label: string;
  hint: string;
  count: number;
}

interface ScreenerResponse {
  ok: boolean;
  rows: ScreenerRow[];
  screens: ScreenInfo[];
  failedExchanges: string[];
}

/** 0–100 position of price between its 52-week low and high. Null without history. */
function wk52Pos(r: ScreenerRow): number | null {
  if (r.wk52High == null || r.wk52Low == null || r.wk52High <= r.wk52Low) return null;
  return Math.max(0, Math.min(100, ((r.price - r.wk52Low) / (r.wk52High - r.wk52Low)) * 100));
}

function ScreenerPage() {
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [active, setActive] = useState<ScreenId>("news-surge");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/stocks/screener")
        .then((r) => r.json())
        .then((d: ScreenerResponse) => {
          if (cancelled) return;
          if (d.ok) {
            setData(d);
            setError(null);
          } else setError("Screener unavailable — retrying shortly.");
        })
        .catch(() => {
          if (!cancelled) setError("Screener unavailable — retrying shortly.");
        });
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => r.screens.includes(active))
      .filter((r) =>
        q ? r.name.toLowerCase().includes(q) || r.ticker.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));
  }, [data, active, query]);

  const activeDef = data?.screens.find((s) => s.id === active);

  const columns: DataTableColumn<ScreenerRow>[] = [
    {
      key: "ticker",
      header: "Ticker",
      render: (r) => (
        <Link
          to="/stocks/$ticker"
          params={{ ticker: r.ticker }}
          className="font-mono text-[13px] font-bold text-foreground underline-offset-2 hover:underline"
        >
          {r.ticker.replace(/\.JO$/, "")}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      cellClassName: "max-w-[220px]",
      render: (r) => <span className="block truncate text-muted-foreground">{r.name}</span>,
    },
    {
      key: "exchange",
      header: "Exchange",
      render: (r) => <span className="text-xs text-muted-foreground">{r.exchange}</span>,
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      render: (r) => fmtPrice(r.price, r.currencySymbol),
    },
    {
      key: "change",
      header: "Day %",
      numeric: true,
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <ChangeCell value={r.changePercent} />
          {r.limitHit && <LimitChip hit={r.limitHit} />}
        </span>
      ),
    },
    {
      key: "range52",
      header: "Position in 1-year range",
      render: (r) => {
        const pos = wk52Pos(r);
        if (pos == null) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded bg-muted">
              <div
                className={cn(
                  "h-full",
                  pos >= 99 ? "bg-success" : pos <= 1 ? "bg-destructive" : "bg-muted-foreground/50",
                )}
                style={{ width: `${pos}%` }}
              />
            </div>
            <span className="num font-mono text-xs text-muted-foreground">{pos.toFixed(0)}</span>
          </div>
        );
      },
    },
    {
      key: "rsi",
      header: "Momentum (RSI)",
      numeric: true,
      render: (r) =>
        r.rsi == null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className={cn(r.rsi <= 30 ? "text-success" : r.rsi >= 70 ? "text-destructive" : "")}>
            {r.rsi.toFixed(0)}
          </span>
        ),
    },
    {
      key: "relVolume",
      header: "Volume vs usual",
      numeric: true,
      render: (r) =>
        r.relVolume == null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className={cn(r.relVolume >= 2 && "font-bold text-primary")}>
            {r.relVolume.toFixed(1)}×
          </span>
        ),
    },
    {
      key: "newsSurge",
      header: "News",
      numeric: true,
      render: (r) =>
        r.newsSurge == null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <NewsSurgeChip ratio={r.newsSurge} withLabel={false} />
        ),
    },
  ];

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="SCRN · Signal scans"
          title="Screener"
          description="A screener filters every listed stock by a rule — biggest gainers, prices near a one-year high, unusually heavy trading — so you can find candidates without reading every board."
        />

        {/* Screen chips */}
        <div className="mb-2 flex flex-wrap items-center gap-2" aria-label="Screens">
          {data?.screens.map((s) => (
            <Chip
              key={s.id}
              active={active === s.id}
              onClick={() => setActive(s.id)}
              title={s.hint}
            >
              {s.label}
              <span className={cn("font-bold", active === s.id ? "" : "text-foreground")}>
                {s.count}
              </span>
            </Chip>
          ))}
        </div>
        {activeDef && <p className="mb-3 text-xs text-muted-foreground">{activeDef.hint}</p>}

        {/* Search */}
        <div className="mb-3 max-w-sm">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or ticker…"
            className="font-mono"
          />
        </div>

        {error && data && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {data?.failedExchanges.length ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Feed unreachable for {data.failedExchanges.join(", ")} — excluded from this scan.
          </p>
        ) : null}

        {error && !data ? (
          <StateBlock tone="error" message={error} />
        ) : (
          <Panel variant="plain" padding="none" className="overflow-hidden">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => `${r.exchange}:${r.ticker}`}
              loading={!data}
              skeletonRows={8}
              maxHeight="70vh"
              emptyState={
                query.trim()
                  ? `No matches for "${query.trim()}" on this screen.`
                  : "Nothing matches this screen right now. Markets are quiet."
              }
            />
          </Panel>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Some screens need months of daily prices. Today only Johannesburg has that
          history, so Nairobi, Lagos and Accra stocks appear only in the day-move and
          news screens. That will change as we record more daily prices.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          RSI is a momentum score from 0 to 100. Above 70 means the price has risen
          fast and far (&lsquo;overbought&rsquo;); under 30, fallen fast and far
          (&lsquo;oversold&rsquo;).
        </p>
      </PageContainer>
    </TerminalShell>
  );
}
