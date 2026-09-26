import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getBoard } from "@/lib/stocks/yahoo.server";

/**
 * GET /api/stocks/board?exchange=JSE
 * Live board rows for an exchange's constituents. Server fans out to Yahoo
 * (≤6 concurrent) with a 5-min cache — the client makes one call.
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
        const quotes = await getBoard(exchange.tickers);
        const rows = quotes
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
            asOf: q!.asOf,
          }));
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
