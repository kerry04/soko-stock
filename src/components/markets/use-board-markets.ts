import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BoardMarket {
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

/** Open markets + yes-price history for sparklines, ordered by volume. */
export function useBoardMarkets(limit = 60) {
  const [markets, setMarkets] = useState<BoardMarket[]>([]);
  const [history, setHistory] = useState<Record<string, number[]>>({});
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
        .limit(limit);
      if (cancelled) return;
      const rows = ((m ?? []) as BoardMarket[]).map((r) => ({
        ...r,
        yes_price: Number(r.yes_price),
        no_price: Number(r.no_price),
        volume_cents: Number(r.volume_cents),
        trader_count: Number(r.trader_count ?? 0),
      }));
      setMarkets(rows);
      if (rows.length > 0) {
        const { data: ph } = await supabase
          .from("price_history")
          .select("market_id, yes_price, recorded_at")
          .in(
            "market_id",
            rows.map((r) => r.id),
          )
          .order("recorded_at", { ascending: true });
        const grouped: Record<string, number[]> = {};
        ((ph ?? []) as { market_id: string; yes_price: number }[]).forEach((row) => {
          const k = row.market_id;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(Number(row.yes_price));
        });
        if (!cancelled) setHistory(grouped);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { markets, history, loading };
}
