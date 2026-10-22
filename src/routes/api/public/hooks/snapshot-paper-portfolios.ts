import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { readAllPaperAccounts, valueTicker } from "@/lib/paper/valuation.server";
import {
  dayKey,
  exchangeForTicker,
  mapLimit,
  valueByCurrency,
  type ValuedPosition,
} from "@/lib/paper/valuation";

// Daily paper portfolio snapshot — values every practice account with the
// same reader and prices the portfolio endpoint uses, then upserts one row
// per user, currency and UTC day with cash and shares split out. Runs from
// Vercel Cron after the evening boards ingest (see vercel.json).

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runSnapshot(request: Request): Promise<Response> {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ ok: false, error: "server_misconfigured" }, 500);

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const capturedOn = dayKey();
    const accounts = await readAllPaperAccounts(sb);

    // One price lookup per distinct ticker, shared across every account.
    const tickers = [...new Set(accounts.positions.map((p) => p.ticker))];
    const prices = await mapLimit(tickers, 6, (ticker) => valueTicker(ticker));
    const byTicker = new Map<string, (typeof prices)[number]>();
    tickers.forEach((ticker, i) => byTicker.set(ticker, prices[i]));

    const users = new Map<
      string,
      { cash: Record<string, number>; positions: ValuedPosition[] }
    >();
    for (const p of accounts.portfolios) {
      const entry = users.get(p.user_id) ?? { cash: {}, positions: [] };
      entry.cash[p.currency] = (entry.cash[p.currency] ?? 0) + p.cash;
      users.set(p.user_id, entry);
    }
    for (const p of accounts.positions) {
      const entry = users.get(p.user_id) ?? { cash: {}, positions: [] };
      const quote = byTicker.get(p.ticker);
      entry.positions.push({
        ticker: p.ticker,
        qty: p.qty,
        avg: p.avg_cost,
        board: quote?.price ?? null,
        asOf: quote?.asOf ?? null,
        delayed: quote?.delayed ?? true,
        currency: quote?.currency ?? exchangeForTicker(p.ticker)?.currency ?? "KES",
      });
      users.set(p.user_id, entry);
    }

    const rows: {
      user_id: string;
      currency: string;
      captured_on: string;
      total_value: number;
      cash: number;
      shares_value: number;
    }[] = [];
    let skippedCurrencies = 0;
    for (const [userId, account] of users) {
      const values = valueByCurrency(account.cash, account.positions);
      const currencies = new Set([
        ...Object.keys(account.cash),
        ...account.positions.map((p) => p.currency),
      ]);
      for (const currency of currencies) {
        const value = values[currency];
        if (!value || !Number.isFinite(value.total)) {
          skippedCurrencies += 1;
          continue;
        }
        rows.push({
          user_id: userId,
          currency,
          captured_on: capturedOn,
          total_value: Math.round(value.total * 100) / 100,
          cash: Math.round(value.cash * 100) / 100,
          shares_value: Math.round(value.shares * 100) / 100,
        });
      }
    }

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb
        .from("paper_portfolio_snapshots")
        .upsert(rows.slice(i, i + 500), {
          onConflict: "user_id,currency,captured_on",
        });
      if (error) {
        return json({ ok: false, error: "snapshot_write_failed" }, 500);
      }
    }

    return json({
      ok: true,
      capturedOn,
      accounts: users.size,
      rows: rows.length,
      skippedCurrencies,
    });
  } catch {
    return json({ ok: false, error: "snapshot_failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/snapshot-paper-portfolios")({
  server: {
    handlers: {
      // GET for Vercel Cron (it attaches the CRON_SECRET bearer); POST for
      // manual runs with the x-cron-secret header.
      GET: async ({ request }) => runSnapshot(request),
      POST: async ({ request }) => runSnapshot(request),
    },
  },
});
