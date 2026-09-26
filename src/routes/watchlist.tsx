import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Star } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { LIVE_EXCHANGES } from "@/lib/stocks/exchanges";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — Soko Stock" },
      { name: "description", content: "Stocks you're watching on the Soko Stock terminal." },
    ],
  }),
  component: WatchlistPage,
});

interface BoardRow {
  ticker: string;
  name: string;
  price: number;
  changePercent: number | null;
}

/**
 * Watchlist: the stocks the user starred, stored locally on this device.
 * No account, works everywhere.
 */
function WatchlistPage() {
  const { ids, toggle } = useWatchlist();
  const [rows, setRows] = useState<(BoardRow & { currencySymbol: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const all: (BoardRow & { currencySymbol: string })[] = [];
      for (const ex of LIVE_EXCHANGES) {
        try {
          const res = await fetch(`/api/stocks/board?exchange=${ex.id}`);
          if (!res.ok) continue;
          const json = await res.json();
          for (const r of json.rows ?? []) {
            if (ids.includes(r.ticker)) {
              all.push({ ...r, currencySymbol: json.currencySymbol });
            }
          }
        } catch {
          /* one exchange failing shouldn't kill the watchlist */
        }
      }
      if (!cancelled) {
        // Prune tickers that no longer exist on any board.
        const found = new Set(all.map((r) => r.ticker));
        for (const id of ids) if (!found.has(id)) toggle(id);
        setRows(all);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, toggle]);

  return (
    <TerminalShell>
      <div className="mx-auto max-w-[900px] px-3 py-4 sm:px-5">
        <h1 className="font-mono text-sm font-bold uppercase tracking-[0.18em]">Watchlist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your starred stocks, saved on this device. No account needed.
        </p>

        {loading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-border/70 bg-card/40 p-8 text-center">
            <Star className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing watched yet. Tap the star on any stock to pin it here.
            </p>
            <Link
              to="/"
              className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-success hover:underline"
            >
              Browse boards →
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((r) => {
              const pct = r.changePercent;
              const up = (pct ?? 0) >= 0;
              return (
                <li
                  key={r.ticker}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3"
                >
                  <button
                    onClick={() => toggle(r.ticker)}
                    aria-label="Remove from watchlist"
                    className="rounded p-1 text-amber-400 hover:text-amber-300"
                  >
                    <Star className="h-4 w-4" fill="currentColor" aria-hidden />
                  </button>
                  <Link to="/stocks/$ticker" params={{ ticker: r.ticker }} className="min-w-0 flex-1">
                    <p className="truncate font-medium hover:underline">{r.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {r.ticker}
                    </p>
                  </Link>
                  <div className="text-right">
                    <p className="num font-mono text-sm font-semibold">
                      {r.currencySymbol}
                      {r.price.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p
                      className={cn(
                        "num inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold",
                        pct == null ? "text-muted-foreground" : up ? "text-success" : "text-red-500",
                      )}
                    >
                      {pct == null ? (
                        <Minus className="h-3 w-3" aria-hidden />
                      ) : up ? (
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" aria-hidden />
                      )}
                      {pct != null ? `${up ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </TerminalShell>
  );
}
