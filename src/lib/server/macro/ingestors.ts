// Macro-economic indicator ingestion — one parser per outlet, outlets as config
// rows. Mirrors src/lib/server/news/ingestors.ts: config-driven registry,
// fetchDoc with browser UA + timeout + 429 backoff, tolerant parsers that
// NEVER throw, per-outlet isolation. Each outlet carries a `validated` flag:
// rows are tagged verified only once the parser has passed a live-page check
// with sane values (see the flag notes on MACRO_OUTLETS).
//
// Adding an outlet = one row in MACRO_OUTLETS + one parser function. Never new code.
import { logPipelineFailure } from "@/lib/server/pipeline-alerts";

// ───────────────────────────── types ─────────────────────────────

export type MacroParserId = "knbs-cpi" | "cbk-cbr" | "cbk-fx" | "cbk-tbill";

export interface MacroOutlet {
  id: string;
  ingestor: "html-page";
  url: string;
  parserId: MacroParserId;
  category: string;
  /** Stored in macro_indicators.source. */
  label: string;
  /**
   * True once this parser has passed a live-page validation with sane
   * values. Only validated outlets write verified rows (the hook reads this).
   */
  validated: boolean;
}

export interface ParsedIndicator {
  indicator: string;
  value: number;
  unit: string | null;
  released_at: string;
  source: string;
  source_url: string;
}

export interface ParsedMacro {
  ok: boolean;
  indicators: ParsedIndicator[];
  error?: string;
}

export interface MacroIngestResult {
  id: string;
  ok: boolean;
  count: number;
  indicators: ParsedIndicator[];
  error?: string;
}

export interface FetchedDoc {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// ───────────────────────────── shared fetch ─────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchDoc(url: string, timeoutMs = 15_000): Promise<FetchedDoc> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml,*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (res.status === 429) {
      // Politeness: back off this outlet for the cycle.
      return { ok: false, status: 429, error: "HTTP 429 (rate limited)" };
    }
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────────── outlet registry ─────────────────────────────

export const MACRO_OUTLETS: MacroOutlet[] = [
  {
    id: "knbs-cpi",
    ingestor: "html-page",
    url: "https://www.knbs.or.ke/reports/consumer-price-indices-and-inflation-rates/",
    parserId: "knbs-cpi",
    category: "inflation",
    label: "KNBS",
    // NOT validated: knbs.or.ke HTTPS is unreachable from the build network
    // (connection fails outright; http 301s into the same dead end), so the
    // parser has never seen a live page. Outlet fails gracefully per design.
    // CPI fallback when this is picked up: World Bank WDI annual inflation or
    // DBnomics IMF IFS monthly — see the connectors plan doc.
    validated: false,
  },
  {
    id: "cbk-cbr",
    ingestor: "html-page",
    url: "https://www.centralbank.go.ke/central-bank-rate/",
    parserId: "cbk-cbr",
    category: "policy-rate",
    label: "CBK",
    // Validated live 2026-10-20: CBR 8.75%, released_at 2026-10-07.
    validated: true,
  },
  {
    id: "cbk-fx",
    ingestor: "html-page",
    url: "https://www.centralbank.go.ke/forex/",
    parserId: "cbk-fx",
    category: "fx",
    label: "CBK",
    // Validated live 2026-10-20: USD/KES 129.92, dated 2026-10-19.
    validated: true,
  },
  {
    id: "cbk-tbill",
    ingestor: "html-page",
    url: "https://www.centralbank.go.ke/bills-bonds/treasury-bills/",
    parserId: "cbk-tbill",
    category: "treasury",
    label: "CBK",
    // Validated live 2026-10-20: 91d 8.75 / 182d 8.86 / 364d 9.0383.
    validated: true,
  },
];

// ───────────────────────────── text helpers ─────────────────────────────

/** Collapse an HTML page to plain text for regex-light extraction. */
function stripText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

function fail(error: string): ParsedMacro {
  return { ok: false, indicators: [], error };
}

/** Never throws — every parser body runs through this. */
function safeParse(fn: () => ParsedMacro): ParsedMacro {
  try {
    return fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** First captured group across a list of candidate patterns. */
function firstNumber(text: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1] !== undefined) {
      const v = Number(m[1]);
      if (!Number.isNaN(v)) return v;
    }
  }
  return null;
}

const MONTH_RE =
  /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i;

