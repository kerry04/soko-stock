import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { SignalMap } from "@/components/signals/SignalMap";
import { NewsTicker } from "@/components/markets/NewsTicker";
import { ProductMarketCard } from "@/components/markets/ProductMarketCard";
import { EmptyMarketState } from "@/components/markets/EmptyMarketState";
import { type PricePoint, type ProductMarket } from "@/components/markets/product-market";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Soko Stock — Live Signal Terminal" },
      {
        name: "description",
        content:
          "Watch the world's news move across a live signal map, then trade the outcome on Soko Stock prediction markets.",
      },
      { property: "og:title", content: "Soko Stock — Live Signal Terminal" },
    ],
  }),
  component: SignalHome,
});

interface MarketRow {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume_cents: number;
  trader_count: number;
  closes_at: string | null;
  created_at: string;
}

function useOpenMarkets() {
  const [markets, setMarkets] = useState<ProductMarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase
        .from("markets")
        .select(
          "id, slug, question, category, yes_price, no_price, volume_cents, trader_count, closes_at, created_at",
        )
        .eq("status", "open")
        .order("volume_cents", { ascending: false })
        .limit(6);
      if (cancelled) return;
      const rows = (m ?? []) as MarketRow[];
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
        (ph ?? ([] as { market_id: string; yes_price: number; recorded_at: string }[])).forEach(
          (row) => {
            const k = row.market_id;
            if (!histories[k]) histories[k] = [];
            histories[k].push({ yes_price: Number(row.yes_price), recorded_at: row.recorded_at });
          },
        );
      }
      if (!cancelled) {
        setMarkets(
          rows.map((r) => ({
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
  }, []);

  return { markets, loading };
}

function SignalHome() {
  const { markets, loading } = useOpenMarkets();

  return (
    <TerminalShell>
      <NewsTicker />
      <main className="mx-auto max-w-[1400px] px-3 sm:px-5">
        {/* Question-driven header, ops-room style */}
        <section className="pt-5 sm:pt-8" aria-labelledby="signal-heading">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-success">
            Live · Global intelligence
          </p>
          <h1
            id="signal-heading"
            className="mt-2 max-w-3xl text-2xl font-extrabold tracking-tight sm:text-4xl"
          >
            What are you trying to find out?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The map streams the world&apos;s raw news signals — every pulse is a story moving a
            market somewhere. When a country lights up, the trade is underneath it.
          </p>
        </section>

        <section aria-label="Live signal map" className="mt-5">
          <SignalMap />
        </section>

        {/* Markets strip */}
        <section aria-label="Open markets" className="py-8 sm:py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Terminal
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-xl">Open markets</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              <Link to="/markets">
                All markets <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>

          <div className="mt-5">
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
              <EmptyMarketState />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {markets.map((m) => (
                  <ProductMarketCard key={m.id} market={m} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:flex-row sm:px-5">
          <span>Soko Stock — signal terminal</span>
          <span>Trade responsibly. 18+.</span>
        </div>
      </footer>
    </TerminalShell>
  );
}
