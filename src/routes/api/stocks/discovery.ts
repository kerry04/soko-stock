import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGES } from "@/lib/stocks/exchanges";
import { getDBBoard } from "@/lib/stocks/boards-db.server";
import { getExchangeBoardRows } from "@/lib/stocks/board-rows.server";
import { getNewsWire, type HeatItem } from "@/lib/stocks/news-wire.server";
import {
  discoveryDate,
  groupBySector,
  newestRowDate,
  topMovers,
  type DiscoveryRow,
} from "@/lib/stocks/discovery";

/**
 * GET /api/stocks/discovery — three honest lists from data the app already
 * holds: the day's biggest movers across every live board, the news wire's
 * measured "most talked about" companies, and daily-board names grouped by
 * their own sector text. Cached ten minutes.
 *
 * No popularity list: there is no crowd data anywhere in this app.
 */

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; result: DiscoveryPayload } | null = null;

export interface TalkedRow extends DiscoveryRow {
  count24h: number;
  surgeRatio: number | null;
  surging: boolean;
}

interface DiscoveryPayload {
  asOf: string;
  movers: {
    date: string;
    gainers: DiscoveryRow[];
    losers: DiscoveryRow[];
  };
  talked: {
    date: string;
    rows: TalkedRow[];
  };
  sectors: {
    date: string;
    groups: ReturnType<typeof groupBySector>;
  };
}

async function gatherDailyRows(): Promise<DiscoveryRow[]> {
  const out: DiscoveryRow[] = [];
  for (const ex of EXCHANGES) {
    if (ex.source !== "africanfinancials" || ex.status !== "live") continue;
    try {
      const rows = await getDBBoard(ex.id);
      for (const r of rows) {
        out.push({
          ticker: r.ticker,
          name: r.name,
          exchange: ex.id,
          price: Number(r.price),
          changePercent: r.change_percent != null ? Number(r.change_percent) : null,
          currencySymbol: ex.currencySymbol,
          value: r.value_traded != null ? Number(r.value_traded) : null,
          asOf: r.fetched_at,
          updated: r.updated,
          sector: r.sector,
        });
      }
    } catch {
      /* one exchange down — the other lists still serve */
    }
  }
  return out;
}

async function gatherJseRows(): Promise<DiscoveryRow[]> {
  try {
    const board = await getExchangeBoardRows("JSE");
    return board.rows.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      exchange: "JSE",
      price: r.price,
      changePercent: r.changePercent,
      currencySymbol: board.currencySymbol,
      value: r.value,
      asOf: r.asOf,
      updated: board.updated,
      sector: null,
    }));
  } catch {
    return [];
  }
}

export async function getDiscovery(): Promise<DiscoveryPayload> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;

  const [daily, jse] = await Promise.all([gatherDailyRows(), gatherJseRows()]);
  const all = [...daily, ...jse];
  const byTicker = new Map(all.map((r) => [r.ticker, r]));
  const date = discoveryDate();

  const movers = topMovers(all, 5);

  let heat: HeatItem[] = [];
  try {
    heat = (await getNewsWire()).heat;
  } catch {
    heat = [];
  }
  const talked: TalkedRow[] = heat
    .map((h) => {
      const row = byTicker.get(h.ticker);
      if (!row) return null;
      return {
        ...row,
        count24h: h.count24h,
        surgeRatio: h.surgeRatio,
        surging: h.surging,
      };
    })
    .filter((r): r is TalkedRow => r != null);

  // Each list is stamped with the newest price date among its own rows —
  // a board from yesterday is stamped yesterday, never today.
  const result: DiscoveryPayload = {
    asOf: new Date().toISOString(),
    movers: { date: newestRowDate(all, date), gainers: movers.gainers, losers: movers.losers },
    talked: { date: newestRowDate(talked.length > 0 ? talked : all, date), rows: talked },
    sectors: { date: newestRowDate(daily, date), groups: groupBySector(daily, 6) },
  };
  cache = { at: Date.now(), result };
  return result;
}

export const Route = createFileRoute("/api/stocks/discovery")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await getDiscovery();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "discovery unavailable" }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
