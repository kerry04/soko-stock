import { describe, expect, it, vi } from "vitest";
import type { FetchedDoc } from "@/lib/server/news/ingestors";
import type { NewsArticle } from "@/lib/stocks/news-signals.server";
import {
  WORLD_FEEDS,
  WORLD_PER_FEED_CAP,
  buildRegionDesks,
  fetchAllFeeds,
  fetchFeedArticles,
  mergeWireArticles,
  worldArticleId,
  type DocFetcher,
  type WorldArticle,
  type WorldFeedDef,
} from "./world-feeds.server";

const feed: WorldFeedDef = { name: "Test Wire", url: "https://example.com/feed", region: "west" };

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Test Wire</title>
<item><title><![CDATA[Central bank holds rate at 8.75%]]></title>
<link>https://example.com/a1</link>
<pubDate>Wed, 22 Oct 2026 09:30:00 GMT</pubDate>
<description>Markets &amp; policy</description></item>
<item><title>Older story &amp; sons</title>
<link>https://example.com/a2</link>
<pubDate>Tue, 21 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Newest story</title>
<link>https://example.com/a3</link>
<pubDate>Wed, 22 Oct 2026 11:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom story one</title>
<link rel="alternate" href="https://example.org/e1"/>
<published>2026-10-22T07:15:00Z</published></entry>
<entry><title>Atom story two</title>
<link rel="alternate" href="https://example.org/e2"/>
<updated>2026-10-22T06:00:00Z</updated></entry>
</feed>`;

const NOT_A_FEED = `<html><head><title>Just a page</title></head><body>Hello</body></html>`;

const okDoc =
  (body: string): DocFetcher =>
  async () => ({ ok: true, status: 200, body });

const deadDoc: DocFetcher = async () => ({ ok: false, status: 404, error: "HTTP 404" });
const throwingDoc: DocFetcher = async () => {
  throw new Error("socket hang up");
};

describe("WORLD_FEEDS list hygiene", () => {
  it("wires the verified list: many feeds, unique https URLs, no Kenya region", () => {
    expect(WORLD_FEEDS.length).toBeGreaterThanOrEqual(70);
    const urls = WORLD_FEEDS.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const f of WORLD_FEEDS) {
      expect(f.url.startsWith("https://")).toBe(true);
      expect(f.region).not.toBe("ke");
    }
  });
});

describe("worldArticleId", () => {
  it("is stable per URL and distinct across URLs", () => {
    expect(worldArticleId("https://example.com/x")).toBe(worldArticleId("https://example.com/x"));
    expect(worldArticleId("https://example.com/x")).not.toBe(worldArticleId("https://example.com/y"));
    expect(worldArticleId("https://example.com/x")).toMatch(/^w[0-9a-z]+$/);
  });
});

describe("fetchFeedArticles", () => {
  it("parses RSS into the wire's article shape, newest first", async () => {
    const out = await fetchFeedArticles(feed, okDoc(RSS));
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("Newest story");
    expect(out[1].title).toBe("Central bank holds rate at 8.75%");
    expect(out[0]).toMatchObject({
      source: "Test Wire",
      region: "west",
      sentiment_score: null,
      url: "https://example.com/a3",
      published_at: "2026-10-22T11:00:00.000Z",
    });
    expect(out[0].id).toBe(worldArticleId("https://example.com/a3"));
  });

  it("pares Atom entries too", async () => {
    const out = await fetchFeedArticles({ ...feed, region: "world" }, okDoc(ATOM));
    expect(out.map((a) => a.title)).toEqual(["Atom story one", "Atom story two"]);
    expect(out[0].url).toBe("https://example.org/e1");
  });

  it("caps a fat feed at the per-feed cap", async () => {
    const items = Array.from({ length: WORLD_PER_FEED_CAP + 5 }, (_, i) => {
      const hh = String(23 - i).padStart(2, "0");
      return `<item><title>Story ${i}</title><link>https://example.com/s${i}</link><pubDate>Wed, 22 Oct 2026 ${hh}:00:00 GMT</pubDate></item>`;
    }).join("");
    const out = await fetchFeedArticles(feed, okDoc(`<rss version="2.0"><channel>${items}</channel></rss>`));
    expect(out).toHaveLength(WORLD_PER_FEED_CAP);
  });

  it("a dead feed degrades to [] and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetchFeedArticles(feed, deadDoc)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Test Wire"));
    warn.mockRestore();
  });

  it("a throwing fetch degrades to [] and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetchFeedArticles(feed, throwingDoc)).resolves.toEqual([]);
    warn.mockRestore();
  });

  it("a malformed (non-feed) response degrades to [] and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetchFeedArticles(feed, okDoc(NOT_A_FEED))).resolves.toEqual([]);
    warn.mockRestore();
  });

  it("drops a feed's sports and viral items, keeps its markets and politics items", async () => {
    // The two junk shapes are the ones seen live on the wire from the Fox
    // News firehose on 2026-10-21: a baseball preview and a viral video.
    const mixed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Test Wire</title>
<item><title>World Series preview: Why the Milwaukee Brewers are the team to beat</title>
<link>https://example.com/sport</link>
<pubDate>Wed, 22 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Video of elephant calf splashing in mud goes viral, melts hearts online</title>
<link>https://example.com/viral</link>
<pubDate>Wed, 22 Oct 2026 11:30:00 GMT</pubDate></item>
<item><title>Nigeria central bank holds benchmark rate, cites easing inflation</title>
<link>https://example.com/markets</link>
<pubDate>Wed, 22 Oct 2026 11:00:00 GMT</pubDate></item>
<item><title>Parliament passes finance bill after stormy debate on new taxes</title>
<link>https://example.com/politics</link>
<pubDate>Wed, 22 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
    const out = await fetchFeedArticles(feed, okDoc(mixed));
    expect(out.map((a) => a.title)).toEqual([
      "Nigeria central bank holds benchmark rate, cites easing inflation",
      "Parliament passes finance bill after stormy debate on new taxes",
    ]);
  });
});

