/**
 * Yahoo Finance proxy (server-only). Browsers can't call Yahoo directly
 * (no CORS), so the terminal fetches through here.
 *
 * Free, no key. JSE equities quote in ZAc (cents) — conversion to Rand
 * happens in the exchange definition (divisor).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

/** 52-week high/low changes once a day — cache it long and separately. */
const WK52_TTL_MS = 12 * 60 * 60 * 1000;
const wk52Cache = new Map<string, { at: number; data: { high: number; low: number } | null }>();

export interface Wk52Stats {
  high: number;
  low: number;
}

export type TechLabel = "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";

export interface Technicals {
  rsi: number;
  rsiState: "Overbought" | "Oversold" | "Neutral";
  sma50: number;
  sma200: number;
  aboveSma50: boolean;
  aboveSma200: boolean;
  /** sma50 > sma200 (golden-cross regime) vs below (death-cross regime). */
  goldenCross: boolean;
  macdBullish: boolean;
  votes: { rsi: number; macd: number; vs50: number; vs200: number; cross: number };
  /** Average vote, -1..1. */
  composite: number;
  label: TechLabel;
  /** Latest volume ÷ 20-day average (prior 20 sessions). Null without history. */
  relVolume: number | null;
  barsUsed: number;
}

function smaOf(vals: number[], n: number): number {
  const s = vals.slice(-n);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function emaSeries(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(vals.length);
  let e = vals[0];
  for (let i = 0; i < vals.length; i++) {
    e = i === 0 ? vals[0] : vals[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

/** Wilder's RSI over the full series — needs real history, not a window. */
function rsiWilder(closes: number[], period = 14): number {
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function computeTechnicals(closes: number[], volumes: (number | null)[]): Technicals {
  const price = closes[closes.length - 1];
  const rsi = rsiWilder(closes, 14);
  const sma50 = smaOf(closes, 50);
  const sma200 = smaOf(closes, 200);

  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signal = emaSeries(macdLine, 9);
  const macdBullish = macdLine[macdLine.length - 1] > signal[signal.length - 1];

  const aboveSma50 = price > sma50;
  const aboveSma200 = price > sma200;
  const goldenCross = sma50 > sma200;

  // Unusual volume: latest session vs the average of the prior 20.
  let relVolume: number | null = null;
  const latest = volumes[volumes.length - 1];
  const prior = volumes
    .slice(-21, -1)
    .filter((v): v is number => v != null && v > 0);
  if (latest != null && latest > 0 && prior.length >= 20) {
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (avg > 0) relVolume = latest / avg;
  }

  const votes = {
    rsi: rsi >= 70 ? -1 : rsi <= 30 ? 1 : 0,
    macd: macdBullish ? 1 : -1,
    vs50: aboveSma50 ? 1 : -1,
    vs200: aboveSma200 ? 1 : -1,
    cross: goldenCross ? 1 : -1,
  };
  const composite = (votes.rsi + votes.macd + votes.vs50 + votes.vs200 + votes.cross) / 5;
  const label: TechLabel =
    composite >= 0.6
      ? "Strong Buy"
      : composite >= 0.2
        ? "Buy"
        : composite > -0.2
          ? "Neutral"
          : composite > -0.6
            ? "Sell"
            : "Strong Sell";

  return {
    rsi,
    rsiState: rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral",
    sma50,
    sma200,
    aboveSma50,
    aboveSma200,
    goldenCross,
    macdBullish,
    votes,
    composite,
    label,
    relVolume,
    barsUsed: closes.length,
  };
}

/** Technical signals from real daily history. Long-TTL cached like 52wk. */
const TECH_TTL_MS = 12 * 60 * 60 * 1000;
const techCache = new Map<string, { at: number; data: Technicals | null }>();

export async function getTechnicals(ticker: string): Promise<Technicals | null> {
  const hit = techCache.get(ticker);
  if (hit && Date.now() - hit.at < TECH_TTL_MS) return hit.data;

  let t: Technicals | null = null;
  try {
    const q = await getQuote(ticker, "1y", "1d");
    const bars = q?.bars ?? [];
    const closes = bars.map((b) => b.c).filter((c): c is number => c != null);
    // SMA(200) is the hungriest indicator — require it, or say nothing.
    if (closes.length >= 200) t = computeTechnicals(closes, bars.map((b) => b.v));
  } catch {
    t = null;
  }
  techCache.set(ticker, { at: Date.now(), data: t });
  return t;
}

/**
 * 52-week high/low from 1y daily bars. Long-TTL cached: the board calls
 * this per ticker, and the numbers only move once per trading day.
 * Returns null when history is unavailable — callers must handle the
 * honest empty state, never fabricate.
 */
export async function get52wkStats(ticker: string): Promise<Wk52Stats | null> {
  const hit = wk52Cache.get(ticker);
  if (hit && Date.now() - hit.at < WK52_TTL_MS) return hit.data;

  let stats: Wk52Stats | null = null;
  try {
    const q = await getQuote(ticker, "1y", "1d");
    const highs = (q?.bars ?? []).map((b) => b.h ?? b.c).filter((v): v is number => v != null);
    const lows = (q?.bars ?? []).map((b) => b.l ?? b.c).filter((v): v is number => v != null);
    if (highs.length >= 50 && lows.length >= 50) {
      stats = { high: Math.max(...highs), low: Math.min(...lows) };
    }
  } catch {
    stats = null;
  }
  wk52Cache.set(ticker, { at: Date.now(), data: stats });
  return stats;
}

export interface PriceBar {
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

export interface Quote {
  ticker: string;
  name: string;
  currency: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  asOf: string;
  bars: PriceBar[];
}

interface YahooChartResult {
  meta?: {
    symbol?: string;
    longName?: string;
    shortName?: string;
    currency?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

async function fetchChart(
  ticker: string,
  range: string,
  interval: string,
): Promise<YahooChartResult | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { chart?: { result?: YahooChartResult[] } };
  const result = json.chart?.result?.[0];
  return result ?? null;
}

export async function getQuote(
  ticker: string,
  range = "5d",
  interval = "1d",
): Promise<Quote | null> {
  const key = `${ticker}|${range}|${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as Quote;

  const r = await fetchChart(ticker, range, interval);
  const meta = r?.meta;
  if (!r || !meta || meta.regularMarketPrice == null) return null;

  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0];
  const bars: PriceBar[] = ts.map((t, i) => ({
    t: t * 1000,
    o: q?.open?.[i] ?? null,
    h: q?.high?.[i] ?? null,
    l: q?.low?.[i] ?? null,
    c: q?.close?.[i] ?? null,
    v: q?.volume?.[i] ?? null,
  }));

  // Change vs previous close: prefer the last two daily closes.
  const closes = bars.map((b) => b.c).filter((c): c is number => c != null);
  const price = closes.length > 0 ? closes[closes.length - 1] : meta.regularMarketPrice;
  const prev =
    closes.length > 1
      ? closes[closes.length - 2]
      : (meta.chartPreviousClose ?? meta.previousClose ?? null);
  const change = prev != null ? price - prev : null;
  const changePercent = prev != null && prev !== 0 ? (change! / prev) * 100 : null;

  const quote: Quote = {
    ticker: meta.symbol ?? ticker,
    name: meta.longName || meta.shortName || ticker,
    currency: meta.currency ?? "",
    price,
    previousClose: prev,
    change,
    changePercent,
    asOf: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    bars,
  };
  cache.set(key, { at: Date.now(), data: quote });
  return quote;
}

/** Bounded-parallel map for the board fan-out. */
export async function getBoard(tickers: string[]): Promise<(Quote | null)[]> {
  const results: (Quote | null)[] = new Array(tickers.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(6, tickers.length) }, async () => {
    while (i < tickers.length) {
      const idx = i++;
      try {
        results[idx] = await getQuote(tickers[idx], "5d", "1d");
      } catch {
        results[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}
