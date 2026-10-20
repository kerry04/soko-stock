import { createFileRoute } from "@tanstack/react-router";
import { EXCHANGES } from "@/lib/stocks/exchanges";
import { getDBBoard } from "@/lib/stocks/boards-db.server";
import { getExchangeBoardRows } from "@/lib/stocks/board-rows.server";

/**
 * GET /api/stocks/directory
 * The full ticker directory (ticker, name, exchange) for the command
 * line and quick switcher: EOD listings come from the stock_boards
 * table via the shared reader, JSE names from the live board builder.
 * Cached in-memory for 10 minutes — the directory changes at most daily.
 */

interface DirectoryEntry {
  ticker: string;
  name: string;
  exchange: string;
}

let cache: { at: number; entries: DirectoryEntry[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function buildDirectory(): Promise<DirectoryEntry[]> {
  const entries: DirectoryEntry[] = [];

  for (const ex of EXCHANGES) {
    if (ex.source !== "africanfinancials" || ex.status !== "live") continue;
    try {
      const rows = await getDBBoard(ex.id);
      for (const r of rows) entries.push({ ticker: r.ticker, name: r.name, exchange: ex.id });
    } catch {
      /* one exchange down — the rest of the directory still serves */
    }
  }

  try {
    const jse = await getExchangeBoardRows("JSE");
    const seen = new Set(entries.map((e) => e.ticker));
    for (const r of jse.rows) {
      if (!seen.has(r.ticker)) entries.push({ ticker: r.ticker, name: r.name, exchange: "JSE" });
    }
  } catch {
    /* JSE feed down — directory still serves the EOD exchanges */
  }

  return entries;
}

export const Route = createFileRoute("/api/stocks/directory")({
  server: {
    handlers: {
      GET: async () => {
        if (!cache || Date.now() - cache.at > TTL_MS) {
          cache = { at: Date.now(), entries: await buildDirectory() };
        }
        return new Response(JSON.stringify({ ok: true, stocks: cache.entries }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
