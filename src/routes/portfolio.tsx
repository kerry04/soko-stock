import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/table";
import { StateBlock } from "@/components/common/states";
import { ChangeCell } from "@/components/stocks/change";
import { PaperLoginForm } from "@/components/paper/auth";
import { usePaperSession } from "@/components/paper/use-paper-session";
import { fmtMoney as money, timeAgo } from "@/lib/stocks/format";
import { estimateRealCost } from "@/lib/stocks/real-cost";
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

const positionColumns: DataTableColumn<PositionRow>[] = [
  {
    key: "ticker",
    header: "Ticker",
    render: (p) => (
      <Link
        to="/stocks/$ticker"
        params={{ ticker: p.ticker }}
        className="font-mono text-[13px] font-bold text-foreground underline-offset-2 hover:underline"
      >
        {p.ticker}
      </Link>
    ),
  },
  {
    key: "qty",
    header: "Qty",
    numeric: true,
    render: (p) => p.qty,
  },
  {
    key: "avg",
    header: "Avg cost",
    numeric: true,
    render: (p) => money(p.avg),
  },
  {
    key: "board",
    header: "Latest price",
    numeric: true,
    render: (p) => (
      <div className="flex flex-col items-end gap-1">
        <span>{money(p.board)}</span>
        {p.delayed && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-primary">
            Yesterday&apos;s close
          </span>
        )}
        {p.asOf && (
          <span className="font-mono text-[10px] text-muted-foreground">
            as of {timeAgo(p.asOf)}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "pnl",
    header: "Profit / loss",
    numeric: true,
    render: (p) => {
      const pnl = p.board != null ? (p.board - p.avg) * p.qty : null;
      const pnlPct =
        p.board != null && p.avg !== 0 ? ((p.board - p.avg) / p.avg) * 100 : null;
      if (pnl == null) return "—";
      const up = pnl >= 0;
      return (
        <span className="inline-flex items-center justify-end gap-1.5">
          <span className={cn("font-semibold", up ? "text-success" : "text-destructive")}>
            {pnl > 0 ? "+" : ""}
            {money(pnl)}
          </span>
          {pnlPct != null && <ChangeCell value={pnlPct} />}
        </span>
      );
    },
  },
];

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

  // Paper → real translation: once a first position exists, show what the
  // NSE holdings would have cost in real fees (mid-range brokerage, from
  // lib/stocks/real-cost) and what real trading needs. Display only — no
  // paper balances, orders or storage are touched.
  const hasPositions = (data?.positions.length ?? 0) > 0;
  const nseValue = (data?.positions ?? [])
    .filter((p) => p.ticker.endsWith(".NSE"))
    .reduce((sum, p) => sum + (p.board ?? p.avg) * p.qty, 0);
  const realFees = nseValue > 0 ? estimateRealCost(nseValue) : null;
  const ksh = (v: number) => `KSh ${Math.round(v).toLocaleString("en-ZA")}`;

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="PORT · Paper portfolio"
          title="Paper portfolio"
          description="Practise buying and selling with virtual cash. No real money and nothing at risk — this is where you learn to trade before you open a real account."
        />

        {authLoading && (
          <StateBlock tone="loading" message="Loading your portfolio…" />
        )}
        {!authLoading && !user && (
          <div className="max-w-md">
            <PaperLoginForm />
          </div>
        )}
        {!authLoading && user && failed && (
          <StateBlock
            tone="error"
            message="Portfolio unavailable right now — check back shortly."
          />
        )}
        {!authLoading && user && !failed && !data && (
          <StateBlock tone="loading" message="Loading your portfolio…" />
        )}
        {!authLoading && user && !failed && data && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(data.cash).map(([ccy, cash]) => (
                <Panel key={ccy} variant="stat" padding="sm">
                  <PanelTitle>{ccy} cash</PanelTitle>
                  <p className="num mt-1 font-mono text-base font-semibold">{money(cash)}</p>
                </Panel>
              ))}
              {Object.keys(data.cash).length === 0 && (
                <Panel variant="plain" padding="md" className="col-span-2 sm:col-span-4">
                  <p className="text-sm text-muted-foreground">
                    No virtual cash yet — place your first paper trade from any{" "}
                    <Link to="/" className="text-primary hover:underline">
                      stock board
                    </Link>
                    .
                  </p>
                </Panel>
              )}
            </div>

            <Panel variant="folio" padding="none" className="mt-6 overflow-hidden">
              <PanelHeader className="px-4 pt-4">
                <PanelTitle>Positions</PanelTitle>
              </PanelHeader>
              {data.positions.length === 0 ? (
                <StateBlock
                  tone="empty"
                  message="No shares right now — the shares you buy will show here."
                  action={
                    <Link
                      to="/trade"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Buy practice shares on the Trade page
                    </Link>
                  }
                  className="border-0"
                />
              ) : (
                <DataTable
                  columns={positionColumns}
                  rows={data.positions}
                  rowKey={(p) => p.ticker}
                />
              )}
            </Panel>

            {hasPositions && (
              <Panel variant="plain" padding="md" className="mt-6">
                <PanelTitle>From paper to real</PanelTitle>
                {realFees && (
                  <p className="mt-2 text-sm leading-relaxed">
                    In real trading this would have cost about{" "}
                    <span className="num font-mono font-semibold">
                      {ksh(realFees.totalMid)}
                    </span>{" "}
                    in fees.
                  </p>
                )}
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  To trade for real you need a CDS account — ID, KRA PIN,
                  photos.{" "}
                  <Link
                    to="/start"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    See the five steps →
                  </Link>
                </p>
                {realFees && (
                  <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
                    On your NSE paper positions at board prices · levies
                    0.34% · brokerage at the 1.8% mid-range · stamp duty
                    included
                  </p>
                )}
              </Panel>
            )}

            <Panel variant="folio" padding="none" className="mt-6 overflow-hidden">
              <PanelHeader className="px-4 pt-4">
                <PanelTitle>Recent orders</PanelTitle>
              </PanelHeader>
              {data.orders.length === 0 ? (
                <StateBlock tone="empty" message="No orders yet." className="border-0" />
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.orders.map((o, i) => (
                    <li
                      key={`${o.created_at}-${i}`}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 font-mono text-[12px] text-muted-foreground"
                    >
                      <span>
                        <span className={o.side === "BUY" ? "text-success" : "text-destructive"}>
                          {o.side}
                        </span>{" "}
                        {o.qty}{" "}
                        <span className="font-semibold text-foreground">{o.ticker}</span> @{" "}
                        {money(Number(o.fill_price))}
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
            </Panel>
          </>
        )}
      </PageContainer>
    </TerminalShell>
  );
}
