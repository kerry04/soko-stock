import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel } from "@/components/ui/card";
import { StateBlock, SkeletonRows } from "@/components/common/states";
import { ChangeCell } from "@/components/stocks/change";
import { fmtPrice } from "@/lib/stocks/format";
import { LIVE_EXCHANGES } from "@/lib/stocks/exchanges";
import { useWatchlist } from "@/lib/watchlist";

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
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="WCH · Stocks you follow"
          title="Watchlist"
          description="Your starred stocks, saved on this device. No account needed."
        />

        {loading ? (
          <Panel variant="plain" padding="md">
            <SkeletonRows rows={3} />
          </Panel>
        ) : rows.length === 0 ? (
          <Panel variant="folio" padding="none" className="overflow-hidden">
            <StateBlock
              tone="empty"
              title="Nothing watched yet"
              message="Tap the star on any stock to pin it here."
              className="border-0"
              action={
                <Link
                  to="/"
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary hover:underline"
                >
                  Browse boards →
                </Link>
              }
            />
          </Panel>
        ) : (
          <Panel variant="plain" padding="none" className="overflow-hidden">
            <ul className="divide-y divide-border/60">
              {rows.map((r) => (
                <li
                  key={r.ticker}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4"
                >
                  <button
                    onClick={() => toggle(r.ticker)}
                    aria-label="Remove from watchlist"
                    className="rounded p-1 text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Star className="h-4 w-4" fill="currentColor" aria-hidden />
                  </button>
                  <Link to="/stocks/$ticker" params={{ ticker: r.ticker }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:underline">{r.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {r.ticker}
                    </p>
                  </Link>
                  <div className="text-right">
                    <p className="num font-mono text-sm font-semibold">
                      {fmtPrice(r.price, r.currencySymbol)}
                    </p>
                    <ChangeCell value={r.changePercent} className="mt-0.5" />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PageContainer>
    </TerminalShell>
  );
}
