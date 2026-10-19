import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PaperLoginForm } from "@/components/paper/auth";
import { usePaperSession } from "@/components/paper/use-paper-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Soko Stock" }] }),
  component: Portfolio,
});

interface PositionRow {
  ticker: string;
  qty: number;
  avg: number;
  board: number | null;
  asOf: string | null;
  delayed: boolean;
}

interface OrderRow {
  ticker: string;
  exchange: string;
  side: string;
  qty: number;
  fill_price: number;
  as_of: string;
  created_at: string;
}

interface PortfolioResponse {
  ok: boolean;
  cash: Record<string, number>;
  positions: PositionRow[];
  orders: OrderRow[];
}

function money(v: number | null, sym = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${sym}${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Portfolio() {
  const { user, loading: authLoading } = usePaperSession();
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
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
          if (j.ok) setData(j);
          else setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  return (
    <TerminalShell>
      <div className="mx-auto max-w-[1100px] px-3 py-4 sm:px-5">
        <h1 className="font-mono text-sm font-bold uppercase tracking-[0.18em]">Paper portfolio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Virtual cash only — educational terminal, not investment advice.
        </p>

        {authLoading && <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted/40" />}
        {!authLoading && !user && (
          <div className="mt-4 max-w-md">
            <PaperLoginForm />
          </div>
        )}
        {!authLoading && user && failed && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Portfolio unavailable right now — check back shortly.
          </p>
        )}
        {!authLoading && user && !failed && data && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(data.cash).map(([ccy, cash]) => (
                <div key={ccy} className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {ccy} cash
                  </p>
                  <p className="num mt-1 font-mono text-sm font-semibold">{money(cash)}</p>
                </div>
              ))}
              {Object.keys(data.cash).length === 0 && (
                <div className="col-span-2 rounded-xl border border-border/60 bg-card/40 p-3 sm:col-span-4">
                  <p className="text-sm text-muted-foreground">
                    No virtual cash yet — place your first paper trade from any{" "}
                    <Link to="/" className="text-success hover:underline">
                      stock board
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>

            <h2 className="mt-6 font-mono text-sm font-bold uppercase tracking-[0.18em]">
              Positions
            </h2>
            {data.positions.length === 0 ? (
              <p className="mt-3 rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                No positions yet — place a paper trade from any stock page.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.positions.map((p) => {
                  const pnl = p.board != null ? (p.board - p.avg) * p.qty : null;
                  const pnlPct =
                    p.board != null && p.avg !== 0 ? ((p.board - p.avg) / p.avg) * 100 : null;
                  const up = (pnl ?? 0) >= 0;
                  return (
                    <li
                      key={p.ticker}
                      className="rounded-xl border border-border/60 bg-card/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to="/stocks/$ticker"
                          params={{ ticker: p.ticker }}
                          className="font-mono text-sm font-bold hover:underline"
                        >
                          {p.ticker}
                        </Link>
                        {p.delayed && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-amber-500">
                            EOD delayed
                          </span>
                        )}
                      </div>
                      <div className="num mt-2 grid grid-cols-3 gap-2 font-mono text-[12px] text-muted-foreground">
                        <span>
                          {p.qty} @ {money(p.avg)}
                        </span>
                        <span>Board {money(p.board)}</span>
                        <span
                          className={cn(
                            "text-right font-semibold",
                            up ? "text-success" : "text-red-500",
                          )}
                        >
                          {pnl == null ? "—" : `${up && pnl > 0 ? "+" : ""}${money(pnl)}`}
                          {pnlPct != null && ` (${up ? "+" : ""}${pnlPct.toFixed(2)}%)`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <h2 className="mt-6 font-mono text-sm font-bold uppercase tracking-[0.18em]">
              Recent orders
            </h2>
            {data.orders.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {data.orders.map((o, i) => (
                  <li
                    key={`${o.created_at}-${i}`}
                    className="flex items-center justify-between gap-2 font-mono text-[12px] text-muted-foreground"
                  >
                    <span>
                      <span className={o.side === "BUY" ? "text-success" : "text-red-500"}>
                        {o.side}
                      </span>{" "}
                      {o.qty} {o.ticker} @ {money(Number(o.fill_price))}
                    </span>
                    <span>
                      {new Date(o.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </TerminalShell>
  );
}
