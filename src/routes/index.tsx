import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Search, Star } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { EXCHANGES, type Exchange } from "@/lib/stocks/exchanges";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Soko Stock — African Stock Terminal" },
      {
        name: "description",
        content:
          "Live African stock boards — Johannesburg, Nairobi, Lagos — wired to global news signals.",
      },
      { property: "og:title", content: "Soko Stock — African Stock Terminal" },
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
  asOf: string;
}

interface BoardResponse {
  ok: boolean;
  exchange: string;
  currencySymbol: string;
  timeNote: string;
  rows: BoardRow[];
}

type SortKey = "name" | "price" | "changePercent";

function fmtPrice(v: number, sym: string): string {
  return `${sym}${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null)
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden /> —
      </span>
    );
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 font-mono text-[12px] font-semibold",
        up ? "text-success" : flat ? "text-muted-foreground" : "text-red-500",
      )}
    >
      {up ? (
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      ) : flat ? (
        <Minus className="h-3 w-3" aria-hidden />
      ) : (
        <ArrowDownRight className="h-3 w-3" aria-hidden />
      )}
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
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
    return {
      gainers: [...list].sort((a, b) => b.changePercent! - a.changePercent!).slice(0, 3),
      losers: [...list].sort((a, b) => a.changePercent! - b.changePercent!).slice(0, 3),
    };
  }, [board]);

  const flipSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? 1 : -1);
    }
  };

  return (
    <TerminalShell>
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5">
        {/* Exchange tabs */}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Exchanges">
          {EXCHANGES.map((e) => (
            <button
              key={e.id}
              role="tab"
              aria-selected={exchangeId === e.id}
              onClick={() => setExchangeId(e.id)}
              className={cn(
                "rounded-lg border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors",
                exchangeId === e.id
                  ? "border-success/60 bg-success/10 text-success"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {e.shortName}
              {e.status === "soon" && (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                  soon
                </span>
              )}
            </button>
          ))}
        </div>

        {exchange.status !== "live" ? (
          <div className="mt-6 rounded-xl border border-border/70 bg-card/40 p-8 text-center">
            <p className="font-mono text-sm font-bold uppercase tracking-[0.18em]">
              {exchange.name}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              No free, machine-readable price feed exists for this exchange yet. We're
              tracking the search — the board goes live the moment a reliable free
              source appears. Nothing here is estimated or filled in.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-sm font-bold uppercase tracking-[0.18em]">
                {exchange.name}
              </h1>
              {board && (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {board.rows.length} listed · {board.timeNote}
                </span>
              )}
              <div className="relative ml-auto w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search stocks…"
                  aria-label="Search stocks"
                  className="h-9 w-full rounded-md border border-border/70 bg-card/40 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-success/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Movers strip */}
            {!loading && !error && movers.gainers.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
                    Top gainers
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {movers.gainers.map((r) => (
                      <li key={r.ticker} className="flex items-center justify-between text-sm">
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: r.ticker }}
                          className="truncate hover:underline"
                        >
                          {r.name}
                        </Link>
                        <ChangeBadge pct={r.changePercent} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-500">
                    Top losers
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {movers.losers.map((r) => (
                      <li key={r.ticker} className="flex items-center justify-between text-sm">
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: r.ticker }}
                          className="truncate hover:underline"
                        >
                          {r.name}
                        </Link>
                        <ChangeBadge pct={r.changePercent} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Board table */}
            <div className="mt-3 overflow-hidden rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-card/60 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <th className="w-10 px-2 py-2.5" aria-label="Watch" />
                    <th className="px-3 py-2.5 text-left">
                      <button onClick={() => flipSort("name")} className="hover:text-foreground">
                        Company {sortKey === "name" && (sortDir === 1 ? "▲" : "▼")}
                      </button>
                    </th>
                    <th className="hidden px-3 py-2.5 text-left sm:table-cell">Ticker</th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => flipSort("price")} className="hover:text-foreground">
                        Price {sortKey === "price" && (sortDir === 1 ? "▲" : "▼")}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => flipSort("changePercent")}
                        className="hover:text-foreground"
                      >
                        24h {sortKey === "changePercent" && (sortDir === 1 ? "▲" : "▼")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="h-4 animate-pulse rounded bg-muted/60" />
                        </td>
                      </tr>
                    ))}
                  {!loading &&
                    rows.map((r) => (
                      <tr
                        key={r.ticker}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-card/60"
                      >
                        <td className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => toggle(r.ticker)}
                            aria-label={watched.includes(r.ticker) ? "Unwatch" : "Watch"}
                            aria-pressed={watched.includes(r.ticker)}
                            className={cn(
                              "rounded p-1",
                              watched.includes(r.ticker)
                                ? "text-amber-400"
                                : "text-muted-foreground/50 hover:text-amber-400",
                            )}
                          >
                            <Star
                              className="h-4 w-4"
                              fill={watched.includes(r.ticker) ? "currentColor" : "none"}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 sm:max-w-none">
                          <Link
                            to="/stocks/$ticker"
                            params={{ ticker: r.ticker }}
                            className="font-medium hover:text-success hover:underline"
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="hidden px-3 py-2.5 font-mono text-[11px] text-muted-foreground sm:table-cell">
                          {r.ticker}
                        </td>
                        <td className="num px-3 py-2.5 text-right font-mono font-semibold">
                          {fmtPrice(r.price, board?.currencySymbol ?? "")}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ChangeBadge pct={r.changePercent} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!loading && !error && rows.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {query ? `No stocks match "${query}".` : "No quotes right now — check back shortly."}
                </p>
              )}
              {!loading && error && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">{error}</p>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Educational terminal — not investment advice.
            </p>
          </>
        )}
      </div>
    </TerminalShell>
  );
}
