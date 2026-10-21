import { Link } from "@tanstack/react-router";
import { PageContainer } from "./PageContainer";
import { TERMINAL_SECTIONS } from "./terminal-nav";

/**
 * The terminal's folio footer — provenance printed, not implied.
 * The site's one disclaimer lives here (instead of the sentence that
 * used to be hand-pasted into five pages), the data sources in plain
 * sentences, and the /terms link.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border/60">
      <PageContainer className="py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-foreground">
              Soko<span className="text-primary">_Stock</span>
            </p>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
              Where the numbers come from: Johannesburg prices come from Yahoo
              Finance, about 15 minutes behind the market. The other eleven
              exchanges come from African Financials, once a day after closing.
              Economy figures come from the Central Bank of Kenya. Every price
              on the site is marked &lsquo;live&rsquo; or &lsquo;end of
              day&rsquo; where it appears.
            </p>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
              Soko Stock is for learning and practising. Paper trades use
              virtual cash, and nothing here is investment advice.
            </p>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
              Soko Stock is information and practice only. We hold no client
              money, and we cannot trade for you — real share trading happens
              through CMA-licensed brokers.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2"
          >
            {TERMINAL_SECTIONS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {s.label}
              </Link>
            ))}
            <Link
              to="/terms"
              className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary underline-offset-4 hover:underline"
            >
              Disclaimer
            </Link>
          </nav>
        </div>
      </PageContainer>
    </footer>
  );
}
