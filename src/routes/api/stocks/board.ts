import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getDBBoard } from "@/lib/stocks/boards-db.server";
import { getBoard, get52wkStats, getTechnicals } from "@/lib/stocks/yahoo.server";

/** Bounded-parallel map for the 52-week stat fan-out. */
async function mapParallel<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = undefined as R;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * GET /api/stocks/board?exchange=JSE
 * Live board rows for an exchange's constituents. JSE: Yahoo (server fans
 * out ≤6 concurrent, 5-min cache). NSE/NGX/GSE: daily EOD rows from the
 * stock_boards table, refreshed by the VM cron. The client makes one call.
 */
export const Route = createFileRoute("/api/stocks/board")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const exchangeId = url.searchParams.get("exchange") ?? "JSE";
        const exchange = EXCHANGE_BY_ID[exchangeId];
        if (!exchange || exchange.status !== "live") {
          return new Response(JSON.stringify({ ok: false, error: "exchange not live" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        let rows;
        let wk52: ({ high: number; low: number } | null | undefined)[] = [];
        let techs: ({ rsi: number; aboveSma50: boolean; relVolume: number | null } | null | undefined)[] = [];
        try {
          if (exchange.source === "africanfinancials") {
            rows = (await getDBBoard(exchange.id)).map((q) => ({
              ticker: q.ticker,
              name: q.name,
              price: Number(q.price),
              previousClose: null,
              change: null,
              changePercent:
                q.change_percent != null ? Number(q.change_percent) : null,
              volume: q.volume != null ? Number(q.volume) : null,
              // Value traded comes straight from the EOD table.
              value: q.value_traded != null ? Number(q.value_traded) : null,
              // No price history yet for EOD listings — 52wk arrives with
              // accumulated daily snapshots.
              wk52High: null,
              wk52Low: null,
              rsi: null,
              aboveSma50: null,
              relVolume: null,
              asOf: q.fetched_at,
            }));
          } else {
            const quotes = await getBoard(exchange.tickers);
            const d = exchange.divisor;
            // 52-week stats + technicals are cached 12h server-side.
            const [w52, tc] = await Promise.all([
              mapParallel(exchange.tickers, 6, (t) => get52wkStats(t)),
              mapParallel(exchange.tickers, 6, (t) => getTechnicals(t)),
            ]);
            wk52 = w52;
            techs = tc;
            rows = quotes
              .map((q, qi) => ({ q, qi }))
              .filter(({ q }) => q && q.price != null)
              .map(({ q, qi }) => {
                const price = q!.price! / d;
                const vol = q!.bars[q!.bars.length - 1]?.v ?? null;
                const w = wk52[qi];
                const t = techs[qi];
                return {
                  ticker: q!.ticker,
                  name: q!.name,
                  // Convert to display currency (e.g. ZAc → Rand).
                  price,
                  previousClose:
                    q!.previousClose != null ? q!.previousClose / d : null,
                  change: q!.change != null ? q!.change / d : null,
                  changePercent: q!.changePercent,
                  volume: vol,
                  // Approximation: last price × latest daily share volume.
                  value: vol != null ? price * vol : null,
                  wk52High: w?.high != null ? w.high / d : null,
                  wk52Low: w?.low != null ? w.low / d : null,
                  rsi: t?.rsi ?? null,
                  aboveSma50: t?.aboveSma50 ?? null,
                  relVolume: t?.relVolume ?? null,
                  asOf: q!.asOf,
                };
              });
          }
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "feed unreachable" }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            exchange: exchange.id,
            currencySymbol: exchange.currencySymbol,
            timeNote: exchange.timeNote,
            rows,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
