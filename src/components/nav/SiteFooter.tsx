import { Link } from "@tanstack/react-router";
import { PageContainer } from "./PageContainer";
import { TERMINAL_SECTIONS } from "./terminal-nav";

/**
 * The terminal's folio footer — provenance printed, not implied.
 * One disclaimer (instead of the sentence hand-pasted into five pages),
 * the data sources with their freshness contract, and the /terms link.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border/60">
      <PageContainer className="py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-foreground">
              Soko<span className="text-primary">_Stock</span>
              <span className="ml-3 font-medium text-muted-foreground">
                Educational terminal — not investment advice
              </span>
            </p>
            <p className="mt-2 max-w-xl font-mono text-[10px] leading-relaxed tracking-[0.08em] text-muted-foreground">
              JSE INTRADAY VIA YAHOO FINANCE · NSE / NGX / GSE + 8 EXCHANGES EOD
              VIA AFRICAN FINANCIALS · MACRO VIA CENTRAL BANK OF KENYA · NEWS
              WIRE VIA THE SOKO PIPELINE — EVERY BOARD IS LABELLED LIVE OR EOD
              WHERE IT APPEARS.
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