describe("fetchAllFeeds", () => {
  it("merges feeds and sorts newest first, skipping the dead one", async () => {
    const feeds: WorldFeedDef[] = [
      { name: "A", url: "https://a.example/feed", region: "north" },
      { name: "B", url: "https://b.example/feed", region: "world" },
      { name: "Dead", url: "https://dead.example/feed", region: "west" },
    ];
    const fetcher: DocFetcher = async (url) => {
      if (url.includes("dead")) return { ok: false, status: 503, error: "HTTP 503" };
      return { ok: true, status: 200, body: RSS };
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await fetchAllFeeds(feeds, fetcher);
    expect(out).toHaveLength(6);
    expect(out[0].published_at >= out[out.length - 1].published_at).toBe(true);
    expect(new Set(out.map((a) => a.source))).toEqual(new Set(["A", "B"]));
    warn.mockRestore();
  });
});

const pipe = (title: string, published_at: string): NewsArticle => ({
  id: `p-${title}`,
  title,
  url: "https://pipeline.example/x",
  source: "Nation",
  published_at,
  sentiment_score: 0.4,
});

const world = (title: string, published_at: string, region: WorldArticle["region"] = "west"): WorldArticle => ({
  id: worldArticleId(`https://world.example/${title}`),
  title,
  url: `https://world.example/${title}`,
  source: "Vanguard",
  published_at,
  sentiment_score: null,
  region,
});

describe("mergeWireArticles", () => {
  const since = "2026-10-21T00:00:00.000Z";

  it("merges, sorts newest first, and strips the region tag from the payload", () => {
    const out = mergeWireArticles(
      [pipe("Pipeline noon", "2026-10-22T12:00:00.000Z")],
      [world("World one pm", "2026-10-22T13:00:00.000Z"), world("World dawn", "2026-10-22T06:00:00.000Z")],
      since,
    );
    expect(out.map((a) => a.title)).toEqual(["World one pm", "Pipeline noon", "World dawn"]);
    expect(out[0]).not.toHaveProperty("region");
  });

  it("dedupes the same headline across pipeline and world, keeping the earliest copy", () => {
    const out = mergeWireArticles(
      [pipe("Safaricom names new chief executive", "2026-10-22T09:00:00.000Z")],
      [world("Safaricom names new chief executive", "2026-10-22T08:30:00.000Z")],
      since,
    );
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("Vanguard"); // the earlier copy wins, per dedupeByTitle
  });

  it("excludes world items older than the wire window", () => {
    const out = mergeWireArticles(
      [],
      [world("Fresh", "2026-10-22T01:00:00.000Z"), world("Stale", "2026-10-19T01:00:00.000Z")],
      since,
    );
    expect(out.map((a) => a.title)).toEqual(["Fresh"]);
  });

  it("respects the total cap", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      world(`W${i}`, new Date(Date.parse("2026-10-22T00:00:00Z") + i * 60_000).toISOString()),
    );
    const out = mergeWireArticles([pipe("P", "2026-10-22T23:00:00.000Z")], many, since, 50);
    expect(out).toHaveLength(50);
  });
});

describe("buildRegionDesks", () => {
  const now = Date.parse("2026-10-22T12:00:00.000Z");
  const h = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString();

  it("groups pan-African and regional items into Africa, international into World", () => {
    const desks = buildRegionDesks(
      [
        world("Nigeria story", h(2), "west"),
        world("Pan-african story", h(3), "pan-africa"),
        world("Cairo story", h(4), "north"),
        world("Global story", h(1), "world"),
      ],
      now,
    );
    const africa = desks.find((d) => d.id === "africa")!;
    const worldDesk = desks.find((d) => d.id === "world")!;
    expect(africa.label).toBe("Africa");
    expect(africa.count24h).toBe(3);
    expect(africa.articles.map((a) => a.title)).toEqual([
      "Nigeria story",
      "Pan-african story",
      "Cairo story",
    ]);
    expect(worldDesk.count24h).toBe(1);
    expect(worldDesk.articles[0].title).toBe("Global story");
  });

  it("region desks carry no surge math and only the 48h window as articles", () => {
    const desks = buildRegionDesks(
      [world("Old", h(72), "southern"), world("Recent", h(30), "southern")],
      now,
    );
    const africa = desks.find((d) => d.id === "africa")!;
    expect(africa.surging).toBe(false);
    expect(africa.surgeRatio).toBeNull();
    expect(africa.medianDaily).toBe(0);
    expect(africa.count24h).toBe(0); // 30h ago is outside 24h
    expect(africa.articles.map((a) => a.title)).toEqual(["Recent"]); // but inside 48h
  });
});
