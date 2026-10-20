import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { bandState, type BandState } from "@/lib/server/macro/signals";

// GET /api/macro/overview
// Public read API for the economy page: latest value per indicator, the
// inflation band state, and the last 24 CPI YoY points for the sparkline.
// Degrades per indicator — one missing or failed series becomes null and
// never fails the whole response.

interface IndicatorSnapshot {
  value: number;
  unit: string | null;
  released_at: string;
  source: string;
  source_url: string | null;
  verified: boolean;
}

interface HistoryPoint {
  released_at: string;
  value: number;
}

const INDICATORS = [
  "cpi_yoy",
  "cbr",
  "fx_usd",
  "tbill_91",
  "tbill_182",
  "tbill_364",
] as const;

type IndicatorKey = (typeof INDICATORS)[number];

const CPI_HISTORY_LIMIT = 24;

function readClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type DbClient = ReturnType<typeof readClient>;

async function latestOf(
  db: DbClient,
  indicator: IndicatorKey,
): Promise<IndicatorSnapshot | null> {
  const { data, error } = await db
    .from("macro_indicators")
    .select("value, unit, released_at, source, source_url, verified")
    .eq("indicator", indicator)
    .eq("country", "KE")
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    value: Number(data.value),
    unit: data.unit as string | null,
    released_at: data.released_at as string,
    source: data.source as string,
    source_url: data.source_url as string | null,
    verified: Boolean(data.verified),
  };
}

async function cpiHistory(db: DbClient): Promise<HistoryPoint[]> {
  const { data, error } = await db
    .from("macro_indicators")
    .select("released_at, value")
    .eq("indicator", "cpi_yoy")
    .eq("country", "KE")
    .order("released_at", { ascending: false })
    .limit(CPI_HISTORY_LIMIT);
  if (error || !data) return [];
  return (data as { released_at: string; value: number }[])
    .map((r) => ({ released_at: r.released_at, value: Number(r.value) }))
    .reverse();
}

export const Route = createFileRoute("/api/macro/overview")({
  server: {
    handlers: {
      GET: async () => {
        const db = readClient();

        const indicators = {} as Record<IndicatorKey, IndicatorSnapshot | null>;
        await Promise.all(
          INDICATORS.map(async (key) => {
            try {
              indicators[key] = await latestOf(db, key);
            } catch {
              indicators[key] = null;
            }
          }),
        );

        let history: HistoryPoint[] = [];
        try {
          history = await cpiHistory(db);
        } catch {
          history = [];
        }

        const cpi = indicators.cpi_yoy;
        const band: BandState | null = cpi ? bandState(cpi.value) : null;

        return new Response(
          JSON.stringify(
            {
              ok: true,
              band,
              indicators,
              cpiHistory: history,
              asOf: new Date().toISOString(),
            },
            null,
            2,
          ),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
