import { createClient } from "@supabase/supabase-js";
import { isMarketRelevant } from "@/lib/news/relevance";
import { dedupeByTitle } from "@/lib/news/dedupe";
import { pickLeadStory } from "@/lib/news/lead";
import {
  getWorldArticles,
  mergeWireArticlesTagged,
  buildRegionDesksFromMerged,
  type WorldArticle,
} from "@/lib/news/world-feeds.server";
import { EXCHANGES } from "@/lib/stocks/exchanges";
import { getDBBoard } from "@/lib/stocks/boards-db.server";
import { getExchangeBoardRows } from "@/lib/stocks/board-rows.server";
import {
  compileMatchers,
  stockKeywords,
  tiltOf,
  titleMatches,
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
  {
    id: "results",
    label: "Results & Dividends",
    hint: "Earnings, profit warnings, dividend declarations",
    patterns: [
      /dividend/i,
      /profit\s+warning/i,
      /net\s+profit/i,
      /profit\s+after\s+tax/i,
      /profit\s+(rises|jumps|surges|drops|falls|grows)/i,
      /earnings\s+(rise|jump|fall|drop)/i,
      /(half|full)[-\s]year\s+results/i,
      /quarterly\s+results/i,
      /posts\s+(a\s+)?(profit|loss)/i,
      /loss\s+(widens|narrows)/i,
    ],
  },
  {
    id: "policy",
    label: "Policy & Regulation",
    hint: "CMA, regulators, treasury and market rules",
    patterns: [
      /capital\s+markets\s+authority/i,
      /\bcma\b/i,
      /regulat(or|ion|ory)/i,
      /\btreasury\b/i,
      /finance\s+bill/i,
      /rate\s+(cut|hike)/i,
      /\bsec\s+approves\b/i,
      /gazette/i,
    ],
  },
];

export interface DeskResult {
  id: string;
  label: string;
  hint: string;
  count24h: number;
  /** Stories on this desk inside the 48h wire window — the window the
   *  desk's article list is drawn from, so the count a reader sees next
   *  to the desk name never disagrees with the list under it. */
  countWindow: number;
  medianDaily: number;
  /** count24h ÷ max(medianDaily, 1) — set only when surging. */
  surgeRatio: number | null;
  surging: boolean;
  articles: NewsArticle[];
}

export interface HeatItem {
  ticker: string;
  name: string;
  /** Stories in the last 24h mentioning this company. */
  count24h: number;
  /** count24h ÷ 30-day daily median — set only when surging. */
  surgeRatio: number | null;
  surging: boolean;
  /** 7-day headline sentiment tilt. */
  tilt: "positive" | "negative" | "mixed" | null;
}

export interface NewsWireResult {
  /** Newest first, last 48 hours — pipeline + world feeds (cap 300). */
  articles: NewsArticle[];
  /** The lead story, picked server-side in tiers (see lib/news/lead):
   *  a qualifying pipeline story first, then a market-relevant story
   *  from the world merge, then the newest pipeline story. Null only
   *  when both wires are empty. */
  lead: NewsArticle | null;
  desks: DeskResult[];
  /** Most-covered listed companies in the last 24h (top 8). */
  heat: HeatItem[];
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
  const day7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  let all: NewsArticle[] = [];
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

  // Terminal read of the shared firehose: market-moving stories only.
  all = all.filter((a) => isMarketRelevant(a.title));
  all = dedupeByTitle(all);

  const desks: DeskResult[] = DESKS.map((desk) => {
    const matched = all.filter((a) => desk.patterns.some((re) => re.test(a.title)));
    const dailyCounts = new Array<number>(WINDOW_DAYS).fill(0);
    for (const a of matched) {
      const i = dayIndex(a.published_at, WINDOW_DAYS);
      if (i >= 0 && i < WINDOW_DAYS) dailyCounts[i]++;
    }
    const count24h = matched.filter((a) => a.published_at >= day24).length;
    const countWindow = matched.filter((a) => a.published_at >= wireSince).length;
    const medianDaily = median(dailyCounts);
    const ratio = count24h / Math.max(medianDaily, 1);
    const surging = count24h >= SURGE_MIN_ARTICLES && ratio >= SURGE_MIN_RATIO;
    return {
      id: desk.id,
      label: desk.label,
      hint: desk.hint,
      count24h,
      countWindow,
      medianDaily: Math.round(medianDaily * 10) / 10,
      surgeRatio: surging ? Math.round(ratio * 10) / 10 : null,
      surging,
      articles: matched.filter((a) => a.published_at >= wireSince).slice(0, 40),
    };
  });

