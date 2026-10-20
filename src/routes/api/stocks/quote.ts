import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getDBQuote } from "@/lib/stocks/boards-db.server";
import { getExchangeBoardRows } from "@/lib/stocks/board-rows.server";
import { getQuote, getTechnicals } from "@/lib/stocks/yahoo.server";

/** Board-relative context for one ticker (liquidity tier, speculation, limit) — best-effort. */
async function boardContext(exchangeId: string, ticker: string) {
  try {
    const board = await getExchangeBoardRows(exchangeId);
    const row = board.rows.find((r) => r.ticker === ticker);
    return row
      ? { liquidity: row.liquidity, speculation: row.speculation, limitHit: row.limitHit }
      : null;
  } catch {
    return null;
  }
}

const ALLOWED_RANGES = new Set(["1mo", "3mo", "6mo", "1y", "2y", "5y"]);

/**
 * GET /api/stocks/quote?ticker=NPN.JO&range=1y
 * Full quote + daily bars for the detail page. Range limited to sane values.
 * African Financials listings are end-of-day only: quote + stats, no bars.
 */
export const Route = createFileRoute("/api/stocks/quote")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ticker = url.searchParams.get("ticker") ?? "";
        const range = url.searchParams.get("range") ?? "1y";
        if (!ticker || !ALLOWED_RANGES.has(range)) {
          return new Response(JSON.stringify({ ok: false, error: "bad request" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const exchange = Object.values(EXCHANGE_BY_ID).find(
          (e) => e.tickers.includes(ticker) || ticker.endsWith(`.${e.id}`),
        );
        if (!exchange || exchange.status !== "live") {
          return new Response(JSON.stringify({ ok: false, error: "unknown ticker" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        if (exchange.source === "africanfinancials") {
          let q;
          try {
            q = await getDBQuote(ticker);
          } catch {
            q = null;
          }
          if (!q) {
            return new Response(JSON.stringify({ ok: false, error: "quote unavailable" }), {
              status: 502,
              headers: { "content-type": "application/json" },
            });
          }
          const price = Number(q.price);
          const board = await boardContext(exchange.id, ticker);
          return new Response(
            JSON.stringify({
              ok: true,
              ticker: q.ticker,
              name: q.name,
              exchange: exchange.id,
              currencySymbol: exchange.currencySymbol,
              price,
              board,
              previousClose: null,
              change: null,
              changePercent:
                q.change_percent != null ? Number(q.change_percent) : null,
              asOf: q.fetched_at,
              timeNote: exchange.timeNote,
              bars: [],
              extras: {
                sector: q.sector,
                ytdPercent:
                  q.ytd_percent != null ? Number(q.ytd_percent) : null,
                volume: q.volume != null ? Number(q.volume) : null,
                value: q.value_traded != null ? Number(q.value_traded) : null,
                updated: q.updated,
              },
            }),
            { headers: { "content-type": "application/json" } },
          );
        }

        const [q, tech, board] = await Promise.all([
          getQuote(ticker, range, "1d"),
          getTechnicals(ticker),
          boardContext(exchange.id, ticker),
        ]);
        if (!q) {
          return new Response(JSON.stringify({ ok: false, error: "quote unavailable" }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
        const d = exchange.divisor;
        return new Response(
          JSON.stringify({
            ok: true,
            ticker: q.ticker,
            name: q.name,
            exchange: exchange.id,
            currencySymbol: exchange.currencySymbol,
            price: q.price != null ? q.price / d : null,
            previousClose: q.previousClose != null ? q.previousClose / d : null,
            change: q.change != null ? q.change / d : null,
            changePercent: q.changePercent,
            asOf: q.asOf,
            board,
            timeNote: exchange.timeNote,
            bars: q.bars.map((b) => ({
              t: b.t,
              o: b.o != null ? b.o / d : null,
              h: b.h != null ? b.h / d : null,
              l: b.l != null ? b.l / d : null,
              c: b.c != null ? b.c / d : null,
              v: b.v,
            })),
            // Unitless/boolean signals pass through; price-like fields convert.
            technicals: tech
              ? {
                  ...tech,
                  sma50: tech.sma50 / d,
                  sma200: tech.sma200 / d,
                }
              : null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
