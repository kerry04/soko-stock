import { createFileRoute, Link } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Disclaimer — Soko Stock" },
      {
        name: "description",
        content:
          "Soko Stock is a free educational market terminal. Not investment advice.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <TerminalShell>
      <div className="mx-auto max-w-[720px] space-y-5 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Disclaimer</h1>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Soko Stock is a free, read-only market terminal for education and research.
            There are no accounts, no deposits, no trading, and no order execution on
            this site.
          </p>
          <p>
            Prices are indicative and may be delayed. Quotes come from third-party
            data providers and can be wrong, stale, or unavailable — especially
            outside market hours. Always verify prices with your broker before
            making any investment decision.
          </p>
          <p>
            Nothing on this site is investment advice, a recommendation, or an offer
            to buy or sell any security. Investing in equities involves risk,
            including the possible loss of principal. Past performance does not
            predict future results.
          </p>
          <p>
            News signals shown alongside stocks are automatically matched headlines
            from our news pipeline, not editorial analysis. They describe what the
            world is reporting, not what will happen to a price.
          </p>
          <p>
            <Link to="/" className="text-success hover:underline">
              ← Back to the boards
            </Link>
          </p>
        </div>
      </div>
    </TerminalShell>
  );
}
