import { EXCHANGES } from "@/lib/stocks/exchanges";
import { getExchangeBoardRows, type BoardRow } from "@/lib/stocks/board-rows.server";
import { getNewsSignals } from "@/lib/stocks/news-signals.server";

/**
 * Screener engine — Fincept's screener pattern over data Soko Stock already
 * computes. Every screen is a predicate over a board row; there is no new
 * data source here. EOD listings (NSE/NGX/GSE) have no price history yet,
 * so technical screens honestly do not match them; their news-surge screen
 * is filled from the same 30-day matching the stock pages use.
 */

export type ScreenId =
  | "gainers"
  | "losers"
  | "limit-hits"
  | "52wk-high"
  | "52wk-low"
  | "rsi-oversold"
  | "rsi-overbought"
  | "volume-surge"
  | "news-surge"
  | "uptrend"
  | "downtrend";

export interface ScreenDef {
  id: ScreenId;
  label: string;
  hint: string;
}

export const SCREENS: ScreenDef[] = [
  { id: "news-surge", label: "News surge", hint: "24h stories ≥3× the 30-day daily pace, ≥3 stories" },
  { id: "volume-surge", label: "Unusual volume", hint: "Latest volume ≥2× the 20-day average" },
  { id: "52wk-high", label: "52-week high zone", hint: "Within 1% of the 52-week high" },
  { id: "52wk-low", label: "52-week low zone", hint: "Within 1% of the 52-week low" },
  { id: "rsi-oversold", label: "RSI oversold", hint: "RSI ≤ 30" },
  { id: "rsi-overbought", label: "RSI overbought", hint: "RSI ≥ 70" },
  { id: "gainers", label: "Big gainers", hint: "Day change ≥ +2%" },
  { id: "losers", label: "Big losers", hint: "Day change ≤ −2%" },
  { id: "limit-hits", label: "Limit hits", hint: "At the exchange's daily price band" },
  { id: "uptrend", label: "Above 50-day", hint: "Price above the 50-day average" },
  { id: "downtrend", label: "Below 50-day", hint: "Price below the 50-day average" },
];

type RowLike = Pick<
  BoardRow,
  "price" | "changePercent" | "wk52High" | "wk52Low" | "rsi" | "aboveSma50" | "relVolume" | "newsSurge" | "limitHit"
>;

/** Screen predicates — the single source the server counts with. */
export const SCREEN_MATCHERS: Record<ScreenId, (r: RowLike) => boolean> = {
  gainers: (r) => r.changePercent != null && r.changePercent >= 2,
  losers: (r) => r.changePercent != null && r.changePercent <= -2,
  "limit-hits": (r) => r.limitHit != null,
  "52wk-high": (r) => r.wk52High != null && r.price >= 0.99 * r.wk52High,
  "52wk-low": (r) => r.wk52Low != null && r.price <= 1.01 * r.wk52Low,
  "rsi-oversold": (r) => r.rsi != null && r.rsi <= 30,
  "rsi-overbought": (r) => r.rsi != null && r.rsi >= 70,
  "volume-surge": (r) => r.relVolume != null && r.relVolume >= 2,
  "news-surge": (r) => r.newsSurge != null,
  uptrend: (r) => r.aboveSma50 === true,
  downtrend: (r) => r.aboveSma50 === false,
};

export interface ScreenerRow extends BoardRow {
  exchange: string;
  currencySymbol: string;
  /** Screen ids this row currently matches. */
  screens: ScreenId[];
}

export interface ScreenerResult {
  rows: ScreenerRow[];
  screens: (ScreenDef & { count: number })[];
  /** Exchanges that failed to load, surfaced honestly on the page. */
  failedExchanges: string[];
  asOf: string;
}

export async function getScreener(): Promise<ScreenerResult> {
  const live = EXCHANGES.filter((e) => e.status === "live");
  const rows: ScreenerRow[] = [];
  const failedExchanges: string[] = [];

  for (const exchange of live) {
    let board;
    try {
      board = await getExchangeBoardRows(exchange.id);
    } catch {
      failedExchanges.push(exchange.id);
      continue;
    }

    // EOD rows skip news-surge on the board for speed; the screener wants
    // it, and the 30-day matcher is server-cached so this stays cheap.
    if (exchange.source === "africanfinancials" && board.rows.length > 0) {
      try {
        const signals = await getNewsSignals(
          board.rows.map((r) => ({ ticker: r.ticker, name: r.name })),
        );
        const byTicker = new Map(signals.map((s) => [s.ticker, s]));
        for (const r of board.rows) {
          r.newsSurge = byTicker.get(r.ticker)?.surgeRatio ?? null;
        }
      } catch {
        /* enrichment only */
      }
    }

    for (const r of board.rows) {
      rows.push({
        ...r,
        exchange: exchange.id,
        currencySymbol: exchange.currencySymbol,
        screens: SCREENS.filter((s) => SCREEN_MATCHERS[s.id](r)).map((s) => s.id),
      });
    }
  }

  const screens = SCREENS.map((s) => ({
    ...s,
    count: rows.filter((r) => r.screens.includes(s.id)).length,
  }));

  return { rows, screens, failedExchanges, asOf: new Date().toISOString() };
}
