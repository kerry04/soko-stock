// Macro signal math — pure functions, zero IO. Fully unit-tested in signals.test.ts.

export type BandState = "cold" | "target" | "warm" | "hot" | "crisis";

export interface CbrPoint {
  date: string;
  rate: number;
}

export interface CbrChangeEvent {
  date: string;
  from: number;
  to: number;
  deltaBps: number;
}

export interface FxPoint {
  date: string;
  value: number;
}

export interface FxShockResult {
  shocked: boolean;
  move: number | null;
  prev: number | null;
}

/**
 * Classify a YoY CPI reading against a central-bank target band.
 * Defaults are the CBK band (2.5%–7.5%).
 * "hot" starts 0.75pp below the ceiling; anything above the ceiling is "crisis".
 */
export function bandState(cpi: number, lower = 2.5, upper = 7.5): BandState {
  if (cpi < lower) return "cold";
  if (cpi > upper) return "crisis";
  if (cpi >= upper - 0.75) return "hot";
  if (cpi >= upper - 1.5) return "warm";
  return "target";
}

/**
 * Turn a rate history into the list of change events (most recent last),
 * sorted by date ascending regardless of input order. Unchanged readings
 * emit nothing.
 */
export function cbrChange(history: Array<CbrPoint>): Array<CbrChangeEvent> {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const events: CbrChangeEvent[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].rate;
    const to = sorted[i].rate;
    if (from !== to) {
      events.push({
        date: sorted[i].date,
        from,
        to,
        deltaBps: Math.round((to - from) * 100),
      });
    }
  }
  return events;
}

/**
 * Compare the last two points of an FX series. `move` is the percent change
 * of the latest value vs the previous one; `shocked` when |move| >= threshold.
 */
export function fxShock(series: Array<FxPoint>, thresholdPct = 1.5): FxShockResult {
  if (series.length < 2) return { shocked: false, move: null, prev: null };
  const prev = series[series.length - 2].value;
  const last = series[series.length - 1].value;
  if (prev === 0) return { shocked: false, move: null, prev };
  const move = ((last - prev) / prev) * 100;
  return { shocked: Math.abs(move) >= thresholdPct, move, prev };
}
