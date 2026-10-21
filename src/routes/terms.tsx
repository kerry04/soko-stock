import { createFileRoute, Link } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Disclaimer — Soko Stock" },
      {
        name: "description",
        content:
          "What Soko Stock is and is not: a free site for learning how stock markets work, with practice trading in virtual cash. Real-money trading happens through licensed brokers.",
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
            Soko Stock is a free site for learning how stock markets work. You can
            follow prices on twelve African exchanges and practise buying and selling
            with virtual cash — that is called paper trading, and no real money moves.
            You cannot trade real money here yet. When real trading arrives, it will
            be through a licensed broker, and this page will say so.
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
            News items shown alongside stocks are headlines matched automatically
            from the outlets we follow, not editorial analysis. They describe what the
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
