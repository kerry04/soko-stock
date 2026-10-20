/**
 * African Financials (africanfinancials.com) server adapter.
 * Free, no key, no login: end-of-day price-list tables per exchange,
 * fetched as server-rendered HTML. Cache aggressively (EOD cadence).
 */

export interface AFRow {
  ticker: string; // e.g. SCOM.NSE
  name: string;
  price: number;
  changePercent: number | null;
  volume: number | null;
  value: number | null;
  ytdPercent: number | null;
  sector: string | null;
  updated: string | null; // "Sep 25, 2026"
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Feed config per exchange. priceDivisor converts AF's quoted unit to the
 * display currency: Botswana lists in thebe and ZSE in ZiG cents (verified
 * 2026-10-20 against afx closes: DLTA 3259.57 AF = ZWG 32.5957), VFEX in US
 * cents. The Value column is already full currency everywhere — only the
 * price divides.
 */
const FEEDS: Record<
  string,
  { url: string; prefix: string; suffix: string; priceDivisor: number }
> = {
  NSE: {
    url: "https://africanfinancials.com/nairobi-securities-exchange-kenya-share-prices/",
    prefix: "ke-",
    suffix: ".NSE",
    priceDivisor: 1,
  },
  NGX: {
    url: "https://africanfinancials.com/nigerian-stock-exchange-share-prices/",
    prefix: "ng-",
    suffix: ".NGX",
    priceDivisor: 1,
  },
  GSE: {
    url: "https://africanfinancials.com/ghana-stock-exchange-share-prices/",
    prefix: "gh-",
    suffix: ".GSE",
    priceDivisor: 1,
  },
  DSE: {
    url: "https://africanfinancials.com/dar-es-salaam-stock-exchange-share-prices/",
    prefix: "tz-",
    suffix: ".DSE",
    priceDivisor: 1,
  },
  USE: {
    url: "https://africanfinancials.com/uganda-securities-exchange-share-prices/",
    prefix: "ug-",
    suffix: ".USE",
    priceDivisor: 1,
  },
  LUSE: {
    url: "https://africanfinancials.com/lusaka-securities-exchange-share-prices/",
    prefix: "zm-",
    suffix: ".LUSE",
    priceDivisor: 1,
  },
  BSE: {
    url: "https://africanfinancials.com/botswana-stock-exchange-share-prices/",
    prefix: "bw-",
    suffix: ".BSE",
    priceDivisor: 100, // thebe → pula
  },
  MSE: {
    url: "https://africanfinancials.com/malawi-stock-exchange-share-prices/",
    prefix: "mw-",
    suffix: ".MSE",
    priceDivisor: 1,
  },
  SEM: {
    url: "https://africanfinancials.com/stock-exchange-of-mauritius-sem-share-prices/",
    prefix: "mu-",
    suffix: ".SEM",
    priceDivisor: 1,
  },
  VFEX: {
    url: "https://africanfinancials.com/victoria-falls-stock-exchange-share-prices/",
    prefix: "vx-",
    suffix: ".VFEX",
    priceDivisor: 100, // US cents → USD
  },
  ZSE: {
    url: "https://africanfinancials.com/zimbabwe-stock-exchange-share-prices/",
    prefix: "zw-",
    suffix: ".ZSE",
    priceDivisor: 100, // ZiG cents → ZWG
  },
};

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — EOD data
const cache = new Map<string, { at: number; rows: AFRow[] }>();

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, "").replace(/[+%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function int(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseAFTable(
  html: string,
  exchangeCode: string,
): AFRow[] {
  const feed = FEEDS[exchangeCode];
  if (!feed) return [];
  return parseTable(html, feed);
}

async function fetchBoard(code: string): Promise<AFRow[]> {
  const feed = FEEDS[code];
  if (!feed) return [];
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.rows;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const rows = parseTable(html, feed);
    cache.set(code, { at: Date.now(), rows });
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

function parseTable(
  html: string,
  feed: { prefix: string; suffix: string; priceDivisor: number },
): AFRow[] {
  const out: AFRow[] = [];
  const trs = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  for (const m of trs) {
    const row = m[1];
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      stripTags(c[1]),
    );
    // Columns: Company | Price | % Change | Value | Volume | YTD % | Sector | Updated
    if (cells.length < 5) continue;
    const price = num(cells[1]);
    if (price === null) continue;

    // Ticker: title="(SCOM.ke)" on the company link, or the /company/ke-scom/ slug.
    let ticker: string | null = null;
    const titleMatch = row.match(/title="[^"]*\(([A-Za-z0-9]+)\.[a-z]{2}\)/);
    if (titleMatch) ticker = titleMatch[1].toUpperCase() + feed.suffix;
    if (!ticker) {
      const slugMatch = row.match(
        new RegExp(`/company/${feed.prefix.replace("-", "\\-")}([a-z0-9]+)/`),
      );
      if (slugMatch) ticker = slugMatch[1].toUpperCase() + feed.suffix;
    }
    if (!ticker) continue;

    out.push({
      ticker,
      name: cells[0],
      price: price / feed.priceDivisor,
      changePercent: num(cells[2]),
      value: int(cells[3]),
      volume: int(cells[4]),
      ytdPercent: num(cells[5]),
      sector: cells[6] || null,
      updated: cells[7] || null,
    });
  }
  return out;
}

/** Live board for one exchange. Throws on fetch/parse failure. */
export async function getAFBoard(exchangeCode: string): Promise<AFRow[]> {
  return fetchBoard(exchangeCode);
}

/** Single quote lookup across AF exchanges. */
export async function getAFQuote(ticker: string): Promise<AFRow | null> {
  const m = ticker.match(/\.([A-Z]+)$/);
  const code = m ? m[1] : null;
  if (!code || !FEEDS[code]) return null;
  const rows = await fetchBoard(code);
  return rows.find((r) => r.ticker === ticker) ?? null;
}
