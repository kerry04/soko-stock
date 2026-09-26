import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getDBBoard } from "@/lib/stocks/boards-db.server";
import { getBoard } from "@/lib/stocks/yahoo.server";

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
        try {
          rows =
            exchange.source === "africanfinancials"
              ? (await getDBBoard(exchange.id)).map((q) => ({
                  ticker: q.ticker,
                  name: q.name,
                  price: Number(q.price),
                  previousClose: null,
                  change: null,
                  changePercent:
                    q.change_percent != null ? Number(q.change_percent) : null,
                  volume: q.volume != null ? Number(q.volume) : null,
                  asOf: q.fetched_at,
                }))
              : (
                  await getBoard(exchange.tickers)
                )
                  .filter((q) => q && q.price != null)
                  .map((q) => ({
                    ticker: q!.ticker,
                    name: q!.name,
                    // Convert to display currency (e.g. ZAc → Rand).
                    price: q!.price! / exchange.divisor,
                    previousClose:
                      q!.previousClose != null ? q!.previousClose / exchange.divisor : null,
                    change: q!.change != null ? q!.change / exchange.divisor : null,
                    changePercent: q!.changePercent,
                    volume: q!.bars[q!.bars.length - 1]?.v ?? null,
                    asOf: q!.asOf,
                  }));
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
