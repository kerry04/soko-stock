import { createClient } from "@supabase/supabase-js";
import {
  dayIndex,
  median,
  SURGE_MIN_ARTICLES,
  SURGE_MIN_RATIO,
  type NewsArticle,
} from "@/lib/stocks/news-signals.server";

/**
 * News Desk — the watch-the-wire surface. One read of the 30-day pipeline
 * headline window (same table the stock signals use), then desks: named
 * topic watches whose 24h story rate is compared against their own 30-day
 * daily median — the NEWS-surge deviation math, applied to topics instead
 * of tickers. No new scraping; clustered display is left to the pipeline's
 * canonical-events filter upstream.
 */

export interface DeskDef {
  id: string;
  label: string;
  hint: string;
  patterns: RegExp[];
}

export const DESKS: DeskDef[] = [
  {
    id: "rates",
    label: "Rates & CBK",
    hint: "Central bank, policy rate, monetary policy",
    patterns: [/central\s*bank/i, /\bcbk\b/i, /interest\s+rates?/i, /monetary\s+policy/i, /\bcbr\b/i],
  },
  {
    id: "fx",
    label: "Shilling & FX",
    hint: "KES, forex, dollar moves",
    patterns: [/shilling/i, /\bkes\b/i, /forex/i, /exchange\s+rate/i, /deprecia|apprecia/i],
  },
  {
    id: "fuel",
    label: "Fuel & energy",
    hint: "Pump prices, EPRA reviews, oil",
    patterns: [/\bfuel\b/i, /petrol/i, /diesel/i, /\bepra\b/i, /oil\s+prices?/i, /power\s+tariff/i],
  },
  {
    id: "banks",
    label: "Banks",
    hint: "Listed and regional banks",
    patterns: [/\bbanks?\b/i, /\bequity\b/i, /\bkcb\b/i, /co-?operative\s+bank/i, /stanbic/i, /absa/i, /ncba/i],
  },
  {
    id: "telecoms",
    label: "Telecoms & M-Pesa",
    hint: "Safaricom, M-Pesa, MTN, Airtel",
    patterns: [/safaricom/i, /m-?pesa/i, /\bmtn\b/i, /airtel/i, /vodacom/i, /telecom/i],
  },
  {
    id: "agri",
    label: "Agriculture",
    hint: "Tea, coffee, maize, sugar, food prices",
    patterns: [/\btea\b/i, /coffee/i, /maize/i, /sugar/i, /agricultur/i, /food\s+prices?/i, /drought/i],
  },
];

export interface DeskResult {
  id: string;
  label: string;
  hint: string;
  count24h: number;
  medianDaily: number;
  /** count24h ÷ max(medianDaily, 1) — set only when surging. */
  surgeRatio: number | null;
  surging: boolean;
  articles: NewsArticle[];
}

export interface NewsWireResult {
  /** Newest first, last 48 hours (cap 150). */
  articles: NewsArticle[];
  desks: DeskResult[];
  asOf: string;
}

const WINDOW_DAYS = 30;
const WIRE_HOURS = 48;
const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; result: NewsWireResult } | null = null;

function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function getNewsWire(): Promise<NewsWireResult> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;

  const since = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000).toISOString();
  const wireSince = new Date(Date.now() - WIRE_HOURS * 3600 * 1000).toISOString();
  const day24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const all: NewsArticle[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from("raw_news_data")
      .select("id,title,url,source,published_at,sentiment_score")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as NewsArticle[]));
    if ((data ?? []).length < PAGE) break;
  }

  const desks: DeskResult[] = DESKS.map((desk) => {
    const matched = all.filter((a) => desk.patterns.some((re) => re.test(a.title)));
    const dailyCounts = new Array<number>(WINDOW_DAYS).fill(0);
    for (const a of matched) {
      const i = dayIndex(a.published_at, WINDOW_DAYS);
      if (i >= 0 && i < WINDOW_DAYS) dailyCounts[i]++;
    }
    const count24h = matched.filter((a) => a.published_at >= day24).length;
    const medianDaily = median(dailyCounts);
    const ratio = count24h / Math.max(medianDaily, 1);
    const surging = count24h >= SURGE_MIN_ARTICLES && ratio >= SURGE_MIN_RATIO;
    return {
      id: desk.id,
      label: desk.label,
      hint: desk.hint,
      count24h,
      medianDaily: Math.round(medianDaily * 10) / 10,
      surgeRatio: surging ? Math.round(ratio * 10) / 10 : null,
      surging,
      articles: matched.filter((a) => a.published_at >= wireSince).slice(0, 40),
    };
  });

  const result: NewsWireResult = {
    articles: all.filter((a) => a.published_at >= wireSince).slice(0, 150),
    desks,
    asOf: new Date().toISOString(),
  };
  cache = { at: Date.now(), result };
  return result;
}
