import { createClient } from "@supabase/supabase-js";

/**
 * News-signal engine (Phase 4). All matching and counting is server-side,
 * on real pipeline headlines — nothing is invented.
 *
 * Matching: company names are reduced to distinctive keyword phrases
 * ("Standard Bank Group Limited" → /standard\W+bank/, never bare
 * "standard") so broad country/sector stories can't pollute a stock's page.
 * Signals: 24h article volume vs the 30-day daily median (surge at ≥3× and
 * ≥3 articles), and a 7-day positive-vs-negative sentiment tilt.
 */

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment_score: number | null;
}

export interface SentimentTilt {
  pos: number;
  neg: number;
  neu: number;
  unknown: number;
  /** positive | negative | mixed, or null when fewer than 3 scored articles. */
  tilt: "positive" | "negative" | "mixed" | null;
}

export interface TickerNewsSignal {
  ticker: string;
  keywords: string[];
  /** Linked articles in the last 24h. */
  count24h: number;
  /** Daily linked-article counts, oldest → newest, over the window. */
  dailyCounts: number[];
  medianDaily: number;
  /** count24h ÷ max(medianDaily, 1), one decimal — set only when surging. */
  surgeRatio: number | null;
  surging: boolean;
  sentiment7d: SentimentTilt;
  /** Linked articles from the last 7 days, newest first (cap 15). */
  articles: NewsArticle[];
  /** Newest linked article time, or null. */
  latestAt: string | null;
}

const STOP = new Set([
  "the", "a", "an", "and", "of", "group", "limited", "ltd", "holdings",
  "plc", "sa", "nv", "inc", "corp", "corporation", "company", "co", "ag",
  "sca", "pty", "investments", "investment", "properties", "property",
  "stores", "store",
]);

/**
 * Words that are too generic to ever identify a company on their own.
 * A name that reduces to one of these falls back to a multi-word phrase.
 */
