/**
 * The one formatting library for the terminal.
 *
 * Every price, change, compact value and relative time in the app renders
 * through here so the numeric voice stays consistent: en-ZA grouping,
 * 2dp prices, signed 2dp percents, "just now / Nm / Nh / Nd" recency.
 * Pure functions — no React, no data access.
 */

/** Price with currency symbol prefix: `R1,234.56`, `KSh35.20`. */
export function fmtPrice(v: number, sym: string): string {
  return `${sym}${v.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Money that may be missing: null / non-finite renders as an em dash. */
export function fmtMoney(v: number | null, sym = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return fmtPrice(v, sym);
}

/** Compact value with currency symbol prefix: `KSh1.2M`, `R340K`. */
export function fmtCompactValue(v: number, sym: string): string {
  const c = new Intl.NumberFormat("en-ZA", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
  return `${sym}${c}`;
}

/** Signed percent change: `+1.23%`, `-0.45%`, `0.00%`; null renders `—`. */
export function fmtChange(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Relative recency for an ISO timestamp: `just now`, `5m ago`, `3h ago`, `2d ago`. */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}
