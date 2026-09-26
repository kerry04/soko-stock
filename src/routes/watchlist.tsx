import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { ProductMarketCard } from "@/components/markets/ProductMarketCard";
import { WatchButton } from "@/components/markets/WatchButton";
import { type PricePoint, type ProductMarket } from "@/components/markets/product-market";
import { Button } from "@/components/ui/button";
import { useWatchlist } from "@/lib/watchlist";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — Soko Stock" },
      { name: "description", content: "Markets you're watching on the Soko Stock terminal." },
    ],
  }),
  component: WatchlistPage,
});

/**
 * Watchlist: the markets the user starred, stored locally on this device.
 * Works signed-out, no account needed.
 */
function WatchlistPage() {
  const { ids } = useWatchlist();
  const [markets, setMarkets] = useState<ProductMarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setMarkets([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase
        .from("markets")
        .select(
          "id, slug, question, category, yes_price, no_price, volume_cents, trader_count, closes_at, created_at",
        )
        .in("id", ids)
        .eq("status", "open");
      if (cancelled) return;
      const rows = (m ?? []) as Omit<
        ProductMarket,
        "history" | "signalProb" | "signalConfidence"
      >[];
      const histories: Record<string, PricePoint[]> = {};
      if (rows.length > 0) {
        const { data: ph } = await supabase
          .from("price_history")
          .select("market_id, yes_price, recorded_at")
          .in(
            "market_id",
            rows.map((r) => r.id),
          )
          .order("recorded_at", { ascending: true });
        ((ph ?? []) as { market_id: string; yes_price: number; recorded_at: string }[]).forEach(
          (row) => {
            const k = row.market_id;
            if (!histories[k]) histories[k] = [];
            histories[k].push({ yes_price: Number(row.yes_price), recorded_at: row.recorded_at });
          },
        );
      }
      if (!cancelled) {
        // Preserve the user's watch order (most recently starred last).
        const order = new Map(ids.map((id, i) => [id, i]));
        const sorted = [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setMarkets(
          sorted.map((r) => ({
            ...r,
            yes_price: Number(r.yes_price),
            no_price: Number(r.no_price),
            volume_cents: Number(r.volume_cents),
            trader_count: Number(r.trader_count ?? 0),
            history: histories[r.id] ?? [],
            signalProb: null,
            signalConfidence: null,
          })),
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <TerminalShell>
      <main className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5 sm:py-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-success">
          Terminal · Yours
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Watchlist</h1>
          {!loading && ids.length > 0 && (
            <p className="num font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {ids.length} watching
            </p>
          )}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-xl border border-border bg-card/50"
                />
              ))}
            </div>
          ) : markets.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border/80 px-6 py-14 text-center">
              <Star className="h-8 w-8 text-muted-foreground" aria-hidden />
              <h2 className="mt-4 text-base font-bold">Nothing on your radar yet</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Star any market and it lands here — on this device, no account needed. When its
                signals spike, you&apos;ll know where to look.
              </p>
              <Button asChild className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em]">
                <Link to="/markets">
                  Browse markets <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {markets.map((m) => (
                <div key={m.id} className="relative">
                  <ProductMarketCard market={m} />
                  <div className="absolute right-3 top-3">
                    <WatchButton marketId={m.id} className="bg-background/80 backdrop-blur" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </TerminalShell>
  );
}
