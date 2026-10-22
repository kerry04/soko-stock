import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StateBlock } from "@/components/common/states";
import { PaperLoginForm } from "@/components/paper/auth";
import { PortfolioHistory } from "@/components/paper/portfolio-history";
import { PriceAsOf } from "@/components/stocks/PriceAsOf";
import {
  exchangeForTicker,
  nameForTicker,
  type PortfolioResponse,
} from "@/components/paper/trade-panel";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { START_CASH } from "@/lib/paper/fill";
import { seriesForCurrency } from "@/lib/paper/history";
import { fmtPrice as fmt, timeAgo } from "@/lib/stocks/format";
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
    const ccy = p.currency ?? ex?.currency ?? "KES";
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
 * is one plain line and the login form; signed in it is the money: one
 * currency at a time, the value chart, and the chips to switch currency.
 */
export function AccountStrip({ state }: { state: AccountState }) {
  const { user, authLoading, data, failed, directory } = state;
  const [ccy, setCcy] = useState("KES");

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
  const ccys = [...new Set([...Object.keys(data.cash), ...worth.keys()])].sort((a, b) => {
    if (a === "KES") return -1;
    if (b === "KES") return 1;
    return a.localeCompare(b);
  });
  const activeCcy = ccys.includes(ccy) ? ccy : ccys.includes("KES") ? "KES" : ccys[0];
  const activeSymbol = symbolFor(activeCcy ?? "KES");
  const activeCash = data.cash[activeCcy ?? "KES"] ?? 0;
  const activeWorth = worth.get(activeCcy ?? "KES") ?? 0;
  const points = activeCcy ? seriesForCurrency(data.history ?? [], activeCcy) : [];

  return (
    <Panel variant="folio" padding="lg" className="mb-5" aria-label="Your practice account">
      <PanelHeader>
        <PanelTitle>Your practice account</PanelTitle>
        {ccys.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Currency">
            {ccys.map((c) => (
              <Chip
                key={c}
                active={activeCcy === c}
                size="sm"
                onClick={() => setCcy(c)}
                aria-label={`Show ${c} practice value`}
              >
                {c}
              </Chip>
            ))}
          </div>
        )}
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
          <PortfolioHistory
            points={points}
            symbol={activeSymbol}
            cash={activeCash}
            worth={activeWorth}
          />
          {ccys.length > 1 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Showing {activeCcy} · switch currency above
            </p>
          )}
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
                    </p>
                    <PriceAsOf
                      exchange={ex?.id}
                      asOf={p.asOf}
                      className="mt-0.5 normal-case tracking-normal"
                    />
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

/**
 * "Activity" — the signed-in account's most recent eight orders in plain
 * words. Every row opens the company page it belongs to.
 */
export function RecentActivity({ state }: { state: AccountState }) {
  const { user, data, directory } = state;
  if (!user || !data) return null;
  const orders = (data.orders ?? []).slice(0, 8);

  return (
    <section aria-label="Activity" className="mt-6">
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
        Activity
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your most recent practice orders, newest first.
      </p>
      {orders.length === 0 ? (
        <StateBlock
          tone="empty"
          className="mt-3"
          title="No orders yet"
          message="Your buys and sells will appear here."
        />
      ) : (
        <div className="mt-3 space-y-1.5">
          {orders.map((o) => {
            const ex = EXCHANGE_BY_ID[o.exchange];
            const sym = ex?.currencySymbol ?? "";
            const name = nameForTicker(o.ticker, directory);
            const qty = Number(o.qty);
            const price = Number(o.fill_price);
            return (
              <Link
                key={`${o.ticker}-${o.created_at}-${o.side}`}
                to="/stocks/$ticker"
                params={{ ticker: o.ticker }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    <span className="font-semibold">
                      {o.side === "BUY" ? "Bought" : "Sold"}
                    </span>{" "}
                    {qty} {qty === 1 ? "share" : "shares"} of {name}
                  </p>
                  <p className="num mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {fmt(price, sym)} each · {timeAgo(o.created_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]",
                    o.side === "BUY"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive",
                  )}
                >
                  {o.side === "BUY" ? "Buy" : "Sell"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
