import { fetchDoc, parseRss, type FetchedDoc } from "@/lib/server/news/ingestors";
import { dedupeByTitle } from "@/lib/news/dedupe";
import { isMarketRelevant } from "@/lib/news/relevance";
import type { NewsArticle } from "@/lib/stocks/news-signals.server";
import type { DeskResult } from "@/lib/stocks/news-wire.server";

/**
 * World wire — Soko Stock's own feed layer on top of the shared pipeline.
 *
 * The pipeline (raw_news_data) is Kenyan outlets; this module reads public
 * RSS/Atom feeds from across Africa and the big international outlets so
 * the wire carries the whole picture. Every feed here was verified live
 * on 2026-10-21 (see files/world-news-feeds.md for the audit, including
 * the outlets with NO usable feed — CNN/Reuters/AP/AllAfrica direct are
 * dead or walled, so they arrive via Google News RSS proxies instead).
 *
 * Guardrails:
 *  - Read-only. Nothing here writes to raw_news_data or touches the
 *    shared pipeline's ingest; this is a display layer for this site.
 *  - These items are for READING. They are merged into the news wire's
 *    article list and region desks only — never into per-stock signal
 *    matching (news-signals.server.ts stays pipeline-only).
 *  - Every item passes the same market-relevance filter as the pipeline
 *    (lib/news/relevance): general-news firehoses — Fox Latest above all —
 *    carry sports, celebrity and viral filler that a stock terminal drops.
 *  - A dead, slow or malformed feed degrades to "skip" with a console
 *    warning naming the feed. It never fails or hangs the wire.
 *  - Headline + link only, in the publisher's own feed words.
 */

export type WorldRegion =
  | "north"
  | "west"
  | "east"
  | "central"
  | "southern"
  | "pan-africa"
  | "world";

export interface WorldFeedDef {
  name: string;
  url: string;
  region: WorldRegion;
}

export interface WorldArticle extends NewsArticle {
  region: WorldRegion;
}

/** The verified feed list (2026-10-21). Kenya is absent on purpose — the
 *  shared pipeline already covers it. BBC Top Stories is absent too: the
 *  audit's advice was the desk feeds OR the top-stories feed, not both. */
