/**
 * What a real NSE trade costs, in shillings — the fee stack charged on top
 * of the share price, per the trading-pivot research brief (2026-10-21).
 *
 * The levies are fixed by the market, not the broker: CMA transaction levy
 * 0.12% + NSE transaction levy 0.12% + CDSC transaction levy 0.08% +
 * CMA/CDSC guarantee funds 0.02% = 0.34% of the trade value, on every buy
 * and every sell. Brokerage is negotiated per broker — typically 1.5%–2.1%
 * for a retail client — so it is always shown here as a range, never a
 * single invented figure. Stamp duty is a flat KSh 2 per KSh 10,000 traded
 * (or part of it), which is why it bites hardest on tiny trades.
 *
 * Pure functions — no React, no data access. Estimates, not quotes: the
 * exact brokerage line is whatever your broker charges.
 */

/** Fixed market levies: 0.34% of trade value. */
export const LEVY_RATE = 0.0034;
/** The split inside LEVY_RATE, for display: regulator + exchange + depository + safety funds. */
export const LEVY_SPLIT = [
  { label: "CMA levy", pct: 0.12 },
  { label: "NSE levy", pct: 0.12 },
  { label: "CDSC levy", pct: 0.08 },
  { label: "Guarantee funds", pct: 0.02 },
] as const;

/** Typical retail brokerage range, per the research brief. */
export const BROKERAGE_LOW = 0.015;
export const BROKERAGE_HIGH = 0.021;
/** Midpoint of the typical range — used for a single "about" figure. */
export const BROKERAGE_MID = (BROKERAGE_LOW + BROKERAGE_HIGH) / 2;

/** Stamp duty: KSh 2 per KSh 10,000 traded, or part of it. */
export const STAMP_DUTY_PER = 10_000;
export const STAMP_DUTY_FEE = 2;

export interface RealCostEstimate {
  /** Trade value the estimate was computed on (clamped at 0). */
  amount: number;
  /** Fixed levies at 0.34%. */
  levies: number;
  /** Flat stamp duty. */
  stampDuty: number;
  /** Brokerage at the low / high / mid of the typical range. */
  brokerageLow: number;
  brokerageHigh: number;
  brokerageMid: number;
  /** levies + stamp duty + brokerage, at the low / high / mid brokerage. */
  totalLow: number;
  totalHigh: number;
  totalMid: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Stamp duty for a trade value: KSh 2 per KSh 10,000 or part of it. */
export function stampDutyFor(amount: number): number {
  if (!(amount > 0)) return 0;
  return Math.ceil(amount / STAMP_DUTY_PER) * STAMP_DUTY_FEE;
}

/** Full fee estimate for one real NSE trade of `amount` shillings. */
export function estimateRealCost(amount: number): RealCostEstimate {
  const a = amount > 0 && Number.isFinite(amount) ? amount : 0;
  const levies = round2(a * LEVY_RATE);
  const stampDuty = stampDutyFor(a);
  const brokerageLow = round2(a * BROKERAGE_LOW);
  const brokerageHigh = round2(a * BROKERAGE_HIGH);
  const brokerageMid = round2(a * BROKERAGE_MID);
  return {
    amount: a,
    levies,
    stampDuty,
    brokerageLow,
    brokerageHigh,
    brokerageMid,
    totalLow: round2(levies + stampDuty + brokerageLow),
    totalHigh: round2(levies + stampDuty + brokerageHigh),
    totalMid: round2(levies + stampDuty + brokerageMid),
  };
}
