import { createFileRoute } from "@tanstack/react-router";
import { BoardError, getExchangeBoardRows } from "@/lib/stocks/board-rows.server";

/**
 * GET /api/stocks/board?exchange=JSE
 * Live board rows for an exchange's constituents. JSE: Yahoo (server fans
 * out ≤6 concurrent, 5-min cache). NSE/NGX/GSE: daily EOD rows from the
 * stock_boards table, refreshed by the VM cron. The client makes one call.
 * Row-building lives in lib/stocks/board-rows.server.ts, shared with the
 * screener.
 */
export const Route = createFileRoute("/api/stocks/board")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const exchangeId = url.searchParams.get("exchange") ?? "JSE";
        try {
          const board = await getExchangeBoardRows(exchangeId);
          return new Response(JSON.stringify({ ok: true, ...board }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const code = e instanceof BoardError && e.code === "not-live" ? 404 : 502;
          const error = e instanceof BoardError && e.code === "not-live" ? "exchange not live" : "feed unreachable";
          return new Response(JSON.stringify({ ok: false, error }), {
            status: code,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
