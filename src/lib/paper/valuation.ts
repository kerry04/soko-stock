import { EXCHANGE_BY_ID, type Exchange } from "@/lib/stocks/exchanges";

/**
 * Pure valuation types and maths for the paper ledger. Server-only reads
 * and price lookups live in valuation.server.ts; this file has no I/O.
 */

export interface PaperOrderRow {
  ticker: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  fill_price: number;
  as_of: string;
  created_at: string;
}

export interface RawPositionRow {
  ticker: string;
  qty: number;
  avg_cost: number;
}

export interface ValuedPosition {
  ticker: string;
  qty: number;
  avg: number;
  board: number | null;
  asOf: string | null;
  delayed: boolean;
  currency: string;
}

export interface PaperLedger {
  cash: Record<string, number>;
  positions: ValuedPosition[];
  orders: PaperOrderRow[];
}

export interface TickerValue {
  price: number;
  asOf: string | null;
  delayed: boolean;
  currency: string;
}

/** One portfolio value, split the way the snapshots table stores it. */
export interface CurrencyValue {
  total: number;
  cash: number;
  shares: number;
}

/** One history point in the portfolio response. `current` marks the live
 *  point appended for today; stored daily points are `current: false`. */
export interface PortfolioHistoryPoint {
  currency: string;
  date: string;
  total: number;
  cash: number;
  shares: number;
  current: boolean;
}

/** Which exchange a ticker belongs to: pinned JSE names first, then suffix. */
export function exchangeForTicker(ticker: string): Exchange | undefined {
  const pinned = Object.values(EXCHANGE_BY_ID).find((e) => e.tickers.includes(ticker));
  if (pinned) return pinned;
  const m = ticker.match(/\.([A-Z]+)$/);
  return m ? EXCHANGE_BY_ID[m[1]] : undefined;
}

/** Bounded-parallel map. A failed item resolves to undefined, never throws. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Cash plus priced shares per currency, split into total, cash and shares.
 * A currency with even one unpriced holding is omitted — a total that
 * silently leaves a position out is a wrong number, not an estimate.
 */
export function valueByCurrency(
  cash: Record<string, number>,
  positions: ValuedPosition[],
): Record<string, CurrencyValue> {
  const out: Record<string, CurrencyValue> = {};
  for (const [currency, amount] of Object.entries(cash)) {
    out[currency] = { total: amount, cash: amount, shares: 0 };
  }
  const unpriced = new Set<string>();
  for (const p of positions) {
    if (p.board == null) {
      unpriced.add(p.currency);
      continue;
    }
    if (unpriced.has(p.currency)) continue;
    const row = out[p.currency] ?? { total: 0, cash: 0, shares: 0 };
    const shares = p.board * p.qty;
    row.shares += shares;
    row.total += shares;
    out[p.currency] = row;
  }
  for (const currency of unpriced) delete out[currency];
  return out;
}

/** UTC calendar day — the same day key the snapshot cron writes. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