/**
 * Best-effort release date: a "Posted On: DD-MM-YYYY" stamp first (CBK pages),
 * then the first "<Month> <Year>" mention. Falls back to fetch time when the
 * page carries no readable date.
 */
function findReleaseDate(text: string): string {
  const posted = text.match(/posted on:?\s*(\d{1,2})-(\d{1,2})-(\d{4})/i);
  if (posted) {
    const iso = `${posted[3]}-${posted[2].padStart(2, "0")}-${posted[1].padStart(2, "0")}T00:00:00.000Z`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  const m = text.match(MONTH_RE);
  if (m) {
    const d = new Date(`${m[1]} 1, ${m[2]} UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * CBK rate-history tables are DD/MM/YYYY + rate pairs. The newest pair is the
 * current rate — more reliable than matching a news headline that can go stale.
 */
function latestTableRate(text: string): { value: number; releasedAt: string } | null {
  const ROW = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}\.\d{1,4})/g;
  let best: { value: number; releasedAt: string; ts: number } | null = null;
  for (const m of text.matchAll(ROW)) {
    const iso = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;
    const value = Number(m[4]);
    if (!inRange(value, 0, 50)) continue;
    if (!best || ts > best.ts) best = { value, releasedAt: iso, ts };
  }
  return best;
}

function makeIndicator(
  indicator: string,
  value: number,
  unit: string | null,
  releasedAt: string,
  source: string,
  sourceUrl: string,
): ParsedIndicator {
  return { indicator, value, unit, released_at: releasedAt, source, source_url: sourceUrl };
}

// ───────────────────────────── parsers ─────────────────────────────
// Each parser is regex-light and tolerant: it looks for GENERIC phrasing
// ("inflation ... X.X%", "91-day ... X.XXX%"), not specific page markup.
// Missing or out-of-range content → { ok: false, error } — never a throw.

export function parseKnbsCpi(html: string, sourceUrl: string): ParsedMacro {
  return safeParse(() => {
    const text = stripText(html);
    const value = firstNumber(text, [
      /annual\s+inflation[\s\S]{0,80}?(\d+\.\d+)\s*(?:%|percent)/i,
      /inflation\s+rate[\s\S]{0,80}?(\d+\.\d+)\s*(?:%|percent)/i,
      /inflation[\s\S]{0,80}?(\d+\.\d+)\s*(?:%|percent)/i,
    ]);
    if (value === null) return fail("no CPI/inflation figure found on page");
    if (!inRange(value, -5, 100)) return fail(`CPI value out of plausible range: ${value}`);
    return {
      ok: true,
      indicators: [
        makeIndicator("cpi_yoy", value, "%", findReleaseDate(text), "KNBS", sourceUrl),
      ],
    };
  });
}

export function parseCbkCbr(html: string, sourceUrl: string): ParsedMacro {
  return safeParse(() => {
    const text = stripText(html);
    // Prefer the rate-history table's newest row over headline phrasing.
    const table = latestTableRate(text);
    if (table) {
      return {
        ok: true,
        indicators: [
          makeIndicator("cbr", table.value, "%", table.releasedAt, "CBK", sourceUrl),
        ],
      };
    }
    const value = firstNumber(text, [
      /central\s+bank\s+rate[\s\S]{0,80}?(\d+\.\d+)\s*(?:%|percent)/i,
      /\(cbr\)[\s\S]{0,80}?(\d+\.\d+)\s*(?:%|percent)/i,
      /\bcbr\b[\s\S]{0,80}?(\d+\.\d+)\s*(?:%|percent)/i,
    ]);
    if (value === null) return fail("no Central Bank Rate figure found on page");
    if (!inRange(value, 0, 50)) return fail(`CBR value out of plausible range: ${value}`);
    return {
      ok: true,
      indicators: [makeIndicator("cbr", value, "%", findReleaseDate(text), "CBK", sourceUrl)],
    };
  });
}

export function parseCbkFx(html: string, sourceUrl: string): ParsedMacro {
  return safeParse(() => {
    const text = stripText(html);
    const value = firstNumber(text, [
      // The "Daily KES Exchange Rates" widget is the current print. It must
      // come first: the page also carries years of historical tables, and the
      // generic patterns below match the oldest row (e.g. Jan 2024) instead.
      // Anchored on "Search for:" because the phrase also appears in the tab
      // navigation above the historical tables.
      /Search for:\s*Daily KES Exchange Rates\s+US DOLLAR\s+(\d{2,4}\.\d{2,4})/i,
      /kes\s*\/\s*usd[\s\S]{0,80}?(\d{2,4}\.\d{2,4})/i,
      /mean[\s\S]{0,80}?(\d{2,4}\.\d{2,4})[\s\S]{0,40}kes\s*\/\s*usd/i,
      /us\s*dollar[\s\S]{0,80}?(\d{2,4}\.\d{2,4})/i,
    ]);
    if (value === null) return fail("no KES/USD figure found on page");
    if (!inRange(value, 10, 1000)) return fail(`KES/USD value out of plausible range: ${value}`);
    return {
      ok: true,
      indicators: [
        makeIndicator("fx_usd", value, "KES/USD", findReleaseDate(text), "CBK", sourceUrl),
      ],
    };
  });
}

export function parseCbkTbill(html: string, sourceUrl: string): ParsedMacro {
  return safeParse(() => {
    const text = stripText(html);
    const releasedAt = findReleaseDate(text);
    const indicators: ParsedIndicator[] = [];
    for (const tenor of ["91", "182", "364"] as const) {
      // Live phrasing on the T-bills on-offer page: "91-DAY Issue Number:
      // 2705/091 Auction Date: 22nd October 2026 Value Dated: 26th October 2026
      // Previous Average Interest Rate: 8.7500%". The rate sits ~200 chars
      // past the tenor label, so the window is wide and anchored on the
      // "Previous Average Interest Rate" label.
      const live = new RegExp(
        `${tenor}-DAY[\\s\\S]{0,400}?Previous Average Interest Rate:\\s*(\\d+\\.\\d+)\\s*%`,
        "i",
      );
      const generic = new RegExp(
        `${tenor}[\\s-]*day[\\s\\S]{0,80}?(\\d+\\.\\d+)\\s*(?:%|percent)`,
        "i",
      );
      const m = text.match(live) ?? text.match(generic);
      if (!m?.[1]) return fail(`no ${tenor}-day T-bill rate found on page`);
      const value = Number(m[1]);
      if (Number.isNaN(value) || !inRange(value, 0, 50)) {
        return fail(`${tenor}-day T-bill rate out of plausible range: ${m[1]}`);
      }
      indicators.push(makeIndicator(`tbill_${tenor}`, value, "%", releasedAt, "CBK", sourceUrl));
    }
    return { ok: true, indicators };
  });
}

// ───────────────────────────── ingest one outlet ─────────────────────────────

function parserFor(parserId: MacroParserId): (html: string, sourceUrl: string) => ParsedMacro {
  switch (parserId) {
    case "knbs-cpi":
      return parseKnbsCpi;
    case "cbk-cbr":
      return parseCbkCbr;
    case "cbk-fx":
      return parseCbkFx;
    case "cbk-tbill":
      return parseCbkTbill;
    default:
      return () => fail(`unknown parserId: ${parserId}`);
  }
}

/**
 * Fetch + parse one macro outlet. Never throws and never writes to the DB —
 * the hook does the upserts. Per-outlet isolation: one outlet's failure (or a
 * parser's) cannot fail the run; failures are logged to admin_alerts.
 */
export async function ingestMacroOutlet(
  outlet: MacroOutlet,
  admin: AnyClient,
): Promise<MacroIngestResult> {
  try {
    const doc = await fetchDoc(outlet.url);
    if (!doc.ok || !doc.body) {
      return {
        id: outlet.id,
        ok: false,
        count: 0,
        indicators: [],
        error: doc.error ?? `HTTP ${doc.status}`,
      };
    }
    const parsed = parserFor(outlet.parserId)(doc.body, outlet.url);
    if (!parsed.ok) {
      await logPipelineFailure(
        admin,
        `ingest-macro:${outlet.id}`,
        new Error(parsed.error ?? "parser returned no data"),
      ).catch(() => {});
      return { id: outlet.id, ok: false, count: 0, indicators: [], error: parsed.error };
    }
    return {
      id: outlet.id,
      ok: true,
      count: parsed.indicators.length,
      indicators: parsed.indicators,
    };
  } catch (e) {
    // NEVER let one outlet fail the whole run.
    await logPipelineFailure(admin, `ingest-macro:${outlet.id}`, e).catch(() => {});
    return {
      id: outlet.id,
      ok: false,
      count: 0,
      indicators: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
