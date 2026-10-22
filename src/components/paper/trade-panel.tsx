import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/ui/card";
import { StateBlock } from "@/components/common/states";
import { PaperLoginForm } from "@/components/paper/auth";
import { usePaperSession } from "@/components/paper/use-paper-session";
import { isStaleEod, START_CASH } from "@/lib/paper/fill";
import { sharesForAmount, sellSharesForAmount } from "@/lib/paper/amount";
import { estimateRealCost } from "@/lib/stocks/real-cost";
import { EXCHANGE_BY_ID, type Exchange } from "@/lib/stocks/exchanges";
import { fmtPrice as fmt } from "@/lib/stocks/format";
import {
  useStockDirectory,
  type DirectoryEntry,
} from "@/components/nav/use-directory";
import { cn } from "@/lib/utils";

/** The same plain words the trade flows use for engine errors. */
export const FRIENDLY: Record<string, string> = {
  insufficient_cash: "Not enough practice cash for this order.",
  insufficient_shares: "You don't hold that many shares.",
  invalid_qty: "Enter a whole number of shares.",
  quote_unavailable: "No price right now — try again shortly.",
  stale_eod:
    "This exchange has not published fresh prices in over 36 hours, so trading is paused until it does. Your practice money is safe.",
  exchange_not_live: "This market isn't tradeable yet.",
  login_required: "Your session expired — log in again.",
  invalid_token: "Your session expired — log in again.",
  network:
    "Network error — order status unknown. Check your shares below before trying again.",
};

export interface PositionRow {
  ticker: string;
  qty: number;
  avg: number;
  board: number | null;
  asOf: string | null;
  delayed: boolean;
}

export interface PortfolioResponse {
  ok: boolean;
  cash: Record<string, number>;
  positions: PositionRow[];
}

export interface OrderResponse {
  ok: boolean;
  error?: string;
  fill_price?: number;
  cash?: number | null;
  position?: { qty: number; avg: number };
}

/** What the orders API reports back after a sell: the account's new cash
 * in the sold currency and the position that remains (qty 0 = all sold). */
export interface SoldFill {
  ticker: string;
  currency: string;
  cash: number | null;
  position?: { qty: number; avg: number };
}

export async function placeOrder(
  ticker: string,
  side: "BUY" | "SELL",
  qty: number,
): Promise<OrderResponse> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: "login_required" };
    const r = await fetch("/api/paper/orders", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticker, side, qty, idempotencyKey: crypto.randomUUID() }),
    });
    return (await r.json()) as OrderResponse;
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Which exchange a ticker belongs to: directory first, then the pinned
 * JSE list (its tickers end .JO, not .JSE), then the suffix. */
export function exchangeForTicker(
  ticker: string,
  directory: DirectoryEntry[],
): Exchange | undefined {
  const fromDirectory = directory.find((e) => e.ticker === ticker);
  if (fromDirectory) return EXCHANGE_BY_ID[fromDirectory.exchange];
  const pinned = Object.values(EXCHANGE_BY_ID).find((e) => e.tickers.includes(ticker));
  if (pinned) return pinned;
  const m = ticker.match(/\.([A-Z]+)$/);
  return m ? EXCHANGE_BY_ID[m[1]] : undefined;
}

export function nameForTicker(ticker: string, directory: DirectoryEntry[]): string {
  return directory.find((e) => e.ticker === ticker)?.name ?? ticker;
}

/**
 * The signed-in practice portfolio (cash + positions), loaded from the
 * same endpoint everywhere. Keyed on the user id, not the user object:
 * the session hook hands back a fresh user object on every auth event,
 * and placing an order fires those events (placeOrder calls getSession)
 * — keying on the object made the effect cancel the post-order reload
 * mid-flight and throw its result away, leaving pre-trade figures on
 * screen until a manual reload.
 */
