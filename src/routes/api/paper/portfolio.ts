import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getQuote } from "@/lib/stocks/yahoo.server";
import { getDBQuote } from "@/lib/stocks/boards-db.server";
import { paperUserId, paperAdmin } from "@/lib/paper/server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function mapParallel<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
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
 * GET /api/paper/portfolio — cash per currency, positions revalued at the
 * same source used for fills (Yahoo for JSE, stock_boards for EOD), and
 * the 50 most recent orders. EOD rows carry delayed:true.
 */
export const Route = createFileRoute("/api/paper/portfolio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          let userId: string;
          try {
            userId = await paperUserId(request);
          } catch (e) {
            if (e instanceof Response) return e;
            throw e;
          }
          const sb = paperAdmin();
          const [{ data: pfs }, { data: poss }, { data: ords }] = await Promise.all([
            sb.from("paper_portfolios").select("currency, cash").eq("user_id", userId),
            sb
              .from("paper_positions")
              .select("ticker, qty, avg_cost")
              .eq("user_id", userId)
              .order("ticker"),
            sb
              .from("paper_orders")
              .select("ticker, exchange, side, qty, fill_price, as_of, created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(50),
          ]);

          const list = ((poss ?? []) as { ticker: string; qty: number; avg_cost: number }[]).map(
            (p) => ({ ticker: p.ticker, qty: Number(p.qty), avg: Number(p.avg_cost) }),
          );
          const boards = await mapParallel(list, 6, async (p) => {
            const m = p.ticker.match(/\.([A-Z]+)$/);
            const ex = m ? EXCHANGE_BY_ID[m[1]] : undefined;
            const jse =
              ex?.source === "yahoo" ||
              Object.values(EXCHANGE_BY_ID).some((e) => e.tickers.includes(p.ticker));
            try {
              if (jse) {
                const div = ex?.divisor ?? 100;
                const q = await getQuote(p.ticker, "5d", "1d");
                if (!q || q.price == null)
                  return { board: null, asOf: null as string | null, delayed: false };
                return { board: q.price / div, asOf: q.asOf, delayed: false };
              }
              const row = await getDBQuote(p.ticker);
              if (!row) return { board: null, asOf: null as string | null, delayed: true };
              return { board: Number(row.price), asOf: row.fetched_at, delayed: true };
            } catch {
              return { board: null, asOf: null as string | null, delayed: !jse };
            }
          });

          return json({
            ok: true,
            cash: Object.fromEntries(
              ((pfs ?? []) as { currency: string; cash: number }[]).map((r) => [
                r.currency,
                Number(r.cash),
              ]),
            ),
            positions: list.map((p, i) => ({
              ...p,
              board: boards[i]?.board ?? null,
              asOf: boards[i]?.asOf ?? null,
              delayed: boards[i]?.delayed ?? true,
            })),
            orders: ords ?? [],
          });
        } catch {
          return json({ ok: false, error: "portfolio_failed" }, 500);
        }
      },
    },
  },
});
