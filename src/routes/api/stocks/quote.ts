import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getAFQuote } from "@/lib/stocks/africanfinancials.server";
import { getQuote } from "@/lib/stocks/yahoo.server";

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
            q = await getAFQuote(ticker);
          } catch {
            q = null;
          }
          if (!q) {
            return new Response(JSON.stringify({ ok: false, error: "quote unavailable" }), {
              status: 502,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({
              ok: true,
              ticker: q.ticker,
              name: q.name,
              exchange: exchange.id,
              currencySymbol: exchange.currencySymbol,
              price: q.price,
              previousClose: null,
              change: null,
              changePercent: q.changePercent,
              asOf: q.updated,
              timeNote: exchange.timeNote,
              bars: [],
              extras: {
                sector: q.sector,
                ytdPercent: q.ytdPercent,
                volume: q.volume,
                value: q.value,
                updated: q.updated,
              },
            }),
            { headers: { "content-type": "application/json" } },
          );
        }

        const q = await getQuote(ticker, range, "1d");
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
            timeNote: exchange.timeNote,
            bars: q.bars.map((b) => ({
              t: b.t,
              o: b.o != null ? b.o / d : null,
              h: b.h != null ? b.h / d : null,
              l: b.l != null ? b.l / d : null,
              c: b.c != null ? b.c / d : null,
              v: b.v,
            })),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
