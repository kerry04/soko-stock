import { Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { StateBlock } from "@/components/common/states";
import { PaperLoginForm } from "@/components/paper/auth";
import {
  exchangeForTicker,
  nameForTicker,
  type PortfolioResponse,
} from "@/components/paper/trade-panel";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { START_CASH } from "@/lib/paper/fill";
import { fmtPrice as fmt } from "@/lib/stocks/format";
import type { DirectoryEntry } from "@/components/nav/use-directory";
import { cn } from "@/lib/utils";

export interface AccountState {
  user: User | null;
  authLoading: boolean;
  data: PortfolioResponse | null;
  failed: boolean;
  directory: DirectoryEntry[];
}

/** Shares worth, grouped by the currency each company trades in. */
function worthByCcy(
  data: PortfolioResponse,
  directory: DirectoryEntry[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of data.positions) {
    const ex = exchangeForTicker(p.ticker, directory);
    const ccy = ex?.currency ?? "KES";
    out.set(ccy, (out.get(ccy) ?? 0) + (p.board ?? p.avg) * p.qty);
  }
  return out;
}

function symbolFor(ccy: string): string {
  return (
    Object.values(EXCHANGE_BY_ID).find((e) => e.currency === ccy)?.currencySymbol ??
    ""
  );
}

/**
 * The practice account strip at the top of the globe home. Signed out it
 * is one plain line and the login form; signed in it is the money: cash
 * per currency and what the shares are worth.
 */
export function AccountStrip({ state }: { state: AccountState }) {
  const { user, authLoading, data, failed, directory } = state;

  if (authLoading) {
    return (
      <StateBlock
        tone="loading"
        message="Loading your practice account…"
        className="mb-5"
      />
    );
  }

  if (!user) {
    return (
      <Panel padding="lg" className="mb-5" aria-label="Your practice account">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div>
            <PanelHeader>
              <PanelTitle>Your practice account</PanelTitle>
            </PanelHeader>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every account starts with{" "}
              <span className="num font-mono text-base font-semibold text-foreground">
                {fmt(START_CASH, "KSh")}
              </span>{" "}
              of practice money. Buy and sell real companies at their real
              prices, watch what happens, and learn how trading feels — with
              nothing at risk. Log in or create an account to start.
            </p>
          </div>
          <PaperLoginForm />
        </div>
      </Panel>
    );
  }

  if (failed) {
    return (
      <StateBlock
        tone="error"
        message="Your practice account is unavailable right now — check back shortly."
        className="mb-5"
      />
    );
  }
  if (!data) {
    return (
      <StateBlock
        tone="loading"
        message="Loading your practice account…"
        className="mb-5"
      />
    );
  }

  const fresh = Object.keys(data.cash).length === 0 && data.positions.length === 0;
  const worth = worthByCcy(data, directory);
  const kesCash = data.cash["KES"] ?? START_CASH;
  const kesWorth = worth.get("KES") ?? 0;
  const otherLines: string[] = [];
  const ccys = new Set([...Object.keys(data.cash), ...worth.keys()]);
  for (const ccy of ccys) {
    if (ccy === "KES") continue;
    const sym = symbolFor(ccy);
    const bits: string[] = [];
    if (data.cash[ccy] != null) bits.push(`${fmt(data.cash[ccy], sym)} in cash`);
    if ((worth.get(ccy) ?? 0) > 0)
      bits.push(`${fmt(worth.get(ccy) ?? 0, sym)} in shares`);
    if (bits.length) otherLines.push(`You also have ${bits.join(" and ")} (${ccy}).`);
  }

  return (
    <Panel variant="folio" padding="lg" className="mb-5" aria-label="Your practice account">
      <PanelHeader>
        <PanelTitle>Your practice account</PanelTitle>
      </PanelHeader>
      {fresh ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          You start with{" "}
          <span className="num font-mono text-base font-semibold text-foreground">
            {fmt(START_CASH, "KSh")}
          </span>{" "}
          of practice money. Pick a company — from the map below, the News page,
          or search — open its page, and buy your first shares there. Every
          price is the real market price, so the ups and downs are real too.
          Only the money is pretend.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Cash you can spend
              </p>
              <p className="num mt-1 font-mono text-xl font-semibold text-foreground">
                {fmt(kesCash, "KSh")}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Your shares are worth
              </p>
              <p className="num mt-1 font-mono text-xl font-semibold text-foreground">
                {fmt(kesWorth, "KSh")}
              </p>
            </div>
          </div>
          {otherLines.map((l) => (
            <p key={l} className="mt-2 text-[13px] text-muted-foreground">
              {l}
            </p>
          ))}
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            This is practice money at real prices. Nothing here is real money —
            it can&apos;t be lost, spent or taken out.
          </p>
        </>
      )}
    </Panel>
  );
}

/**
 * "Your shares" — the positions list under the globe. Each row is the
 * company, how many shares, what was paid and what they are worth now,
 * and the whole row opens the company's page (where selling lives).
 */
export function YourShares({ state }: { state: AccountState }) {
  const { user, data, directory } = state;
  if (!user || !data || data.positions.length === 0) return null;

  return (
    <section aria-label="Your shares" className="mt-6">
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
        Your shares
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What you hold in your practice account. Open a company to sell, or to
        buy more.
      </p>
      <div className="mt-3 space-y-2">
        {data.positions.map((p) => {
          const ex = exchangeForTicker(p.ticker, directory);
          const sym = ex?.currencySymbol ?? "KSh";
          const name = nameForTicker(p.ticker, directory);
          const paid = p.avg * p.qty;
          const worth = p.board != null ? p.board * p.qty : null;
          const diff = worth != null ? worth - paid : null;
          return (
            <Link
              key={p.ticker}
              to="/stocks/$ticker"
              params={{ ticker: p.ticker }}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Panel padding="md" className="transition-colors hover:border-primary/50">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-[17px] font-semibold leading-snug text-foreground">
                      {name}
                    </h3>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {p.ticker}
                      {p.delayed ? " · yesterday's close" : ""}
                    </p>
                  </div>
                  <p className="num font-mono text-base font-semibold text-foreground">
                    {p.qty} {p.qty === 1 ? "share" : "shares"}
                  </p>
                </div>
                <div className="mt-2 space-y-0.5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    You paid{" "}
                    <span className="num font-mono text-foreground">{fmt(paid, sym)}</span>
                    {worth != null && (
                      <>
                        {" "}· worth{" "}
                        <span className="num font-mono text-foreground">
                          {fmt(worth, sym)}
                        </span>{" "}
                        now
                      </>
                    )}
                  </p>
                  {diff != null && (
                    <p
                      className={cn(
                        "font-medium",
                        diff > 0 && "text-success",
                        diff < 0 && "text-destructive",
                      )}
                    >
                      {diff > 0
                        ? `Up ${fmt(diff, sym)} since you bought`
                        : diff < 0
                          ? `Down ${fmt(-diff, sym)} since you bought`
                          : "Same value as when you bought"}
                    </p>
                  )}
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
