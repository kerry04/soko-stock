import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { Sparkline } from "@/components/markets/Sparkline";
import { WatchButton } from "@/components/markets/WatchButton";
import { EmptyMarketState } from "@/components/markets/EmptyMarketState";
import { useBoardMarkets } from "@/components/markets/use-board-markets";
import {
  CATEGORY_LABEL,
  formatKESCompact,
  formatNumberCompact,
  formatPercent,
  formatTimeRemaining,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/markets/")({
  head: () => ({
    meta: [
      { title: "Markets — Soko Stock" },
      { name: "description", content: "Live prediction markets on the Soko Stock terminal." },
    ],
  }),
  component: MarketsBoard,
});

const CATS = ["all", "politics", "sports", "entertainment", "economics", "fashion"] as const;
type SortKey = "volume" | "new" | "ending";

/**
 * Terminal-style markets board: dense rows, mono numerals, sparklines,
 * watchlist stars. Public — trading happens on the detail page behind auth.
 */
function MarketsBoard() {
  const { markets, history, loading } = useBoardMarkets();
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const [sort, setSort] = useState<SortKey>("volume");

  const visible = useMemo(() => {
    const filtered = cat === "all" ? markets : markets.filter((m) => m.category === cat);
    const arr = [...filtered];
    if (sort === "volume") arr.sort((a, b) => b.volume_cents - a.volume_cents);
    if (sort === "new") arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (sort === "ending")
      arr.sort(
        (a, b) =>
          (a.closes_at ? +new Date(a.closes_at) : Infinity) -
          (b.closes_at ? +new Date(b.closes_at) : Infinity),
      );
    return arr;
  }, [markets, cat, sort]);

  return (
    <TerminalShell>
      <main className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-success">
              Terminal · Live
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Markets</h1>
          </div>
          {!loading && (
            <p className="num font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {visible.length} open
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
            {CATS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={cn(
                  "h-7 rounded border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/60",
                  cat === c
                    ? "border-success/60 bg-success/10 text-success"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {c === "all" ? "All" : (CATEGORY_LABEL[c] ?? c)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5" role="group" aria-label="Sort">
            {(
              [
                ["volume", "Vol"],
                ["new", "New"],
                ["ending", "Ending"],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                className={cn(
                  "h-7 rounded px-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                  sort === k ? "text-success" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
          {loading ? (
            <div className="divide-y divide-border/50" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 animate-pulse bg-card/40" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-8">
              <EmptyMarketState />
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {visible.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/markets/$slug"
                    params={{ slug: m.slug }}
                    className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/40 sm:gap-4 sm:px-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:underline">
                        {m.question}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <span>{CATEGORY_LABEL[m.category] ?? m.category}</span>
                        <span className="num">{formatKESCompact(m.volume_cents / 100)} vol</span>
                        <span className="num">{formatNumberCompact(m.trader_count)} traders</span>
                        {m.closes_at && <span>{formatTimeRemaining(m.closes_at)} left</span>}
                      </p>
                    </div>
                    <div className="hidden w-36 shrink-0 sm:block" aria-hidden>
                      <Sparkline points={history[m.id] ?? []} height={36} jagged={false} />
                    </div>
                    <div className="num w-16 shrink-0 text-right font-mono text-lg font-bold tabular-nums">
                      <span className={m.yes_price >= 0.5 ? "text-success" : "text-destructive"}>
                        {formatPercent(m.yes_price)}
                      </span>
                      <span className="block text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        yes
                      </span>
                    </div>
                    <WatchButton marketId={m.id} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </TerminalShell>
  );
}
