import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { StateBlock } from "@/components/common/states";
import { PaperLoginForm } from "@/components/paper/auth";
import { usePaperSession } from "@/components/paper/use-paper-session";
import {
  FRIENDLY,
  placeOrder,
  exchangeForTicker,
  usePaperPortfolio,
  PositionCard,
  type PortfolioResponse,
} from "@/components/paper/trade-panel";
import { useStockDirectory, type DirectoryEntry } from "@/components/nav/use-directory";
import { isStaleEod, START_CASH } from "@/lib/paper/fill";
import { sharesForAmount } from "@/lib/paper/amount";
import { estimateRealCost } from "@/lib/stocks/real-cost";
import { EXCHANGE_BY_ID } from "@/lib/stocks/exchanges";
import { fmtPrice as fmt } from "@/lib/stocks/format";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade — Soko Stock" },
      {
        name: "description",
        content:
          "Buy and sell shares with practice money at real prices. Type an amount in shillings, see how many shares you get, and learn how trading works before you use a real broker.",
      },
    ],
  }),
  component: TradePage,
});

interface BoardRowLite {
  ticker: string;
  name: string;
  price: number;
  value: number | null;
  asOf: string;
}

function TradePage() {
  const { user, loading: authLoading } = usePaperSession();
  const userId = user?.id ?? null;
  const { data, setData, failed, refresh } = usePaperPortfolio(userId);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped on every completed sell so the buy panel can drop a stale
  // "you now own…" confirmation for shares that may no longer be held.
  const [sellCount, setSellCount] = useState(0);
  const directory = useStockDirectory(!!user);

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="TRDE · Trade"
          title="Trade"
          description="Buy and sell shares with practice money, at real prices. Type an amount, see how many shares you get, and learn how trading feels — before any real money is involved."
        />

        {authLoading && (
          <StateBlock tone="loading" message="Loading your practice account…" />
        )}
        {!authLoading && !user && (
          <div className="max-w-[760px] space-y-4">
            <Panel padding="lg">
              <p className="text-sm leading-relaxed text-muted-foreground">
                This page is a practice trading account. You start with{" "}
                <span className="font-semibold text-foreground">KSh 100,000</span> of
                practice money, buy and sell real companies at their real prices, and
                watch what happens — with nothing at risk. Log in or create an account
                to start; it is the same account as the paper portfolio.
              </p>
            </Panel>
            <div className="max-w-md">
              <PaperLoginForm />
            </div>
          </div>
        )}
        {!authLoading && user && failed && (
          <StateBlock
            tone="error"
            message="Your practice account is unavailable right now — check back shortly."
          />
        )}
        {!authLoading && user && !failed && !data && (
          <StateBlock tone="loading" message="Loading your practice account…" />
        )}
        {!authLoading && user && !failed && data && (
          <div className="max-w-[760px] space-y-4">
            <AccountHome data={data} directory={directory} />
            {notice && (
              <p
                role="status"
                className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium text-success"
              >
                {notice}
              </p>
            )}
            {data.positions.length > 0 && (
              <section id="your-shares" aria-label="Your shares" className="space-y-3">
                <h2 className="font-display text-[20px] font-semibold tracking-tight text-foreground">
                  Your shares
                </h2>
                {data.positions.map((p) => (
                  <PositionCard
                    key={p.ticker}
                    position={p}
                    directory={directory}
                    onSold={(msg, fill) => {
                      setNotice(msg);
                      setSellCount((n) => n + 1);
                      // Put the fill the API returned (new cash, remaining
                      // position) on screen straight away — the same
                      // response data the buy flow confirms with — then
                      // reload in full to reconcile.
                      const pos = fill.position;
                      setData((prev) => {
                        if (!prev) return prev;
                        const positions =
                          pos == null
                            ? prev.positions
                            : pos.qty <= 0
                              ? prev.positions.filter(
                                  (row) => row.ticker !== fill.ticker,
                                )
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
                ))}
              </section>
            )}
            <BuyShares
              cash={data.cash}
              directory={directory}
              firstBuy={data.positions.length === 0}
              sellCount={sellCount}
              onBought={() => {
                // A fresh buy makes any earlier sell notice stale.
                setNotice(null);
                refresh();
              }}
            />
            <Panel padding="md">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Prices come from the same boards as the rest of Soko Stock, and
                practice trades go through straight away at the price shown. Ready
                for the real thing? You will need a broker and a CDS account —{" "}
                <Link to="/start" className="font-medium text-primary hover:underline">
                  Start shows the five steps
                </Link>
                . Your full history is on the{" "}
                <Link to="/portfolio" className="font-medium text-primary hover:underline">
                  portfolio page
                </Link>
                .
              </p>
            </Panel>
          </div>
        )}
      </PageContainer>
    </TerminalShell>
  );
}

function AccountHome({
  data,
  directory,
}: {
  data: PortfolioResponse;
  directory: DirectoryEntry[];
}) {
  const fresh = Object.keys(data.cash).length === 0 && data.positions.length === 0;
  const kesCash = data.cash["KES"] ?? START_CASH;

  // Shares worth, grouped by the currency each company trades in.
  const worthByCcy = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of data.positions) {
      const ex = exchangeForTicker(p.ticker, directory);
      const ccy = ex?.currency ?? "KES";
      out.set(ccy, (out.get(ccy) ?? 0) + (p.board ?? p.avg) * p.qty);
    }
    return out;
  }, [data.positions, directory]);

  const kesWorth = worthByCcy.get("KES") ?? 0;
  const otherLines = useMemo(() => {
    const lines: string[] = [];
    const ccys = new Set([...Object.keys(data.cash), ...worthByCcy.keys()]);
    for (const ccy of ccys) {
      if (ccy === "KES") continue;
      const ex = Object.values(EXCHANGE_BY_ID).find((e) => e.currency === ccy);
      const sym = ex?.currencySymbol ?? "";
      const bits: string[] = [];
      if (data.cash[ccy] != null) bits.push(`${fmt(data.cash[ccy], sym)} in cash`);
      if ((worthByCcy.get(ccy) ?? 0) > 0)
        bits.push(`${fmt(worthByCcy.get(ccy) ?? 0, sym)} in shares`);
      if (bits.length) lines.push(`You also have ${bits.join(" and ")} (${ccy}).`);
    }
    return lines;
  }, [data.cash, worthByCcy]);

  return (
    <Panel variant="folio" padding="lg" aria-label="Your practice account">
      <PanelHeader>
        <PanelTitle>Your practice account</PanelTitle>
      </PanelHeader>
      {fresh ? (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You start with{" "}
            <span className="num font-mono text-base font-semibold text-foreground">
              {fmt(START_CASH, "KSh")}
            </span>{" "}
            of practice money. Buy your first shares below and watch what happens —
            every price is the real market price, so the ups and downs are real too.
            Only the money is pretend.
          </p>
          <a
            href="#buy"
            className="mt-4 block rounded-lg bg-success/15 px-4 py-3.5 text-center text-base font-bold text-success"
          >
            Buy your first shares
          </a>
        </>
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
            This is practice money at real prices. Nothing here is real money — it
            can&apos;t be lost, spent or taken out.
          </p>
        </>
      )}
    </Panel>
  );
}

