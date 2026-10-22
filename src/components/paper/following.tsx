import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { StateBlock, SkeletonRows } from "@/components/common/states";
import { ChangeCell } from "@/components/stocks/change";
import { PriceAsOf } from "@/components/stocks/PriceAsOf";
import { EXCHANGE_BY_ID, type Exchange } from "@/lib/stocks/exchanges";
import { fmtPrice } from "@/lib/stocks/format";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

interface BoardRow {
  ticker: string;
  name: string;
  price: number;
  changePercent: number | null;
  updated: string | null;
  asOf: string;
}

interface BoardResponse {
  ok: boolean;
  exchange: string;
  currencySymbol: string;
  updated: string | null;
  rows: BoardRow[];
}

interface FollowedRow {
  ticker: string;
  name: string;
  exchange: Exchange | undefined;
  price: number | null;
  changePercent: number | null;
  currencySymbol: string;
  updated: string | null;
  asOf: string | null;
}

function exchangeFor(ticker: string): Exchange | undefined {
  const pinned = Object.values(EXCHANGE_BY_ID).find((e) => e.tickers.includes(ticker));
  if (pinned) return pinned;
  const m = ticker.match(/\.([A-Z]+)$/);
  return m ? EXCHANGE_BY_ID[m[1]] : undefined;
}

/** The two-point move implied by the day change: previous close → now. */
function TwoPointLine({
  price,
  changePercent,
}: {
  price: number | null;
  changePercent: number | null;
}) {
  if (price == null) return <span className="w-14 shrink-0" aria-hidden />;
  const prev =
    changePercent != null && changePercent > -100
      ? price / (1 + changePercent / 100)
      : price;
  const up = price > prev;
  const flat = price === prev;
  const W = 56;
  const H = 22;
  const pad = 4;
  const min = Math.min(prev, price);
  const max = Math.max(prev, price);
  const span = Math.max(0.0001, max - min);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn(
        "h-5 w-14 shrink-0",
        flat ? "text-muted-foreground" : up ? "text-success" : "text-destructive",
      )}
      role="img"
      aria-label={
        changePercent == null
          ? "No day move available"
          : `Day move ${changePercent > 0 ? "up" : changePercent < 0 ? "down" : "flat"}`
      }
    >
      <path
        d={`M${pad},${y(prev).toFixed(1)} L${W - pad},${y(price).toFixed(1)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx={W - pad} cy={y(price)} r="1.8" fill="currentColor" />
    </svg>
  );
}

/**
 * Following — the device-local watchlist, rendered as prices. It works
 * signed out because the list lives in the browser. Removing a company
 * never opens its page.
 */
export function Following({ className }: { className?: string }) {
  const { ids, toggle } = useWatchlist();
  const [rows, setRows] = useState<FollowedRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const exchanges = [...new Set(ids.map((id) => exchangeFor(id)?.id).filter(Boolean))];
      const responses = await Promise.all(
        exchanges.map(async (id) => {
          try {
            const r = await fetch(`/api/stocks/board?exchange=${id}`);
            if (!r.ok) return null;
            return (await r.json()) as BoardResponse;
          } catch {
            return null;
          }
        }),
      );
      const byTicker = new Map<string, { row: BoardRow; board: BoardResponse }>();
      for (const board of responses) {
        if (!board?.ok) continue;
        for (const row of board.rows) {
          byTicker.set(row.ticker, { row, board });
        }
      }
      if (!cancelled) {
        setRows(
          ids.map((ticker) => {
            const found = byTicker.get(ticker);
            const exchange = exchangeFor(ticker);
            return {
              ticker,
              name: found?.row.name ?? ticker,
              exchange,
              price: found?.row.price ?? null,
              changePercent: found?.row.changePercent ?? null,
              currencySymbol: found?.board.currencySymbol ?? exchange?.currencySymbol ?? "",
              updated: found?.row.updated ?? found?.board.updated ?? null,
              asOf: found?.row.asOf ?? null,
            };
          }),
        );
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <section aria-label="Following" className={cn("mt-6", className)}>
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
        Following
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Companies you follow on this device. It works signed out, because the list
        stays in your browser.
      </p>

      {ids.length === 0 ? (
        <StateBlock
          tone="empty"
          className="mt-3"
          title="Nothing followed yet"
          message="Open any company and tap Follow to see it here."
        />
      ) : loading && rows.length === 0 ? (
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          <SkeletonRows rows={3} />
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.ticker}
              className="flex items-center rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
            >
              <Link
                to="/stocks/$ticker"
                params={{ ticker: r.ticker }}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {r.ticker}
                    {r.exchange ? ` · ${r.exchange.shortName}` : ""}
                  </p>
                </div>
                <TwoPointLine price={r.price} changePercent={r.changePercent} />
                <div className="w-[132px] shrink-0 text-right">
                  <p className="num font-mono text-[13px] font-semibold text-foreground">
                    {r.price != null ? fmtPrice(r.price, r.currencySymbol) : "—"}
                  </p>
                  <ChangeCell value={r.changePercent} className="text-[11px]" />
                  {r.price != null && (
                    <PriceAsOf
                      exchange={r.exchange?.id}
                      updated={r.updated}
                      asOf={r.asOf}
                      className="mt-0.5 justify-end normal-case tracking-normal"
                    />
                  )}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => toggle(r.ticker)}
                aria-label={`Stop following ${r.name}`}
                title="Stop following"
                className="mr-1.5 rounded-md p-2 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
