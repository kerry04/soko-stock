import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, SlidersHorizontal } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { LimitChip } from "@/components/stocks/badges";
import { fmtPrice } from "@/lib/stocks/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Screener — Soko Stock" },
      {
        name: "description",
        content:
          "Scan African equities by live signal: 52-week zones, RSI extremes, unusual volume, news surges.",
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

function Change({ v }: { v: number | null }) {
  if (v == null)
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden /> —
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[12px] font-semibold",
        v > 0 ? "text-success" : v < 0 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {v > 0 ? (
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      ) : v < 0 ? (
        <ArrowDownRight className="h-3 w-3" aria-hidden />
      ) : (
        <Minus className="h-3 w-3" aria-hidden />
      )}
      {v > 0 ? "+" : ""}
      {v.toFixed(2)}%
    </span>
  );
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

  return (
    <TerminalShell>
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.1em]">
            Screener <span className="text-muted-foreground">· signal scans</span>
          </h1>
        </div>

        {/* Screen chips */}
        <div className="mb-2 flex flex-wrap items-center gap-2" role="tablist" aria-label="Screens">
          {data?.screens.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={active === s.id}
              onClick={() => setActive(s.id)}
              title={s.hint}
              className={cn(
                "rounded border px-3 py-1.5 font-mono text-xs",
                active === s.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              <span
                className={cn(
                  "ml-1.5 font-bold",
                  active === s.id ? "text-background" : "text-foreground",
                )}
              >
                {s.count}
              </span>
            </button>
          ))}
        </div>
        {activeDef && <p className="mb-3 text-xs text-muted-foreground">{activeDef.hint}</p>}

        {/* Search */}
        <div className="mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or ticker…"
            className="w-full max-w-sm rounded border border-border bg-card px-3 py-1.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {data?.failedExchanges.length ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Feed unreachable for {data.failedExchanges.join(", ")} — excluded from this scan.
          </p>
        ) : null}

        {!data ? (
          <p className="font-mono text-sm text-muted-foreground">Scanning…</p>
        ) : rows.length === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">
            Nothing matches this screen right now. Markets are quiet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full min-w-[760px] border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Exch</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Day %</th>
                  <th className="px-3 py-2">52wk range</th>
                  <th className="px-3 py-2 text-right">RSI</th>
                  <th className="px-3 py-2 text-right">Rel vol</th>
                  <th className="px-3 py-2 text-right">News</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pos = wk52Pos(r);
                  return (
                    <tr key={`${r.exchange}:${r.ticker}`} className="border-b border-border/50 hover:bg-card">
                      <td className="px-3 py-2">
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: r.ticker }}
                          className="font-bold text-foreground underline-offset-2 hover:underline"
                        >
                          {r.ticker.replace(/\.JO$/, "")}
                        </Link>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground">{r.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.exchange}</td>
                      <td className="px-3 py-2 text-right">{fmtPrice(r.price, r.currencySymbol)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <Change v={r.changePercent} />
                          {r.limitHit && <LimitChip hit={r.limitHit} />}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {pos == null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded bg-muted">
                              <div
                                className={cn("h-full", pos >= 99 ? "bg-amber-500" : pos <= 1 ? "bg-red-500" : "bg-sky-500")}
                                style={{ width: `${pos}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{pos.toFixed(0)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.rsi == null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className={cn(r.rsi <= 30 ? "text-sky-400" : r.rsi >= 70 ? "text-red-400" : "")}>
                            {r.rsi.toFixed(0)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.relVolume == null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className={cn(r.relVolume >= 2 && "font-bold text-amber-500")}>
                            {r.relVolume.toFixed(1)}×
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.newsSurge == null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="font-bold text-sky-400">{r.newsSurge.toFixed(1)}×</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Technicals (RSI, 52-week, volume) need price history — JSE today. EOD listings (NSE/NGX/GSE)
          match day-move and news screens only until daily snapshots accumulate.
        </p>
      </div>
    </TerminalShell>
  );
}
