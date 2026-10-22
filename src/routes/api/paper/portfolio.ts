import { createFileRoute } from "@tanstack/react-router";
import { paperUserId, paperAdmin } from "@/lib/paper/server";
import {
  readPaperLedger,
  readPortfolioHistory,
} from "@/lib/paper/valuation.server";
import {
  dayKey,
  valueByCurrency,
  type PortfolioHistoryPoint,
} from "@/lib/paper/valuation";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * GET /api/paper/portfolio — cash per currency, positions revalued at the
 * same source used for fills (Yahoo for JSE, stock_boards for EOD), the 50
 * most recent orders, and history: stored daily snapshots plus today's
 * current point per currency, marked `current: true`.
 *
 * A missing snapshots table (migration not yet applied) degrades to empty
 * history; the account itself still works.
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
          const ledger = await readPaperLedger(sb, userId);
          const stored = await readPortfolioHistory(sb, userId);
          const values = valueByCurrency(ledger.cash, ledger.positions);
          const date = dayKey();

          const history: PortfolioHistoryPoint[] = stored.map((r) => ({
            currency: r.currency,
            date: r.captured_on,
            total: r.total_value,
            cash: r.cash,
            shares: r.shares_value,
            current: false,
          }));
          for (const [currency, v] of Object.entries(values)) {
            history.push({
              currency,
              date,
              total: v.total,
              cash: v.cash,
              shares: v.shares,
              current: true,
            });
          }

          return json({
            ok: true,
            cash: ledger.cash,
            positions: ledger.positions,
            orders: ledger.orders,
            history,
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ ok: false, error: "portfolio_failed" }, 500);
        }
      },
    },
  },
});
