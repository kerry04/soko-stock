import { createClient } from "@supabase/supabase-js";
import { isMarketRelevant } from "@/lib/news/relevance";
import { dedupeByTitle } from "@/lib/news/dedupe";

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

// Matcher engine lives in lib/news/matching (shared with the client);
// re-exported here so existing server imports keep working.
import { stockKeywords, compileMatchers, titleMatches } from "@/lib/news/matching";
export { stockKeywords, compileMatchers, titleMatches };

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Day-bucket index over a trailing window: 0 = oldest day, days−1 = today.
 *  Both timestamps are normalized to UTC calendar dates first — flooring
 *  raw elapsed time from UTC midnight pushed same-day articles out of
 *  range and shifted yesterday's stories into the "today" bucket. */
export function dayIndex(iso: string, days: number, now = new Date()): number {
  const DAY_MS = 86400000;
  const utcDayStart = (t: Date) =>
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const d = Math.round((utcDayStart(now) - utcDayStart(new Date(iso))) / DAY_MS);
  return days - 1 - d;
}

export const SURGE_MIN_ARTICLES = 3;
export const SURGE_MIN_RATIO = 3;
export { median };

export function tiltOf(articles: NewsArticle[]): SentimentTilt {
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
  // Names are part of the key: a corrected company name must not be
  // served the previous name's signals for the rest of the TTL.
  const key = tickers
    .map((t) => `${t.ticker}:${t.name}`)
    .sort()
    .join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.signals;

  const since = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000).toISOString();
  const day24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const day7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  // PostgREST caps a single response at 1000 rows — paginate the window.
  let articles: NewsArticle[] = [];
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

  // A brand mention in an entertainment story is not a news signal.
  articles = articles.filter((a) => isMarketRelevant(a.title));
  articles = dedupeByTitle(articles);

  // Day buckets: index 0 = oldest day, index 29 = today.
  const dayIndexFor = (iso: string) => dayIndex(iso, WINDOW_DAYS);

  const signals: TickerNewsSignal[] = tickers.map(({ ticker, name }) => {
    const keywords = stockKeywords(name);
    const matchers = compileMatchers(keywords);
    const linked = articles.filter((a) => titleMatches(a.title, matchers));

    const dailyCounts = new Array<number>(WINDOW_DAYS).fill(0);
    for (const a of linked) {
      const i = dayIndexFor(a.published_at);
      if (i >= 0 && i < WINDOW_DAYS) dailyCounts[i]++;
    }
    const count24h = linked.filter((a) => a.published_at >= day24).length;
    const medianDaily = median(dailyCounts);
    const ratio = count24h / Math.max(medianDaily, 1);
    const surging =
      count24h >= SURGE_MIN_ARTICLES && ratio >= SURGE_MIN_RATIO;

    // Sentiment is computed over the FULL eligible 7-day window; only the
    // displayed article list is capped.
    const last7All = linked.filter((a) => a.published_at >= day7);
    const last7 = last7All.slice(0, 15);

    return {
      ticker,
      keywords,
      count24h,
      dailyCounts,
      medianDaily: Math.round(medianDaily * 10) / 10,
      surgeRatio: surging ? Math.round(ratio * 10) / 10 : null,
      surging,
      sentiment7d: tiltOf(last7All),
      articles: last7,
      latestAt: linked[0]?.published_at ?? null,
    };
  });

  cache.set(key, { at: Date.now(), signals });
  return signals;
}
