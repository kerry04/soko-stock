import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getDBBoard, getDBQuote } from "@/lib/stocks/boards-db.server";
import { getQuote } from "@/lib/stocks/yahoo.server";
import { getNewsSignals } from "@/lib/stocks/news-signals.server";

function exchangeOf(ticker: string): string | null {
  const found = Object.values(EXCHANGE_BY_ID).find(
    (e) => e.tickers.includes(ticker) || ticker.endsWith(`.${e.id}`),
  );
  return found?.id ?? null;
}

async function resolveName(ticker: string): Promise<string | null> {
  const ex = exchangeOf(ticker);
  try {
    if (ex === "JSE") {
      const q = await getQuote(ticker, "1mo", "1d");
      return q?.name ?? null;
    }
    const row = await getDBQuote(ticker);
    return row?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/stocks/news-signals?tickers=NPN.JO,SBK.JO
 * GET /api/stocks/news-signals?exchange=JSE
 *
 * Per-ticker news intelligence from the real pipeline: 24h article volume
 * vs the 30-day daily median (surge flags), 7-day sentiment tilt, and the
 * linked headlines themselves. 30-minute server cache. Tickers whose
 * company name can't be resolved are skipped, never guessed.
 */
export const Route = createFileRoute("/api/stocks/news-signals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const exchangeId = url.searchParams.get("exchange");
        const tickersParam = url.searchParams.get("tickers");

        let tickers: string[] = [];
        if (tickersParam) {
          tickers = tickersParam
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 30);
        } else if (exchangeId) {
          const exchange = EXCHANGE_BY_ID[exchangeId];
          if (!exchange || exchange.status !== "live") {
            return new Response(
              JSON.stringify({ ok: false, error: "exchange not live" }),
              { status: 404, headers: { "content-type": "application/json" } },
            );
          }
          if (exchangeId === "JSE") {
            tickers = [...exchange.tickers];
          } else {
            try {
              const rows = await getDBBoard(exchangeId);
              tickers = rows.map((r) => r.ticker).slice(0, 60);
            } catch {
              tickers = [];
            }
          }
        }

        if (tickers.length === 0) {
          return new Response(
            JSON.stringify({ ok: false, error: "no tickers" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const names = await Promise.all(tickers.map(resolveName));
        const items = tickers
          .map((ticker, i) => ({ ticker, name: names[i] }))
          .filter((t): t is { ticker: string; name: string } => t.name != null);

        try {
          const signals = await getNewsSignals(items);
          return new Response(
            JSON.stringify({
              ok: true,
              signals,
              fetchedAt: new Date().toISOString(),
              windowDays: 30,
            }),
            { headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "news query failed",
            }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