export function usePaperPortfolio(userId: string | null) {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s.session?.access_token;
        if (!token) {
          if (!cancelled) setFailed(true);
          return;
        }
        const r = await fetch("/api/paper/portfolio", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await r.json()) as PortfolioResponse;
        if (!cancelled) {
          if (j.ok) {
            setData(j);
            setFailed(false);
          } else setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  return { data, setData, failed, refresh };
}

/** One held position: what you paid, what it is worth, and the sell flow
 * (all / some shares / an amount), with the real-broker fee line for NSE. */
export function PositionCard({
  position: p,
  directory,
  onSold,
}: {
  position: PositionRow;
  directory: DirectoryEntry[];
  onSold: (msg: string, fill: SoldFill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "shares" | "amount">("all");
  const [sharesStr, setSharesStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ex = exchangeForTicker(p.ticker, directory);
  const sym = ex?.currencySymbol ?? "KSh";
  const name = nameForTicker(p.ticker, directory);
  const price = p.board;
  const paid = p.avg * p.qty;
  const worth = price != null ? price * p.qty : null;
  const diff = worth != null ? worth - paid : null;

  const amountNum = Number(amountStr.replace(/[^0-9.]/g, "")) || 0;
  const sharesNum = Math.floor(Number(sharesStr.replace(/[^0-9]/g, "")) || 0);
  const toSell =
    price == null
      ? 0
      : mode === "all"
        ? p.qty
        : mode === "shares"
          ? Math.min(sharesNum, p.qty)
          : sellSharesForAmount(amountNum, price, p.qty);
  const proceeds = price != null ? toSell * price : 0;
  const fee =
    ex?.currency === "KES" && proceeds > 0 ? estimateRealCost(proceeds).totalMid : null;

  const sell = async () => {
    setBusy(true);
    setError(null);
    const res = await placeOrder(p.ticker, "SELL", toSell);
    setBusy(false);
    if (!res.ok) {
      setError(FRIENDLY[res.error ?? ""] ?? "That sale didn't go through — try again.");
      return;
    }
    const got = (res.fill_price ?? price ?? 0) * toSell;
    onSold(
      `Sold ${toSell} ${toSell === 1 ? "share" : "shares"} of ${name} — ${fmt(got, sym)} is back in your practice cash.`,
      {
        ticker: p.ticker,
        currency: ex?.currency ?? "KES",
        cash: res.cash ?? null,
        position: res.position,
      },
    );
  };

  return (
    <Panel padding="md">
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
          You paid <span className="num font-mono text-foreground">{fmt(paid, sym)}</span>
          {price != null && (
            <>
              {" "}· worth{" "}
              <span className="num font-mono text-foreground">{fmt(worth ?? 0, sym)}</span> now
            </>
          )}
        </p>
        {diff != null && (
          <p className={cn("font-medium", diff > 0 && "text-success", diff < 0 && "text-destructive")}>
            {diff > 0
              ? `Up ${fmt(diff, sym)} since you bought`
              : diff < 0
                ? `Down ${fmt(-diff, sym)} since you bought`
                : "Same value as when you bought"}
          </p>
        )}
        {price == null && <p>No price for this company right now, so selling is paused.</p>}
      </div>
      {price != null && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-lg bg-destructive/15 px-4 py-3 text-sm font-bold text-destructive"
        >
          Sell
        </button>
      )}
      {price != null && open && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="How much to sell">
            {(
              [
                ["all", "Sell all"],
                ["shares", "Some shares"],
                ["amount", "An amount"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg border px-2 py-2.5 text-[13px] font-semibold",
                  mode === m
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "shares" && (
            <label className="mt-3 block">
              <span className="text-sm text-muted-foreground">
                How many shares? You have {p.qty}.
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={sharesStr}
                onChange={(e) => setSharesStr(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 10"
                className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          )}
          {mode === "amount" && (
            <label className="mt-3 block">
              <span className="text-sm text-muted-foreground">
                How much money&apos;s worth, in {ex?.currency ?? "shillings"}?
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 1,000"
                className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          )}
          {toSell > 0 ? (
            <p className="mt-3 text-sm leading-relaxed">
              Sell <span className="num font-mono font-semibold">{toSell}</span>{" "}
              {toSell === 1 ? "share" : "shares"} for about{" "}
              <span className="num font-mono font-semibold">{fmt(proceeds, sym)}</span> — the
              money goes back into your practice cash.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {mode === "all"
                ? "Tap confirm to sell everything."
                : "Type how much above, and the shares will be worked out for you."}
            </p>
          )}
          {fee != null && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              A real broker would take about {fmt(fee, sym)} of that in fees. Practice
              sales here are free.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              disabled={busy || toSell <= 0}
              onClick={sell}
              className="rounded-lg bg-destructive/15 px-4 py-3 text-sm font-bold text-destructive disabled:opacity-40"
            >
              {busy ? "Selling…" : `Sell ${toSell > 0 ? toSell : ""} shares`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border/70 px-4 py-3 text-sm font-semibold text-muted-foreground"
            >
              Keep them
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * The stock page's whole trading surface: the login form when signed
 * out; when signed in, your position in this company (with the sell
 * flow) above the amount-first buy panel. One account, the same paper
 * engine as everywhere else.
 */
export function StockTradePanel({
  ticker,
  name,
  price,
  currencySymbol,
  exchangeId,
  asOf,
}: {
  ticker: string;
  name: string;
  price: number | null;
  currencySymbol: string;
  exchangeId: string;
  asOf: string | null;
}) {
  const { user, loading } = usePaperSession();
  const userId = user?.id ?? null;
  const { data, setData, failed, refresh } = usePaperPortfolio(userId);
  const directory = useStockDirectory(!!user);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped on every completed sell so the buy panel can drop a stale
  // "you now own…" confirmation for shares that may no longer be held.
  const [sellCount, setSellCount] = useState(0);

  if (loading) {
    return <div className="mt-3 h-24 animate-pulse rounded-lg bg-muted/40" />;
  }
  if (!user) {
    return (
      <div className="mt-3">
        <PaperLoginForm compact />
      </div>
    );
  }

  const exchange = EXCHANGE_BY_ID[exchangeId];
  const eod = exchange?.source === "africanfinancials";
  const currency = exchange?.currency ?? "KES";
  const position = data?.positions.find((p) => p.ticker === ticker) ?? null;
  const cashAvail = data ? (data.cash[currency] ?? START_CASH) : START_CASH;

  return (
    <div className="mt-3 space-y-3">
      {failed ? (
        <StateBlock
          tone="error"
          message="Your practice account is unavailable right now — check back shortly."
        />
      ) : !data ? (
        <StateBlock tone="loading" message="Loading your practice account…" />
      ) : (
        <>
          {notice && (
            <p
              role="status"
              className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium text-success"
            >
              {notice}
            </p>
          )}
          {position && (
            <PositionCard
              position={position}
              directory={directory}
              onSold={(msg, fill) => {
                setNotice(msg);
                setSellCount((n) => n + 1);
                // Put the fill the API returned (new cash, remaining
                // position) on screen straight away, then reload in
                // full to reconcile.
                const pos = fill.position;
                setData((prev) => {
                  if (!prev) return prev;
                  const positions =
                    pos == null
                      ? prev.positions
                      : pos.qty <= 0
                        ? prev.positions.filter((row) => row.ticker !== fill.ticker)
                        : prev.positions.map((row) =>
                            row.ticker === fill.ticker
                              ? { ...row, qty: pos.qty, avg: pos.avg }
                              : row,
                          );
                  return {
                    ...prev,
                    cash:
                      fill.cash != null
                        ? { ...prev.cash, [fill.currency]: fill.cash }
                        : prev.cash,
                    positions,
                  };
                });
                refresh();
              }}
            />
          )}
          <FixedBuyPanel
            ticker={ticker}
            name={name}
            price={price}
            currencySymbol={currencySymbol}
            currency={currency}
            asOf={asOf}
            eod={eod}
            cashAvail={cashAvail}
            firstBuy={!position}
            sellCount={sellCount}
            onBought={() => {
              // A fresh buy makes any earlier sell notice stale.
              setNotice(null);
              refresh();
            }}
          />
        </>
      )}
    </div>
  );
}

/**
 * The amount-first buy flow for one fixed company — the stock page's
 * trading surface. Type an amount, see the shares, the leftover and (for
 * NSE) what a real broker would charge, then confirm. Same maths and the
 * same words as the old Trade page: sharesForAmount does the working out,
 * fills re-read the price server-side.
 */
export function FixedBuyPanel({
  ticker,
  name,
  price,
  currencySymbol: sym,
  currency,
  asOf,
  eod,
  cashAvail,
  firstBuy,
  sellCount,
  onBought,
}: {
  ticker: string;
  name: string;
  price: number | null;
  currencySymbol: string;
  /** ISO currency code of the listing (KES, ZAR, …) — drives the fee line. */
  currency: string;
  asOf: string | null;
  /** True for end-of-day listings (African Financials boards). */
  eod: boolean;
  cashAvail: number;
  firstBuy: boolean;
  /** Bumped by the parent on every completed sell, to drop a stale
   * "you now own…" confirmation for shares that may no longer be held. */
  sellCount: number;
  onBought: () => void;
}) {
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ owned: number; cost: number } | null>(null);

  useEffect(() => {
    setDone(null);
  }, [sellCount]);

  const stale = eod && isStaleEod(asOf);
  const amountNum = Number(amountStr.replace(/[^0-9.]/g, "")) || 0;
  const plan =
    price != null ? sharesForAmount(amountNum, price) : { shares: 0, cost: 0, leftover: 0 };
  const fee =
    currency === "KES" && plan.cost > 0 ? estimateRealCost(plan.cost).totalMid : null;
  const tooBig = plan.cost > cashAvail;
  const canConfirm = price != null && !stale && plan.shares > 0 && !tooBig && !busy;

  const confirm = async () => {
    if (plan.shares <= 0) return;
    setBusy(true);
    setError(null);
    const res = await placeOrder(ticker, "BUY", plan.shares);
    setBusy(false);
    if (!res.ok) {
      setError(FRIENDLY[res.error ?? ""] ?? "That buy didn't go through — try again.");
      return;
    }
    setDone({
      owned: res.position?.qty ?? plan.shares,
      cost: (res.fill_price ?? price ?? 0) * plan.shares,
    });
    onBought();
  };

  const reset = () => {
    setAmountStr("");
    setDone(null);
    setError(null);
  };

  return (
    <Panel variant="folio" padding="lg" aria-label={`Buy shares of ${name}`}>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        <span className="text-primary">Practice trade</span> · virtual cash
      </p>
      <h3 className="mt-1 font-display text-[20px] font-semibold leading-snug text-foreground">
        {firstBuy ? "Buy your first shares" : "Buy shares"}
      </h3>

      {price == null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          There is no price for this company right now, so it can&apos;t be bought
          today.
        </p>
      ) : stale ? (
        <p className="mt-2 text-sm text-muted-foreground">{FRIENDLY.stale_eod}</p>
      ) : done ? (
        <>
          <p role="status" className="mt-2 text-base font-semibold text-success">
            Done — you now own {done.owned} {done.owned === 1 ? "share" : "shares"} of{" "}
            {name}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This buy cost {fmt(done.cost, sym)} of practice money.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 w-full rounded-lg bg-success/15 px-4 py-3 text-sm font-bold text-success"
          >
            Buy more shares
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="num font-mono text-base font-semibold text-foreground">
              {fmt(price, sym)}
            </span>{" "}
            a share
            {eod
              ? " — that's the last closing price, and your practice trade uses it."
              : " — prices move through the day, about 15 minutes behind the market."}
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-foreground">
              How much do you want to spend?
            </span>
            <span className="mt-1 flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 focus-within:ring-2 focus-within:ring-primary/60">
              <span className="font-mono text-sm text-muted-foreground">{sym}</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="1,000"
                aria-label="Amount to spend"
                className="w-full bg-transparent py-3 text-base focus-visible:outline-none"
              />
            </span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {[500, 1000, 2500, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmountStr(String(v))}
                className="rounded-full border border-border/70 px-3 py-2 font-mono text-[13px] text-muted-foreground"
              >
                {sym} {v.toLocaleString("en-ZA")}
              </button>
            ))}
          </div>

          {amountNum > 0 && plan.shares === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              One share costs {fmt(price, sym)} — add a little more to buy your
              first share.
            </p>
          )}
          {plan.shares > 0 && (
            <div className="mt-3 rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed">
              <p>
                You get{" "}
                <span className="num font-mono font-semibold text-foreground">
                  {plan.shares} {plan.shares === 1 ? "share" : "shares"}
                </span>{" "}
                of {name}, at {fmt(price, sym)} each ={" "}
                <span className="num font-mono font-semibold text-foreground">
                  {fmt(plan.cost, sym)}
                </span>
                .
              </p>
              {plan.leftover > 0 && (
                <p className="mt-1 text-muted-foreground">
                  {fmt(plan.leftover, sym)} stays in your account as cash — it
                  isn&apos;t enough for another whole share.
                </p>
              )}
              {fee != null && (
                <p className="mt-1 text-muted-foreground">
                  With a real broker this buy would cost about {fmt(fee, sym)} in
                  fees. Practice trades here are free.
                </p>
              )}
            </div>
          )}
          {tooBig && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              That&apos;s more than your practice cash — you have{" "}
              {fmt(cashAvail, sym)}. Lower the amount.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={!canConfirm}
            onClick={confirm}
            className="mt-4 w-full rounded-lg bg-success/15 px-4 py-3.5 text-base font-bold text-success disabled:opacity-40"
          >
            {busy
              ? "Buying…"
              : plan.shares > 0
                ? `Buy ${plan.shares} shares · ${fmt(plan.cost, sym)}`
                : "Buy shares"}
          </button>
        </>
      )}
    </Panel>
  );
}