export const WORLD_FEEDS: WorldFeedDef[] = [
  // ── International ──────────────────────────────────────────────────
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", region: "world" },
  { name: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", region: "world" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", region: "world" },
  { name: "CNN", url: "https://news.google.com/rss/search?q=site:cnn.com&hl=en&gl=US&ceid=US:en", region: "world" },
  { name: "Fox News", url: "https://moxie.foxnews.com/google-publisher/latest.xml", region: "world" },
  { name: "Fox News World", url: "https://moxie.foxnews.com/google-publisher/world.xml", region: "world" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", region: "world" },
  { name: "Sky News World", url: "https://feeds.skynews.com/feeds/rss/world.xml", region: "world" },
  { name: "Sky News Business", url: "https://feeds.skynews.com/feeds/rss/business.xml", region: "world" },
  { name: "AP", url: "https://news.google.com/rss/search?q=site:apnews.com&hl=en&gl=US&ceid=US:en", region: "world" },
  { name: "Reuters", url: "https://news.google.com/rss/search?q=site:reuters.com&hl=en&gl=US&ceid=US:en", region: "world" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss", region: "world" },
  { name: "The Guardian Africa", url: "https://www.theguardian.com/world/africa/rss", region: "world" },
  { name: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", region: "world" },
  { name: "DW World", url: "https://rss.dw.com/xml/rss-en-world", region: "world" },
  { name: "DW Africa", url: "https://rss.dw.com/xml/rss-en-africa", region: "world" },
  { name: "France 24", url: "https://www.france24.com/en/rss", region: "world" },
  { name: "France 24 Africa", url: "https://www.france24.com/en/africa/rss", region: "world" },
  { name: "RFI", url: "https://www.rfi.fr/en/rss", region: "world" },
  { name: "RFI Africa", url: "https://www.rfi.fr/en/africa/rss", region: "world" },
  { name: "Euronews", url: "https://www.euronews.com/rss?level=theme&name=news", region: "world" },
  { name: "Middle East Eye", url: "https://www.middleeasteye.net/rss", region: "world" },
  // ── Pan-African ────────────────────────────────────────────────────
  { name: "AllAfrica", url: "https://news.google.com/rss/search?q=site:allafrica.com&hl=en&gl=US&ceid=US:en", region: "pan-africa" },
  { name: "Africanews", url: "https://www.africanews.com/feed/rss", region: "pan-africa" },
  { name: "APA News", url: "https://apanews.net/feed/", region: "pan-africa" },
  { name: "African Business", url: "https://african.business/feed/", region: "pan-africa" },
  { name: "The Africa Report", url: "https://www.theafricareport.com/feed/", region: "pan-africa" },
  { name: "Business Insider Africa", url: "https://africa.businessinsider.com/rss", region: "pan-africa" },
  { name: "African Arguments", url: "https://africanarguments.org/feed/", region: "pan-africa" },
  // ── North Africa ───────────────────────────────────────────────────
  { name: "Egypt Independent", url: "https://www.egyptindependent.com/feed/", region: "north" },
  { name: "Daily News Egypt", url: "https://dailynewsegypt.com/feed/", region: "north" },
  { name: "Morocco World News", url: "https://www.moroccoworldnews.com/feed", region: "north" },
  { name: "Hespress English", url: "https://en.hespress.com/feed", region: "north" },
  { name: "Libya Herald", url: "https://libyaherald.com/feed/", region: "north" },
  // ── West Africa ────────────────────────────────────────────────────
  { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/", region: "west" },
  { name: "Vanguard", url: "https://www.vanguardngr.com/feed/", region: "west" },
  { name: "Premium Times", url: "https://www.premiumtimesng.com/feed", region: "west" },
  { name: "Punch", url: "https://punchng.com/feed/", region: "west" },
  { name: "ThisDay", url: "https://www.thisdaylive.com/feed/", region: "west" },
  { name: "Daily Trust", url: "https://dailytrust.com/feed/", region: "west" },
  { name: "Channels TV", url: "https://www.channelstv.com/feed/", region: "west" },
  { name: "Arise News", url: "https://www.arise.tv/feed/", region: "west" },
  { name: "TechCabal", url: "https://techcabal.com/feed/", region: "west" },
  { name: "MyJoyOnline", url: "https://www.myjoyonline.com/feed/", region: "west" },
  { name: "Ghana Business News", url: "https://www.ghanabusinessnews.com/feed/", region: "west" },
  { name: "Seneweb", url: "https://www.seneweb.com/rss.xml", region: "west" },
  { name: "Le Soleil", url: "https://lesoleil.sn/feed/", region: "west" },
  { name: "APS Senegal", url: "https://www.aps.sn/rss", region: "west" },
  { name: "FrontPageAfrica", url: "https://frontpageafricaonline.com/feed/", region: "west" },
  { name: "Le Faso", url: "https://lefaso.net/spip.php?page=backend", region: "west" },
  // ── East Africa (Kenya excluded — the pipeline covers it) ──────────
  { name: "The East African", url: "https://www.theeastafrican.co.ke/rss.xml", region: "east" },
  { name: "The Citizen", url: "https://www.thecitizen.co.tz/rss.xml", region: "east" },
  { name: "Daily News Tanzania", url: "https://dailynews.co.tz/feed/", region: "east" },
  { name: "Daily Monitor", url: "https://www.monitor.co.ug/rss.xml", region: "east" },
  { name: "The Independent", url: "https://www.independent.co.ug/feed/", region: "east" },
  { name: "Addis Fortune", url: "https://addisfortune.news/rss", region: "east" },
  { name: "Capital Ethiopia", url: "https://www.capitalethiopia.com/feed/", region: "east" },
  { name: "KT Press", url: "https://www.ktpress.rw/feed/", region: "east" },
  { name: "Horseed Media", url: "https://horseedmedia.net/feed/", region: "east" },
  // ── Central Africa ─────────────────────────────────────────────────
  { name: "Actualité.cd", url: "https://actualite.cd/rss.xml", region: "central" },
  { name: "Journal du Cameroun", url: "https://en.journalducameroun.com/feed/", region: "central" },
  { name: "Gabon Review", url: "https://www.gabonreview.com/feed/", region: "central" },
  { name: "Radio Tamazuj", url: "https://radiotamazuj.org/en/rss", region: "central" },
  // ── Southern Africa ────────────────────────────────────────────────
  { name: "Daily Maverick", url: "https://www.dailymaverick.co.za/rss/", region: "southern" },
  { name: "Moneyweb", url: "https://www.moneyweb.co.za/feed/", region: "southern" },
  { name: "Mail & Guardian", url: "https://mg.co.za/rss", region: "southern" },
  { name: "ITWeb", url: "https://www.itweb.co.za/rss", region: "southern" },
  { name: "Lusaka Times", url: "https://www.lusakatimes.com/feed/", region: "southern" },
  { name: "The Herald", url: "https://www.herald.co.zw/feed/", region: "southern" },
  { name: "ZimLive", url: "https://www.zimlive.com/feed/", region: "southern" },
  { name: "Nyasa Times", url: "https://www.nyasatimes.com/feed/", region: "southern" },
  { name: "Malawi24", url: "https://malawi24.com/feed/", region: "southern" },
  { name: "The Namibian", url: "https://www.namibian.com.na/rss", region: "southern" },
  { name: "New Era", url: "https://neweralive.na/feed/", region: "southern" },
  { name: "Club of Mozambique", url: "https://clubofmozambique.com/feed/", region: "southern" },
  { name: "AIM News", url: "https://aimnews.org/feed/", region: "southern" },
  { name: "Times of Swaziland", url: "https://www.times.co.sz/feed", region: "southern" },
  { name: "Midi Madagasikara", url: "https://midi-madagasikara.mg/feed/", region: "southern" },
];

export const WORLD_FEED_TIMEOUT_MS = 6_000;
export const WORLD_CACHE_MS = 10 * 60 * 1000;
/** Newest items kept per feed — one fat feed (Le Faso returns ~80) must
 *  not crowd out the rest of the continent. */
export const WORLD_PER_FEED_CAP = 20;
/** World items allowed into the merged headline wire. */
export const WORLD_WIRE_CAP = 150;
/** Articles kept per region desk, same as the pipeline desks. */
export const REGION_DESK_ARTICLE_CAP = 40;
const FETCH_CONCURRENCY = 12;

export type DocFetcher = (url: string, timeoutMs: number) => Promise<FetchedDoc>;

/** Stable id for a feed item: hash of its URL, so React keys and dedupe
 *  see the same story as the same story across fetches. */
export function worldArticleId(url: string): string {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `w${(h >>> 0).toString(36)}`;
}

/**
 * One feed → normalized wire articles. Never throws: a dead feed, a
 * timeout, a non-feed response or unparseable XML all come back as []
 * with a console warning naming the feed, so a feed that silently
 * freezes (the CNN pattern) shows up in the logs within days.
 */
export async function fetchFeedArticles(
  feed: WorldFeedDef,
  docFetcher: DocFetcher = fetchDoc,
): Promise<WorldArticle[]> {
  try {
    const doc = await docFetcher(feed.url, WORLD_FEED_TIMEOUT_MS);
    if (!doc.ok || !doc.body) {
      console.warn(
        `[world-feeds] ${feed.name} skipped: ${doc.error ?? `HTTP ${doc.status ?? "?"}`}`,
      );
      return [];
    }
    const items = parseRss(doc.body, feed.url);
    if (items.length === 0) {
      console.warn(`[world-feeds] ${feed.name} skipped: no items parsed (not a feed?)`);
      return [];
    }
    // Same relevance gate the pipeline articles pass upstream: a world
    // feed's sports/celebrity/viral items never reach the wire or desks.
    // Filtering before the cap means a noisy feed's cap counts real news.
    return items
      .filter((a) => isMarketRelevant(a.title))
      .map((a) => ({
        id: worldArticleId(a.url),
        title: a.title,
        url: a.url,
        source: feed.name,
        published_at: a.publishedAt,
        sentiment_score: null,
        region: feed.region,
      }))
      .sort((x, y) => (x.published_at < y.published_at ? 1 : -1))
      .slice(0, WORLD_PER_FEED_CAP);
  } catch (e) {
    console.warn(
      `[world-feeds] ${feed.name} skipped: ${e instanceof Error ? e.message : String(e)}`,
    );
    return [];
  }
}

/** All feeds in parallel (bounded concurrency), failures already
 *  degraded to [] per feed by fetchFeedArticles. */
export async function fetchAllFeeds(
  feeds: WorldFeedDef[] = WORLD_FEEDS,
  docFetcher: DocFetcher = fetchDoc,
): Promise<WorldArticle[]> {
  const out: WorldArticle[] = [];
  for (let i = 0; i < feeds.length; i += FETCH_CONCURRENCY) {
    const batch = feeds.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((f) => fetchFeedArticles(f, docFetcher)));
    for (const r of results) out.push(...r);
  }
  return out.sort((x, y) => (x.published_at < y.published_at ? 1 : -1));
}

let worldCache: { at: number; articles: WorldArticle[] } | null = null;

/** Cached read of the whole world layer (~10 min TTL, shared with the
 *  wire's own cache rhythm). Never throws. */
export async function getWorldArticles(): Promise<WorldArticle[]> {
  if (worldCache && Date.now() - worldCache.at < WORLD_CACHE_MS) {
    return worldCache.articles;
  }
  const articles = await fetchAllFeeds();
  worldCache = { at: Date.now(), articles };
  return articles;
}

/** A wire article that still carries its world region (pipeline items
 *  have none). Build-time only — the payload strips the tag. */
export type TaggedNewsArticle = NewsArticle & { region?: WorldRegion };

/**
 * Merge the pipeline wire with world items: world items inside the
 * window only, capped, then the union deduped by title (the repo's
 * dedupeByTitle — the same story arriving via an outlet feed and a
 * Google News proxy collapses to the earliest copy) and capped.
 * World items keep their region tag so the region desks can be built
 * from the merged list itself (see buildRegionDesksFromMerged).
 */
export function mergeWireArticlesTagged(
  pipelineWire: NewsArticle[],
  world: WorldArticle[],
  sinceIso: string,
  cap = 300,
): TaggedNewsArticle[] {
  const worldInWindow = world
    .filter((a) => a.published_at >= sinceIso)
    .slice(0, WORLD_WIRE_CAP);
  return dedupeByTitle<TaggedNewsArticle>([...pipelineWire, ...worldInWindow]).slice(0, cap);
}

/**
 * The shipped merge: same list as mergeWireArticlesTagged with the
 * region tag stripped — the tag is a build-time concern, not part of
 * the wire's payload shape.
 */
export function mergeWireArticles(
  pipelineWire: NewsArticle[],
  world: WorldArticle[],
  sinceIso: string,
  cap = 300,
): NewsArticle[] {
  return mergeWireArticlesTagged(pipelineWire, world, sinceIso, cap).map(
    ({ region: _region, ...a }) => a,
  );
}

const AFRICA_DESK_REGIONS: ReadonlySet<WorldRegion> = new Set([
  "north",
  "west",
  "east",
  "central",
  "southern",
  "pan-africa",
]);

function regionDesk(
  id: string,
  label: string,
  hint: string,
  items: readonly TaggedNewsArticle[],
  day24Iso: string,
  wireSinceIso: string,
): DeskResult {
  const inWindow = items.filter((a) => a.published_at >= wireSinceIso);
  return {
    id,
    label,
    hint,
    count24h: items.filter((a) => a.published_at >= day24Iso).length,
    countWindow: inWindow.length,
    // Region desks have no 30-day baseline — the feeds only carry recent
    // items — so no surge math: medianDaily 0 / surgeRatio null and the
    // News page omits the baseline clause for desks in this state.
    medianDaily: 0,
    surgeRatio: null,
    surging: false,
    articles: inWindow.slice(0, REGION_DESK_ARTICLE_CAP).map(({ region: _r, ...a }) => a),
  };
}

/** The two region desks appended to the wire payload: "Africa" (every
 *  non-Kenya African item, pan-African wires included) and "World"
 *  (the international outlets). Same DeskResult shape as the pipeline
 *  desks, so the News page renders them with no new payload fields. */
export function buildRegionDesks(world: WorldArticle[], nowMs: number = Date.now()): DeskResult[] {
  const day24 = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  const wireSince = new Date(nowMs - 48 * 3600 * 1000).toISOString();
  const africa = world.filter((a) => AFRICA_DESK_REGIONS.has(a.region));
  const intl = world.filter((a) => a.region === "world");
  return [
    regionDesk(
      "africa",
      "Africa",
      "Pan-African wires and outlets across the continent, beyond Kenya",
      africa,
      day24,
      wireSince,
    ),
    regionDesk(
      "world",
      "World",
      "International outlets — BBC, CNN, Fox, Al Jazeera and the wires",
      intl,
      day24,
      wireSince,
    ),
  ];
}

/**
 * The region desks as the News page actually ships them: counted over
 * the MERGED wire (the capped list the page calls "the wire"), not over
 * the raw feed fetch. Counting the raw fetch was the 2026-10-22 bug —
 * the feeds carry ~860 items, so AFRICA read 585 against an ALL WIRE of
 * 300. Desks built here can never out-count the wire they are drawn
 * from, and every article a region desk lists is on that wire.
 */
export function buildRegionDesksFromMerged(
  merged: readonly TaggedNewsArticle[],
  nowMs: number = Date.now(),
): DeskResult[] {
  const day24 = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  const wireSince = new Date(nowMs - 48 * 3600 * 1000).toISOString();
  const africa = merged.filter(
    (a) => a.region != null && AFRICA_DESK_REGIONS.has(a.region),
  );
  const intl = merged.filter((a) => a.region === "world");
  return [
    regionDesk(
      "africa",
      "Africa",
      "Pan-African wires and outlets across the continent, beyond Kenya",
      africa,
      day24,
      wireSince,
    ),
    regionDesk(
      "world",
      "World",
      "International outlets — BBC, CNN, Fox, Al Jazeera and the wires",
      intl,
      day24,
      wireSince,
    ),
  ];
}