const GENERIC = new Set([
  "standard", "price", "prices", "pick", "click", "clicks", "first", "new",
  "national", "united", "international", "global", "world", "continental",
  "financial", "finance", "capital", "bank", "banks", "banking", "american",
  "british", "africa", "african", "south", "resources", "energy", "mining",
  "metals", "foods", "food", "retail", "telecom", "communications", "insurance",
  "life", "general", "trust", "partners", "enterprise", "industries",
  "industrial", "consumer", "digital", "technology", "tech", "media",
  "tobacco", "platinum", "gold", "equity", "securities", "express",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Pick n Pay Stores Limited" → phrase regex matching "Pick n Pay". */
function phraseRegex(tokens: string[]): RegExp {
  return new RegExp(`\\b${tokens.map(escapeRegExp).join("\\W+")}\\b`, "i");
}

/**
 * Distinctive match phrases for a company name. Never returns a bare
 * generic word: "Standard Bank Group Limited" → ["standard bank"],
 * "Clicks Group Limited" → ["clicks group"], "Sasol Limited" → ["sasol"].
 */
export function stockKeywords(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Keep 1-char tokens inside phrases ("pick n pay"); only the
  // standalone shortcut requires length ≥ 3.
  const tokens = cleaned.filter((w) => !STOP.has(w));
  if (tokens.length === 0) return [];

  // One distinctive token: use it alone ("sasol", "vodacom", "naspers").
  if (
    tokens.length === 1 &&
    tokens[0].length >= 3 &&
    !GENERIC.has(tokens[0])
  ) {
    return [tokens[0]];
  }

  // Otherwise the full distinctive phrase ("standard bank", "pick n pay").
  const phraseTokens =
    tokens.length === 1
      ? cleaned.filter((w) => w.length > 1).slice(0, 2) // "equity group"
      : tokens;
  const phrases = [phraseTokens.join(" ")];

  // Plus any long, non-generic single token for recall
  // ("sibanye stillwater" also matches bare "sibanye").
  for (const t of tokens) {
    if (t.length >= 7 && !GENERIC.has(t) && !phrases.includes(t)) {
      phrases.push(t);
    }
  }
  return phrases;
}

/** Precompiled matchers for a set of keyword phrases. */
export function compileMatchers(keywords: string[]): RegExp[] {
  return keywords.map((k) => phraseRegex(k.split(" ")));
}

export function titleMatches(title: string, matchers: RegExp[]): boolean {
  return matchers.some((re) => re.test(title));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const SURGE_MIN_ARTICLES = 3;
export const SURGE_MIN_RATIO = 3;

function tiltOf(articles: NewsArticle[]): SentimentTilt {
  let pos = 0,
    neg = 0,
    neu = 0,
    unknown = 0;
  for (const a of articles) {
    const s = a.sentiment_score;
    if (s == null) unknown++;
    else if (s >= 0.2) pos++;
    else if (s <= -0.2) neg++;
    else neu++;
  }
  let tilt: SentimentTilt["tilt"] = null;
  if (pos + neg >= 3) {
    tilt = pos > neg * 1.5 ? "positive" : neg > pos * 1.5 ? "negative" : "mixed";
  }
  return { pos, neg, neu, unknown, tilt };
}

function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface TickerName {
  ticker: string;
  name: string;
}

const WINDOW_DAYS = 30;
const CACHE_MS = 30 * 60 * 1000; // news moves intraday; 30-min server cache

interface CacheEntry {
  at: number;
  signals: TickerNewsSignal[];
}
const cache = new Map<string, CacheEntry>();

/**
 * Compute news signals for a batch of tickers. One Supabase query for the
 * whole 30-day headline window, then pure JS matching — cheap enough to
 * run for a full board.
 */
export async function getNewsSignals(
  tickers: TickerName[],
): Promise<TickerNewsSignal[]> {
  const key = tickers
    .map((t) => t.ticker)
    .sort()
    .join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.signals;

  const since = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000).toISOString();
  const day24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const day7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  // PostgREST caps a single response at 1000 rows — paginate the window.
  const articles: NewsArticle[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from("raw_news_data")
      .select("id,title,url,source,published_at,sentiment_score")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    articles.push(...((data ?? []) as NewsArticle[]));
    if ((data ?? []).length < PAGE) break;
  }

  // Day buckets: index 0 = oldest day, index 29 = today.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayIndex = (iso: string) => {
    const d = Math.floor(
      (dayStart.getTime() - new Date(iso).getTime()) / 86400000,
    );
    return WINDOW_DAYS - 1 - d;
  };

  const signals: TickerNewsSignal[] = tickers.map(({ ticker, name }) => {
    const keywords = stockKeywords(name);
    const matchers = compileMatchers(keywords);
    const linked = articles.filter((a) => titleMatches(a.title, matchers));

    const dailyCounts = new Array<number>(WINDOW_DAYS).fill(0);
    for (const a of linked) {
      const i = dayIndex(a.published_at);
      if (i >= 0 && i < WINDOW_DAYS) dailyCounts[i]++;
    }
    const count24h = linked.filter((a) => a.published_at >= day24).length;
    const medianDaily = median(dailyCounts);
    const ratio = count24h / Math.max(medianDaily, 1);
    const surging =
      count24h >= SURGE_MIN_ARTICLES && ratio >= SURGE_MIN_RATIO;

    const last7 = linked
      .filter((a) => a.published_at >= day7)
      .slice(0, 15);

    return {
      ticker,
      keywords,
      count24h,
      dailyCounts,
      medianDaily: Math.round(medianDaily * 10) / 10,
      surgeRatio: surging ? Math.round(ratio * 10) / 10 : null,
      surging,
      sentiment7d: tiltOf(last7),
      articles: last7,
      latestAt: linked[0]?.published_at ?? null,
    };
  });

  cache.set(key, { at: Date.now(), signals });
  return signals;
}
