import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import {
  MACRO_OUTLETS,
  ingestMacroOutlet,
  type ParsedIndicator,
} from "@/lib/server/macro/ingestors";

// Macro-economic data ingestion — config-driven outlet registry in
// src/lib/server/macro/ingestors.ts (KNBS CPI, CBK rate/FX/T-bill pages).
// Cadence: fired by pg_cron; outlets run sequentially, each isolated, and
// parsed indicators are upserted on (indicator, country, released_at) so a
// re-ingest updates values instead of duplicating rows.

interface OutletResult {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}

function toRow(p: ParsedIndicator, verified: boolean) {
  return {
    indicator: p.indicator,
    country: "KE",
    value: p.value,
    unit: p.unit,
    released_at: p.released_at,
    source: p.source,
    source_url: p.source_url,
    // Rows are verified only for outlets whose parser has passed a live-page
    // validation (outlet.validated — honesty rule: scraped-but-unvalidated
    // is never served as fact).
    verified,
  };
}

export const Route = createFileRoute("/api/public/hooks/ingest-macro")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const results: OutletResult[] = [];

        for (const outlet of MACRO_OUTLETS) {
          try {
            const res = await ingestMacroOutlet(outlet, admin);
            if (!res.ok) {
              results.push({
                id: outlet.id,
                ok: false,
                count: 0,
                error: res.error ?? "outlet failed",
              });
              continue;
            }
            const rows = res.indicators.map((p) => toRow(p, outlet.validated));
            if (rows.length > 0) {
              const { error } = await admin
                .from("macro_indicators")
                .upsert(rows, {
                  onConflict: "indicator,country,released_at",
                  ignoreDuplicates: false,
                });
              if (error) {
                results.push({
                  id: outlet.id,
                  ok: false,
                  count: 0,
                  error: "database upsert failed",
                });
                continue;
              }
            }
            results.push({ id: outlet.id, ok: true, count: rows.length });
          } catch {
            // Per-outlet isolation: one bad outlet never breaks the hook.
            results.push({
              id: outlet.id,
              ok: false,
              count: 0,
              error: "outlet errored",
            });
          }
        }

        return new Response(JSON.stringify({ ok: true, results }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
