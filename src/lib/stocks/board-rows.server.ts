import { EXCHANGE_BY_ID, limitHitFor } from "@/lib/stocks/exchanges";
import { getDBBoard } from "@/lib/stocks/boards-db.server";
import { getBoard, get52wkStats, getTechnicals } from "@/lib/stocks/yahoo.server";
import { getNewsSignals } from "@/lib/stocks/news-signals.server";

/**
 * Shared board-row builder — extracted from /api/stocks/board so the
 * screener (and any future consumer) fans out from the same rows instead of
 * duplicating the Yahoo/EOD fan-out. One fetch path, many screens.
 */

export interface BoardRow {
  ticker: string;
  name: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  /** Value traded in display currency (EOD table for AF, price×volume for JSE). */
  value: number | null;
  /** The daily board's own "Updated" label, when the source publishes one. */
  updated: string | null;
  wk52High: number | null;
  wk52Low: number | null;
  rsi: number | null;
  aboveSma50: boolean | null;
  /** Latest volume ÷ 20-day average. Null without history (EOD listings). */
  relVolume: number | null;
  /** 24h news volume ÷ 30-day daily median, when surging (≥3×, ≥3 articles). */
  newsSurge: number | null;
  /** Set when the day's move has reached the exchange's daily price band. */
  limitHit: "up" | "down" | null;
  /**
   * Liquidity tier within this board, by value traded: top quartile
   * "liquid", bottom quartile (or no value at all) "thin", rest "active".
   * Thin counters gate the attention badges — their signals are noise-prone.
   */
  liquidity: "liquid" | "active" | "thin";
  /**
   * Speculation signature (NSE PDF): a ≥5% move on a thin counter with no
   * matching news surge. A warning label, never a call.
   */
  speculation: boolean;
  asOf: string;
}

export interface ExchangeBoard {
  exchange: string;
  currencySymbol: string;
  timeNote: string;
  /** The board-wide "Updated" label, when the source publishes one. */
  updated: string | null;
  rows: BoardRow[];
}

/** Bounded-parallel map for the 52-week stat fan-out. */
async function mapParallel<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = undefined as R;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export class BoardError extends Error {
  code: "not-live" | "unreachable";
  constructor(code: "not-live" | "unreachable") {
    super(code);
    this.code = code;
  }
}

/** Speculation signature: a ≥5% move on a thin counter with no news surge behind it. */
export function isSpeculative(
  r: Pick<BoardRow, "changePercent" | "liquidity" | "newsSurge">,
): boolean {
  return (
    r.liquidity === "thin" &&
    r.changePercent != null &&
    Math.abs(r.changePercent) >= 5 &&
    r.newsSurge == null
  );
}

/**
 * Board rows for one exchange. Yahoo exchanges fan out ≤6 concurrent with
 * 5-min quote cache and 12h 52-week/technical cache; EOD exchanges read the
 * daily stock_boards table. News-surge enrichment is best-effort: it never
 * breaks the board when the pipeline is quiet.
 */
export async function getExchangeBoardRows(exchangeId: string): Promise<ExchangeBoard> {
  const exchange = EXCHANGE_BY_ID[exchangeId];
  if (!exchange || exchange.status !== "live") throw new BoardError("not-live");

  let rows: BoardRow[];
  try {
    if (exchange.source === "africanfinancials") {
      rows = (await getDBBoard(exchange.id)).map((q) => ({
        ticker: q.ticker,
        name: q.name,
        price: Number(q.price),
        previousClose: null,
        change: null,
        changePercent:
          q.change_percent != null ? Number(q.change_percent) : null,
        volume: q.volume != null ? Number(q.volume) : null,
        // Value traded comes straight from the EOD table.
        value: q.value_traded != null ? Number(q.value_traded) : null,
        updated: q.updated,
        // No price history yet for EOD listings — 52wk arrives with
        // accumulated daily snapshots.
        wk52High: null,
        wk52Low: null,
        rsi: null,
        aboveSma50: null,
        relVolume: null,
        // Filled by the caller (screener) or their own stock pages.
        newsSurge: null,
        limitHit: null,
        liquidity: "thin",
        speculation: false,
        asOf: q.fetched_at,
      }));
    } else {
      const quotes = await getBoard(exchange.tickers);
      const d = exchange.divisor;
      // 52-week stats + technicals are cached 12h server-side;
      // news signals 30 min. All independent — fan out together.
      const [w52, tc] = await Promise.all([
        mapParallel(exchange.tickers, 6, (t) => get52wkStats(t)),
        mapParallel(exchange.tickers, 6, (t) => getTechnicals(t)),
      ]);
      const wk52 = w52;
      const techs = tc;
      rows = quotes
        .map((q, qi) => ({ q, qi }))
        .filter(({ q }) => q && q.price != null)
        .map(({ q, qi }) => {
          const price = q!.price! / d;
          const vol = q!.bars[q!.bars.length - 1]?.v ?? null;
          const w = wk52[qi];
          const t = techs[qi];
          return {
            ticker: q!.ticker,
            name: q!.name,
            // Convert to display currency (e.g. ZAc → Rand).
            price,
            previousClose:
              q!.previousClose != null ? q!.previousClose / d : null,
            change: q!.change != null ? q!.change / d : null,
            changePercent: q!.changePercent,
            volume: vol,
            // Approximation: last price × latest daily share volume.
            value: vol != null ? price * vol : null,
            updated: null,
            wk52High: w?.high != null ? w.high / d : null,
            wk52Low: w?.low != null ? w.low / d : null,
            rsi: t?.rsi ?? null,
            aboveSma50: t?.aboveSma50 ?? null,
            relVolume: t?.relVolume ?? null,
            // Surge flags are computed below.
            newsSurge: null,
            limitHit: null,
            liquidity: "thin",
            speculation: false,
            asOf: q!.asOf,
          };
        });
    }
  } catch {
    throw new BoardError("unreachable");
  }

  // News-surge flags for price-history listings (JSE). EOD listings get
  // theirs on their own stock pages or via the screener; the board stays fast.
  if (exchange.source !== "africanfinancials") {
    try {
      const signals = await getNewsSignals(
        rows.map((r) => ({ ticker: r.ticker, name: r.name })),
      );
      const byTicker = new Map(signals.map((s) => [s.ticker, s]));
      for (const r of rows) {
        r.newsSurge = byTicker.get(r.ticker)?.surgeRatio ?? null;
      }
    } catch {
      /* news is enrichment — never break the board */
    }
  }

  // Limit-hit flags, where the exchange publishes a flat daily band.
  if (exchange.dailyLimitPct != null) {
    for (const r of rows) {
      r.limitHit = limitHitFor(r.changePercent, exchange.dailyLimitPct);
    }
  }

  // Liquidity tiers within this board (value traded, quartiles), then the
  // speculation signature over the finished rows. For EOD boards the
  // screener fills newsSurge later and recomputes speculation there.
  const byValue = [...rows].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  byValue.forEach((r, i) => {
    r.liquidity =
      r.value == null || r.value <= 0
        ? "thin"
        : i < byValue.length * 0.25
          ? "liquid"
          : i >= byValue.length * 0.75
            ? "thin"
            : "active";
  });
  for (const r of rows) r.speculation = isSpeculative(r);

  return {
    exchange: exchange.id,
    currencySymbol: exchange.currencySymbol,
    timeNote: exchange.timeNote,
    updated: rows.find((r) => r.updated)?.updated ?? null,
    rows,
  };
}
