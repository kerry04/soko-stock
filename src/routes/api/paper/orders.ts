import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { getQuote } from "@/lib/stocks/yahoo.server";
import { getDBQuote } from "@/lib/stocks/boards-db.server";
import { applyBuy, applySell, START_CASH, EOD_STALE_MS } from "@/lib/paper/fill";
import { parseOrderInput } from "@/lib/paper/orders";
import { paperUserId, paperAdmin } from "@/lib/paper/server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resolveExchange(ticker: string) {
  const direct = Object.values(EXCHANGE_BY_ID).find((e) => e.tickers.includes(ticker));
  if (direct) return direct;
  const m = ticker.match(/\.([A-Z]+)$/);
  const bySuffix = m ? EXCHANGE_BY_ID[m[1]] : undefined;
  return bySuffix ?? null;
}

/**
 * POST /api/paper/orders {ticker, side, qty, idempotencyKey}
 * Market-only instant paper fills. The fill price is always re-read
 * server-side (Yahoo for JSE, stock_boards for EOD) — the client's
 * displayed price is never trusted. Idempotent per idempotencyKey.
 */
export const Route = createFileRoute("/api/paper/orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let userId: string;
          try {
            userId = await paperUserId(request);
          } catch (e) {
            if (e instanceof Response) return e;
            throw e;
          }

          let body: unknown = null;
          try {
            body = await request.json();
          } catch {
            return json({ ok: false, error: "invalid_body" }, 422);
          }
          const parsed = parseOrderInput(body);
          if ("error" in parsed) {
            return json({ ok: false, error: parsed.error }, 422);
          }
          const { ticker, side, qty, idempotencyKey } = parsed;

          const exchange = resolveExchange(ticker);
          if (!exchange || exchange.status !== "live") {
            return json({ ok: false, error: "exchange_not_live" }, 422);
          }

          const sb = paperAdmin();

          // Idempotency: a retried click returns the original fill.
          const { data: existing } = await sb
            .from("paper_orders")
            .select("fill_price, as_of, qty, side")
            .eq("user_id", userId)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          if (existing) {
            const { data: pos } = await sb
              .from("paper_positions")
              .select("qty, avg_cost")
              .eq("user_id", userId)
              .eq("ticker", ticker)
              .maybeSingle();
            const { data: pf } = await sb
              .from("paper_portfolios")
              .select("cash")
              .eq("user_id", userId)
              .eq("currency", exchange.currency)
              .maybeSingle();
            return json({
              ok: true,
              duplicate: true,
              fill_price: Number((existing as { fill_price: number }).fill_price),
              as_of: (existing as { as_of: string }).as_of,
              cash: pf ? Number((pf as { cash: number }).cash) : null,
              position: pos
                ? {
                    qty: Number((pos as { qty: number }).qty),
                    avg: Number((pos as { avg_cost: number }).avg_cost),
                  }
                : { qty: 0, avg: 0 },
            });
          }

          // Re-read the fill price server-side.
          let fillPrice: number;
          let asOf: string;
          let source: "yahoo" | "eod";
          if (exchange.source === "yahoo") {
            const q = await getQuote(ticker, "5d", "1d");
            if (!q || q.price == null) {
              return json({ ok: false, error: "quote_unavailable" }, 502);
            }
            fillPrice = q.price / exchange.divisor;
            asOf = q.asOf;
            source = "yahoo";
          } else {
            const row = await getDBQuote(ticker);
            if (!row) return json({ ok: false, error: "quote_unavailable" }, 502);
            const age = Date.now() - new Date(row.fetched_at).getTime();
            if (!Number.isFinite(age) || age > EOD_STALE_MS) {
              return json({ ok: false, error: "stale_eod", fetched_at: row.fetched_at }, 423);
            }
            fillPrice = Number(row.price);
            asOf = row.fetched_at;
            source = "eod";
          }

          // Ensure portfolio, load position.
          const { error: seedErr } = await sb.from("paper_portfolios").upsert(
            {
              user_id: userId,
              currency: exchange.currency,
              cash: START_CASH,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,currency", ignoreDuplicates: true },
          );
          if (seedErr) {
            console.error("paper: portfolio seed failed", seedErr);
            return json({ ok: false, error: "portfolio_unavailable" }, 500);
          }
          const { data: pfRow, error: pfErr } = await sb
            .from("paper_portfolios")
            .select("cash")
            .eq("user_id", userId)
            .eq("currency", exchange.currency)
            .single();
          if (pfErr || !pfRow) {
            console.error("paper: portfolio load failed", pfErr);
            return json({ ok: false, error: "portfolio_unavailable" }, 500);
          }
          const cash = Number((pfRow as unknown as { cash: number }).cash);
          const { data: posRow } = await sb
            .from("paper_positions")
            .select("qty, avg_cost")
            .eq("user_id", userId)
            .eq("ticker", ticker)
            .maybeSingle();
          const pos = posRow
            ? {
                qty: Number((posRow as { qty: number }).qty),
                avg: Number((posRow as { avg_cost: number }).avg_cost),
              }
            : null;

          let newQty: number;
          let newAvg: number;
          let newCash: number;
          if (side === "BUY") {
            const cost = qty * fillPrice;
            if (cost > cash) {
              return json({ ok: false, error: "insufficient_cash" }, 422);
            }
            const r = applyBuy(pos, qty, fillPrice);
            newQty = r.qty;
            newAvg = r.avg;
            newCash = cash - cost;
          } else {
            if (!pos) return json({ ok: false, error: "insufficient_shares" }, 422);
            const r = applySell(pos, qty);
            if ("error" in r) {
              return json({ ok: false, error: r.error }, 422);
            }
            newQty = r.qty;
            newAvg = r.avg;
            newCash = cash + qty * fillPrice;
          }

          const now = new Date().toISOString();
          const { error: orderErr } = await sb.from("paper_orders").insert({
            user_id: userId,
            ticker,
            exchange: exchange.id,
            side,
            qty,
            fill_price: fillPrice,
            source,
            as_of: asOf,
            idempotency_key: idempotencyKey,
          });
          if (orderErr) {
            // Lost a race with a retry carrying the same key — return it.
            if (orderErr.code === "23505") {
              return json({
                ok: true,
                duplicate: true,
                fill_price: fillPrice,
                as_of: asOf,
                cash,
                position: pos ?? { qty: 0, avg: 0 },
              });
            }
            return json({ ok: false, error: "ledger_error" }, 500);
          }
          if (newQty === 0) {
            await sb.from("paper_positions").delete().eq("user_id", userId).eq("ticker", ticker);
          } else {
            await sb.from("paper_positions").upsert({
              user_id: userId,
              ticker,
              qty: newQty,
              avg_cost: newAvg,
              updated_at: now,
            });
          }
          await sb
            .from("paper_portfolios")
            .update({ cash: newCash, updated_at: now })
            .eq("user_id", userId)
            .eq("currency", exchange.currency);

          return json({
            ok: true,
            fill_price: fillPrice,
            as_of: asOf,
            cash: newCash,
            position: { qty: newQty, avg: newAvg },
          });
        } catch (e) {
          console.error("paper: order failed", e);
          return json({ ok: false, error: "fill_failed" }, 500);
        }
      },
    },
  },
});
