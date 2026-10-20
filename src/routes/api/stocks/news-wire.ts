import { createFileRoute } from "@tanstack/react-router";
import { getNewsWire } from "@/lib/stocks/news-wire.server";

/**
 * GET /api/stocks/news-wire
 * The News Desk payload: the 48h headline wire plus topic desks whose 24h
 * story rate is compared with their 30-day daily median (deviation flags).
 */
export const Route = createFileRoute("/api/stocks/news-wire")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await getNewsWire();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "news wire unavailable" }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
