/**
 * Pure maths for the Globe's practice-value chart. History is one point
 * per currency per day; the portfolio endpoint appends today's live point
 * with `current: true`. Ranges, change-since-first and scrubbing live here
 * so the chart component only renders numbers this module produced.
 */

import type { PortfolioHistoryPoint } from "@/lib/paper/valuation";

export interface ValuePoint {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  total: number;
}

export const VALUE_RANGES = [
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
] as const;

export type ValueRangeId = (typeof VALUE_RANGES)[number]["id"];

const DAY_MS = 86_400_000;

/** Normalize a date/ISO string/date column to a UTC YYYY-MM-DD key. */
export function dayOf(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

/**
 * One currency's series, oldest first. A current point wins over a stored
 * snapshot for the same day. Rows with a non-finite total are dropped
 * rather than plotted as zero.
 */
export function seriesForCurrency(
  history: PortfolioHistoryPoint[],
  currency: string,
): ValuePoint[] {
  const byDate = new Map<string, { total: number; current: boolean }>();
  for (const row of history) {
    if (row.currency !== currency) continue;
    const total = Number(row.total);
    if (!Number.isFinite(total)) continue;
    const date = dayOf(row.date);
    const prev = byDate.get(date);
    if (!prev || row.current || !prev.current) byDate.set(date, { total, current: row.current });
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({ date, total: row.total }));
}

/** Cut-off day for a range, anchored on the newest point in the series. */
export function rangeStartDay(lastDate: string, range: ValueRangeId): string | null {
  if (range === "all") return null;
  const meta = VALUE_RANGES.find((r) => r.id === range);
  if (!meta || meta.days == null) return null;
  const d = new Date(`${dayOf(lastDate)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getTime() - meta.days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Points inside the chosen range, inclusive of the cut-off day. Ranges
 * are anchored on the newest point, not the wall clock, so a series that
 * ends yesterday still shows a full month rather than an empty chart.
 */
export function pointsInRange(points: ValuePoint[], range: ValueRangeId): ValuePoint[] {
  if (points.length === 0) return [];
  const start = rangeStartDay(points[points.length - 1].date, range);
  if (start == null) return points;
  return points.filter((p) => p.date >= start);
}

export interface SeriesChange {
  amount: number;
  percent: number | null;
  from: ValuePoint;
  to: ValuePoint;
}

/** Change from the first point in the chosen range to the last. */
export function changeSinceStart(points: ValuePoint[]): SeriesChange | null {
  if (points.length < 2) return null;
  const from = points[0];
  const to = points[points.length - 1];
  const amount = Math.round((to.total - from.total) * 100) / 100;
  const percent =
    from.total > 0 ? Math.round(((to.total - from.total) / from.total) * 10000) / 100 : null;
  return { amount, percent, from, to };
}

/** Index for a pointer position across the chart (0…1). */
export function scrubIndex(fraction: number, count: number): number {
  if (count <= 1) return 0;
  if (!Number.isFinite(fraction)) return count - 1;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(clamped * (count - 1));
}

/** Keyboard step: left/right moves one point and never wraps. */
export function stepScrub(index: number, delta: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}

/** Readable day for the scrub readout: `20 Oct 2026`. */
export function formatValueDay(date: string): string {
  const d = new Date(`${dayOf(date)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