  // Company heat over the same filtered window: which listed names the
  // wire is actually talking about, with surge + sentiment context.
  const companies: { ticker: string; name: string }[] = [];
  for (const ex of EXCHANGES) {
    if (ex.source !== "africanfinancials" || ex.status !== "live") continue;
    try {
      const rows = await getDBBoard(ex.id);
      for (const r of rows) companies.push({ ticker: r.ticker, name: r.name });
    } catch {
      /* heat is enrichment — a failed board never breaks the wire */
    }
  }
  try {
    const jse = await getExchangeBoardRows("JSE");
    for (const r of jse.rows) companies.push({ ticker: r.ticker, name: r.name });
  } catch {
    /* enrichment only */
  }

  const heat: HeatItem[] = companies
    .map((c) => {
      const matchers = compileMatchers(stockKeywords(c.name));
      const matched = all.filter((a) => titleMatches(a.title, matchers));
      const count24h = matched.filter((a) => a.published_at >= day24).length;
      if (count24h === 0) return null;
      const dailyCounts = new Array<number>(WINDOW_DAYS).fill(0);
      for (const a of matched) {
        const i = dayIndex(a.published_at, WINDOW_DAYS);
        if (i >= 0 && i < WINDOW_DAYS) dailyCounts[i]++;
      }
      const medianDaily = median(dailyCounts);
      const ratio = count24h / Math.max(medianDaily, 1);
      const surging = count24h >= SURGE_MIN_ARTICLES && ratio >= SURGE_MIN_RATIO;
      return {
        ticker: c.ticker,
        name: c.name,
        count24h,
        surgeRatio: surging ? Math.round(ratio * 10) / 10 : null,
        surging,
        tilt: tiltOf(matched.filter((a) => a.published_at >= day7)).tilt,
      } satisfies HeatItem;
    })
    .filter((h): h is HeatItem => h != null)
    .sort((a, b) => b.count24h - a.count24h || (b.surgeRatio ?? 0) - (a.surgeRatio ?? 0))
    .slice(0, 8);

  // World layer: African + international outlets read from public feeds
  // (lib/news/world-feeds.server). Merged in HERE only — after the desks
  // and heat above were computed from pipeline data alone, so world items
  // never feed per-stock signals or company heat. A world-layer failure
  // degrades to the pipeline wire on its own; it never breaks this read.
  let world: WorldArticle[] = [];
  try {
    world = await getWorldArticles();
  } catch {
    world = [];
  }

  const pipelineSlice = all.filter((a) => a.published_at >= wireSince).slice(0, 150);

  // Region desks are counted over the merged wire itself, not the raw
  // feed fetch — a desk count must never exceed the wire it belongs to.
  const merged = mergeWireArticlesTagged(pipelineSlice, world, wireSince);

  // The lead, in tiers (lib/news/lead): a qualifying pipeline story
  // always wins; failing that, a market-relevant story from this same
  // merged wire (tagged with its desk here, tag stripped before the
  // payload); failing that, the newest pipeline story. World items are
  // candidates only — they never enter the tier-1 matching.
  const worldCandidates = merged
    .filter((a) => a.region != null)
    .map(({ region, ...a }) => ({
      ...a,
      desk: (region === "world" ? "world" : "africa") as "africa" | "world",
    }));
  const leadPick = pickLeadStory(
    pipelineSlice,
    heat.map((h) => h.name),
    worldCandidates,
  );
  const lead: NewsArticle | null =
    leadPick == null
      ? null
      : "desk" in leadPick
        ? (({ desk: _desk, ...a }) => a)(leadPick)
        : leadPick;

  const result: NewsWireResult = {
    articles: merged.map(({ region: _region, ...a }) => a),
    lead,
    desks: [...desks, ...buildRegionDesksFromMerged(merged)],
    heat,
    asOf: new Date().toISOString(),
  };
  cache = { at: Date.now(), result };
  return result;
}
