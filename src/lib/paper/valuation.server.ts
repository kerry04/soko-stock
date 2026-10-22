import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuote } from "@/lib/stocks/yahoo.server";
import { getDBQuote } from "@/lib/stocks/boards-db.server";
import {
  exchangeForTicker,
  mapLimit,
  type PaperLedger,
  type RawPositionRow,
  type TickerValue,
  type ValuedPosition,
} from "@/lib/paper/valuation";

/**
 * Server-side paper valuation. Prices come from the same source as fills:
 * Yahoo for JSE listings, stock_boards for end-of-day listings. A missing
 * price is never guessed. Pure maths lives in valuation.ts.
 */

/** Latest price for one ticker, in display currency. Null when unavailable. */
export async function valueTicker(ticker: string): Promise<TickerValue | null> {
  const ex = exchangeForTicker(ticker);
  try {
    if (ex?.source === "yahoo") {
      const q = await getQuote(ticker, "5d", "1d");
      if (!q || q.price == null) return null;
      return {
        price: q.price / ex.divisor,
        asOf: q.asOf,
        delayed: false,
        currency: ex.currency,
      };
    }
    const row = await getDBQuote(ticker);
    if (!row) return null;
    return {
      price: Number(row.price),
      asOf: row.fetched_at,
      delayed: true,
      currency: ex?.currency ?? "KES",
    };
  } catch {
    return null;
  }
}

const PAGE = 1000;

async function fetchAll<T>(
  sb: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * The signed-in account's ledger, with every position valued at today's
 * price. The 50 newest orders ride along for the activity list.
 */
export async function readPaperLedger(
  sb: SupabaseClient,
  userId: string,
): Promise<PaperLedger> {
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

  const raw = ((poss ?? []) as RawPositionRow[]).map((p) => ({
    ticker: p.ticker,
    qty: Number(p.qty),
    avg: Number(p.avg_cost),
    currency: exchangeForTicker(p.ticker)?.currency ?? "KES",
  }));
  const values = await mapLimit(raw, 6, (p) => valueTicker(p.ticker));

  const positions: ValuedPosition[] = raw.map((p, i) => {
    const v = values[i];
    return {
      ticker: p.ticker,
      qty: p.qty,
      avg: p.avg,
      board: v?.price ?? null,
      asOf: v?.asOf ?? null,
      delayed: v?.delayed ?? exchangeForTicker(p.ticker)?.source !== "yahoo",
      currency: v?.currency ?? p.currency,
    };
  });

  return {
    cash: Object.fromEntries(
      ((pfs ?? []) as { currency: string; cash: number }[]).map((r) => [
        r.currency,
        Number(r.cash),
      ]),
    ),
    positions,
    orders: (ords ?? []) as PaperLedger["orders"],
  };
}

export interface SnapshotRow {
  currency: string;
  captured_on: string;
  total_value: number;
  cash: number;
  shares_value: number;
}

/** Read stored history for one account. A missing table (migration not
 *  applied) degrades to no history rather than breaking the portfolio. */
export async function readPortfolioHistory(
  sb: SupabaseClient,
  userId: string,
): Promise<SnapshotRow[]> {
  try {
    const { data, error } = await sb
      .from("paper_portfolio_snapshots")
      .select("currency, captured_on, total_value, cash, shares_value")
      .eq("user_id", userId)
      .order("captured_on");
    if (error) return [];
    return ((data ?? []) as SnapshotRow[]).map((r) => ({
      currency: r.currency,
      captured_on: r.captured_on,
      total_value: Number(r.total_value),
      cash: Number(r.cash),
      shares_value: Number(r.shares_value),
    }));
  } catch {
    return [];
  }
}

/** Every portfolio row, position row and the prices they need, for the
 *  daily snapshot hook. Paged so a large account list is never truncated. */
export async function readAllPaperAccounts(sb: SupabaseClient): Promise<{
  portfolios: { user_id: string; currency: string; cash: number }[];
  positions: (RawPositionRow & { user_id: string })[];
}> {
  const portfolios = await fetchAll<{ user_id: string; currency: string; cash: number }>(
    sb,
    "paper_portfolios",
    "user_id, currency, cash",
  );
  const positions = await fetchAll<RawPositionRow & { user_id: string }>(
    sb,
    "paper_positions",
    "user_id, ticker, qty, avg_cost",
  );
  return {
    portfolios: portfolios.map((p) => ({
      user_id: p.user_id,
      currency: p.currency,
      cash: Number(p.cash),
    })),
    positions: positions.map((p) => ({
      user_id: p.user_id,
      ticker: p.ticker,
      qty: Number(p.qty),
      avg_cost: Number(p.avg_cost),
    })),
  };
}
