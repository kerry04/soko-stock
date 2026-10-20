import { createFileRoute } from "@tanstack/react-router";
import { getScreener } from "@/lib/stocks/screener.server";

/**
 * GET /api/stocks/screener
 * Every live exchange's rows, each tagged with the screens it matches, plus
 * per-screen counts. The page filters client-side so switching screens is
 * instant. Exchanges that fail to load are named in failedExchanges rather
 * than silently dropped.
 */
export const Route = createFileRoute("/api/stocks/screener")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await getScreener();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "screener unavailable" }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
