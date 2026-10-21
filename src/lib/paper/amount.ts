/**
 * Amount-first trade planning for the layman Trade page (pure, no I/O).
 *
 * The paper engine only speaks whole shares (lib/paper/orders.ts), so the
 * Trade page asks "how much money?" and converts here: whole shares the
 * amount buys at the shown price, what they cost, and the leftover that
 * stays as cash. The server still re-reads the price and re-checks the
 * balance at fill time — this plan is a preview, never the authority.
 */

export interface AmountPlan {
  /** Whole shares the amount buys at `price` (0 when it buys none). */
  shares: number;
  /** shares × price, rounded to cents. */
  cost: number;
  /** amount − cost: what stays behind as cash, rounded to cents. */
  leftover: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const ZERO: AmountPlan = { shares: 0, cost: 0, leftover: 0 };

/**
 * Convert a money amount into a whole-share plan at a per-share price.
 * Non-positive or non-finite inputs plan nothing. A tiny epsilon guards
 * the floor against float dust (0.3 / 0.1 must buy 3 shares, not 2).
 */
export function sharesForAmount(amount: number, price: number): AmountPlan {
  if (!Number.isFinite(amount) || !Number.isFinite(price)) return ZERO;
  if (amount <= 0 || price <= 0) return ZERO;
  const shares = Math.floor(amount / price + 1e-9);
  if (shares <= 0) return { shares: 0, cost: 0, leftover: round2(amount) };
  const cost = round2(shares * price);
  return { shares, cost, leftover: round2(amount - cost) };
}

/**
 * Whole shares to sell when the holder names a money amount instead of a
 * count: what the amount covers at `price`, never more than they own.
 */
export function sellSharesForAmount(amount: number, price: number, owned: number): number {
  if (!Number.isFinite(owned) || owned <= 0) return 0;
  const { shares } = sharesForAmount(amount, price);
  return Math.min(shares, Math.floor(owned));
}