/** Well-known NSE names for the starter list, matched against the live board. */
const STARTER_TICKERS = [
  "SCOM.NSE",
  "EQTY.NSE",
  "KCB.NSE",
  "COOP.NSE",
  "EABL.NSE",
  "ABSA.NSE",
  "NCBA.NSE",
  "BRIT.NSE",
];

interface QuoteState {
  price: number | null;
  asOf: string | null;
  currencySymbol: string;
  exchange: string;
  name: string;
}

function BuyShares({
  cash,
  directory,
  firstBuy,
  sellCount,
  onBought,
}: {
  cash: Record<string, number>;
  directory: DirectoryEntry[];
  firstBuy: boolean;
  sellCount: number;
  onBought: () => void;
}) {
  const [board, setBoard] = useState<BoardRowLite[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DirectoryEntry | null>(null);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ owned: number; cost: number; sym: string } | null>(null);

  // A completed sell can make this panel's "you now own…" confirmation
  // wrong (the shares it names may all be sold), so drop it on each sell.
  useEffect(() => {
    setDone(null);
  }, [sellCount]);

  // NSE board for the starter list (names + the same EOD prices fills use).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stocks/board?exchange=NSE")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.rows) setBoard(j.rows as BoardRowLite[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const starters = useMemo(() => {
    if (!board) return [];
    const byTicker = new Map(board.map((r) => [r.ticker, r]));
    const picked = STARTER_TICKERS.map((t) => byTicker.get(t)).filter(
      (r): r is BoardRowLite => !!r,
    );
    if (picked.length >= 4) return picked.slice(0, 8);
    const rest = [...board]
      .filter((r) => !picked.some((p) => p.ticker === r.ticker))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return [...picked, ...rest].slice(0, 8);
  }, [board]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return directory
      .filter(
        (e) => e.name.toLowerCase().includes(q) || e.ticker.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [directory, query]);

  const pick = useCallback((entry: DirectoryEntry) => {
    setSelected(entry);
    setQuote(null);
    setQuoteFailed(false);
    setAmountStr("");
    setError(null);
    setDone(null);
    fetch(`/api/stocks/quote?ticker=${encodeURIComponent(entry.ticker)}&range=1mo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.ok) {
          setQuoteFailed(true);
          return;
        }
        setQuote({
          price: j.price ?? null,
          asOf: j.asOf ?? null,
          currencySymbol: j.currencySymbol ?? "KSh",
          exchange: j.exchange ?? entry.exchange,
          name: j.name ?? entry.name,
        });
      })
      .catch(() => setQuoteFailed(true));
  }, []);

  const ex = quote ? EXCHANGE_BY_ID[quote.exchange] : undefined;
  const eod = ex?.source === "africanfinancials";
  const stale = !!quote && eod && isStaleEod(quote.asOf);
  const sym = quote?.currencySymbol ?? "KSh";
  const price = quote?.price ?? null;
  const cashAvail = ex ? (cash[ex.currency] ?? START_CASH) : START_CASH;
  const amountNum = Number(amountStr.replace(/[^0-9.]/g, "")) || 0;
  const plan = price != null ? sharesForAmount(amountNum, price) : { shares: 0, cost: 0, leftover: 0 };
  const fee =
    ex?.currency === "KES" && plan.cost > 0 ? estimateRealCost(plan.cost).totalMid : null;
  const tooBig = plan.cost > cashAvail;
  const canConfirm =
    !!selected && price != null && !stale && plan.shares > 0 && !tooBig && !busy;

  const confirm = async () => {
    if (!selected || plan.shares <= 0) return;
    setBusy(true);
    setError(null);
    const res = await placeOrder(selected.ticker, "BUY", plan.shares);
    setBusy(false);
    if (!res.ok) {
      setError(FRIENDLY[res.error ?? ""] ?? "That buy didn't go through — try again.");
      return;
    }
    setDone({
      owned: res.position?.qty ?? plan.shares,
      cost: (res.fill_price ?? price ?? 0) * plan.shares,
      sym,
    });
    onBought();
  };

  const reset = () => {
    setSelected(null);
    setQuote(null);
    setAmountStr("");
    setDone(null);
    setError(null);
    setQuery("");
  };

  return (
    <section id="buy" aria-label="Buy shares" className="scroll-mt-4">
      <Panel variant="folio" padding="lg">
        <PanelHeader>
          <PanelTitle>{firstBuy && !selected ? "Buy your first shares" : "Buy shares"}</PanelTitle>
        </PanelHeader>

        {!selected && (
          <>
            <label className="block">
              <span className="text-sm text-muted-foreground">
                Which company? Start typing its name.
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try Safaricom"
                className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
            {query.trim() ? (
              <div className="mt-2 space-y-2">
                {results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No company matches that name. Check the spelling, or pick from the
                    list below.
                  </p>
                ) : (
                  results.map((e) => (
                    <button
                      key={e.ticker}
                      type="button"
                      onClick={() => pick(e)}
                      className="block w-full rounded-lg border border-border/70 px-4 py-3 text-left"
                    >
                      <span className="block text-[15px] font-semibold text-foreground">
                        {e.name}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {e.ticker} · {EXCHANGE_BY_ID[e.exchange]?.shortName ?? e.exchange}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-sm font-medium text-foreground">
                  Well-known Kenyan companies
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Prices are the last closing price for each company.
                </p>
                <div className="mt-2 space-y-2">
                  {starters.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      The company list is loading — or search above.
                    </p>
                  ) : (
                    starters.map((r) => (
                      <button
                        key={r.ticker}
                        type="button"
                        onClick={() => pick({ ticker: r.ticker, name: r.name, exchange: "NSE" })}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3 text-left"
                      >
                        <span>
                          <span className="block text-[15px] font-semibold text-foreground">
                            {r.name}
                          </span>
                          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                            {r.ticker}
                          </span>
                        </span>
                        <span className="num font-mono text-[15px] font-semibold text-foreground">
                          {fmt(r.price, "KSh")}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {selected && !done && (
          <>
            <button
              type="button"
              onClick={reset}
              className="text-sm font-medium text-primary hover:underline"
            >
              ← Choose a different company
            </button>
            <h3 className="mt-2 font-display text-[20px] font-semibold leading-snug text-foreground">
              {quote?.name ?? selected.name}
            </h3>
            {quoteFailed ? (
              <p className="mt-2 text-sm text-muted-foreground">
                We couldn&apos;t get a price for this company just now. Pick another
                company, or try again in a moment.
              </p>
            ) : !quote ? (
              <p className="mt-2 text-sm text-muted-foreground">Getting the latest price…</p>
            ) : price == null ? (
              <p className="mt-2 text-sm text-muted-foreground">
                There is no price for this company right now, so it can&apos;t be bought
                today. Pick another company.
              </p>
            ) : stale ? (
              <p className="mt-2 text-sm text-muted-foreground">{FRIENDLY.stale_eod}</p>
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
                      of {quote?.name ?? selected.name}, at {fmt(price, sym)} each ={" "}
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
          </>
        )}

        {selected && done && (
          <>
            <p role="status" className="text-base font-semibold text-success">
              Done — you now own {done.owned} {done.owned === 1 ? "share" : "shares"} of{" "}
              {selected.name}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This buy cost {fmt(done.cost, done.sym)} of practice money. Your shares are
              listed above, with what they&apos;re worth now.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg bg-success/15 px-4 py-3 text-sm font-bold text-success"
              >
                Buy more shares
              </button>
              <a
                href="#your-shares"
                className="rounded-lg border border-border/70 px-4 py-3 text-center text-sm font-semibold text-foreground"
              >
                See your shares
              </a>
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}
