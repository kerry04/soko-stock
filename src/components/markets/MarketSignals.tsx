import { useEffect, useState } from "react";
import { Activity, ExternalLink, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Headline {
  article_id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

interface SignalsState {
  headlines: Headline[];
  count24h: number;
  countPrev24h: number;
  sentiment: number | null;
  velocity: number;
  priceDelta: number | null;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function SentimentMeter({ value }: { value: number }) {
  // value in -1..1
  const pct = Math.round(((value + 1) / 2) * 100);
  const label = value > 0.25 ? "Positive" : value < -0.25 ? "Negative" : "Mixed";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          News sentiment
        </span>
        <span
          className={cn(
            "font-mono text-[11px] font-bold uppercase tracking-[0.12em]",
            value > 0.25
              ? "text-success"
              : value < -0.25
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`News sentiment ${label}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value > 0.25 ? "bg-success" : value < -0.25 ? "bg-destructive" : "bg-muted-foreground",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        From news coverage — not a prediction.
      </p>
    </div>
  );
}

/**
 * "What's moving this" — signal fusion for a market. News velocity (24h vs
 * prior 24h), news sentiment, top headlines, and a Convergence badge that
 * only lights when a news spike, a sentiment shift, and a price move all
 * align in the same window. Honest empty states throughout.
 */
export function MarketSignals({ marketId, keywords }: { marketId: string; keywords: string[] }) {
  const [state, setState] = useState<SignalsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const kws = keywords.map((k) => k.toLowerCase()).filter(Boolean);
      if (kws.length === 0) {
        setState({
          headlines: [],
          count24h: 0,
          countPrev24h: 0,
          sentiment: null,
          velocity: 0,
          priceDelta: null,
        });
        return;
      }
      const now = Date.now();
      const d24 = new Date(now - 24 * 3600 * 1000).toISOString();
      const d48 = new Date(now - 48 * 3600 * 1000).toISOString();

      const [rpcRes, c24, cPrev, trends, prices] = await Promise.all([
        supabase.rpc("match_news_to_markets", { _market_ids: [marketId], _per_market: 3 }),
        supabase
          .from("raw_news_data")
          .select("id", { count: "exact", head: true })
          .eq("processed", true)
          .gte("published_at", d24)
          .overlaps("relevant_keywords", kws),
        supabase
          .from("raw_news_data")
          .select("id", { count: "exact", head: true })
          .eq("processed", true)
          .gte("published_at", d48)
          .lt("published_at", d24)
          .overlaps("relevant_keywords", kws),
        supabase
          .from("trending_keywords")
          .select("keyword, avg_sentiment, velocity")
          .in("keyword", kws),
        supabase
          .from("price_history")
          .select("yes_price, recorded_at")
          .eq("market_id", marketId)
          .gte("recorded_at", d48)
          .order("recorded_at", { ascending: true }),
      ]);

      if (cancelled) return;

      const headlines = ((rpcRes.data ?? []) as Headline[]).filter((h) => h.title && h.url);
      const trendRows = (trends.data ?? []) as { avg_sentiment: number; velocity: number }[];
      const sentiment =
        trendRows.length > 0
          ? trendRows.reduce((s, t) => s + Number(t.avg_sentiment), 0) / trendRows.length
          : null;
      const velocity = trendRows.reduce((s, t) => s + (Number(t.velocity) || 0), 0);
      const priceRows = (prices.data ?? []) as { yes_price: number }[];
      const priceDelta =
        priceRows.length >= 2
          ? Number(priceRows[priceRows.length - 1].yes_price) - Number(priceRows[0].yes_price)
          : null;

      setState({
        headlines,
        count24h: c24.count ?? 0,
        countPrev24h: cPrev.count ?? 0,
        sentiment,
        velocity,
        priceDelta,
      });
    })().catch(() => {
      if (!cancelled) setState(null);
    });
    return () => {
      cancelled = true;
    };
  }, [marketId, keywords]);

  if (state === null) return null;

  const { headlines, count24h, countPrev24h, sentiment, priceDelta } = state;
  const spike = countPrev24h > 0 ? count24h / countPrev24h : count24h >= 3 ? Infinity : 0;
  const hasSpike = count24h >= 3 && spike >= 2;
  const hasSentimentShift = sentiment !== null && Math.abs(sentiment) >= 0.3;
  const hasPriceMove = priceDelta !== null && Math.abs(priceDelta) >= 0.05;
  const convergence = hasSpike && hasSentimentShift && hasPriceMove;
  const hasAnything = count24h > 0 || headlines.length > 0 || sentiment !== null;

  return (
    <section
      aria-label="What's moving this market"
      className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" aria-hidden />
          What&apos;s moving this
        </h3>
        {convergence && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/50 bg-success/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-success">
            <Flame className="h-3 w-3" aria-hidden />
            Convergence
          </span>
        )}
      </div>

      {!hasAnything ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No fresh signals for this market yet — the news wire hasn&apos;t picked up its keywords in
          the last 48 hours.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  News velocity
                </span>
                <span className="num font-mono text-[11px] text-foreground">
                  {count24h} <span className="text-muted-foreground">/ 24h</span>
                  {countPrev24h > 0 && (
                    <span
                      className={cn("ml-1.5", hasSpike ? "text-success" : "text-muted-foreground")}
                    >
                      {spike === Infinity ? "new" : `${spike.toFixed(1)}×`} vs prior
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 flex h-1.5 gap-0.5" aria-hidden>
                {Array.from({ length: 12 }).map((_, i) => {
                  const fill = Math.min(1, count24h / 12);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "h-full flex-1 rounded-full",
                        i / 12 < fill ? "bg-success" : "bg-muted",
                      )}
                    />
                  );
                })}
              </div>
            </div>
            {sentiment !== null && <SentimentMeter value={Math.max(-1, Math.min(1, sentiment))} />}
            {convergence && (
              <p className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs leading-relaxed text-muted-foreground">
                News volume is spiking, coverage leans{" "}
                {sentiment !== null && sentiment > 0 ? "positive" : "negative"}, and the price moved{" "}
                {priceDelta !== null && priceDelta > 0 ? "up" : "down"}{" "}
                {priceDelta !== null ? `${Math.abs(priceDelta * 100).toFixed(1)} pts` : ""} in the
                same window. Signals agree — trade accordingly.
              </p>
            )}
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Top headlines
            </p>
            {headlines.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No linked headlines in the wire right now.
              </p>
            ) : (
              <ul className="mt-2 space-y-2.5">
                {headlines.map((h) => (
                  <li key={h.article_id}>
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group text-sm leading-snug text-foreground hover:underline"
                    >
                      {h.title}
                      <ExternalLink
                        className="ml-1 inline h-3 w-3 text-muted-foreground"
                        aria-hidden
                      />
                    </a>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {h.source} · {timeAgo(h.published_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
