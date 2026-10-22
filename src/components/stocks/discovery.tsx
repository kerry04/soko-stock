import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SkeletonRows, StateBlock } from "@/components/common/states";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ChangeCell } from "@/components/stocks/change";
import { PriceAsOf } from "@/components/stocks/PriceAsOf";
import { fmtPrice } from "@/lib/stocks/format";
import type { DiscoveryRow, SectorList } from "@/lib/stocks/discovery";

interface TalkedRow extends DiscoveryRow {
  count24h: number;
  surgeRatio: number | null;
  surging: boolean;
}

interface DiscoveryResponse {
  ok: boolean;
  asOf: string;
  movers: { date: string; gainers: DiscoveryRow[]; losers: DiscoveryRow[] };
  talked: { date: string; rows: TalkedRow[] };
  sectors: { date: string; groups: SectorList[] };
}

function stamp(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function DiscoveryItem({
  row,
  extra,
}: {
  row: DiscoveryRow;
  extra?: string;
}) {
  return (
    <Link
      to="/stocks/$ticker"
      params={{ ticker: row.ticker }}
      className="block rounded-md px-2 py-2 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-snug text-foreground">
            {row.name}
          </p>
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {row.ticker} · {row.exchange}
            {extra ? ` · ${extra}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num font-mono text-[12px] font-semibold text-foreground">
            {fmtPrice(row.price, row.currencySymbol)}
          </p>
          <ChangeCell value={row.changePercent} className="text-[10.5px]" />
        </div>
      </div>
      <PriceAsOf
        exchange={row.exchange}
        updated={row.updated}
        asOf={row.asOf}
        className="mt-0.5 normal-case tracking-normal"
      />
    </Link>
  );
}

function ListHead({ title, date }: { title: string; date: string }) {
  return (
    <PanelHeader>
      <PanelTitle>{title}</PanelTitle>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {stamp(date)}
      </span>
    </PanelHeader>
  );
}

/**
 * Discovery under Following: three lists built only from data the app
 * already holds. No popularity list — there is no honest crowd data.
 */
export function Discovery({ className }: { className?: string }) {
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stocks/discovery")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: DiscoveryResponse | null) => {
        if (cancelled) return;
        if (j?.ok) setData(j);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Discover" className={className ?? "mt-6"}>
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
        Discover
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Lists from the latest boards and the news wire. Facts, not recommendations.
      </p>

      {failed ? (
        <StateBlock
          tone="error"
          className="mt-3"
          title="Discovery lists unavailable"
          message="Check back shortly."
        />
      ) : !data ? (
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          <SkeletonRows rows={5} />
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Panel padding="md">
            <ListHead title="Biggest movers" date={data.movers.date} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <p className="px-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-success">
                  Gainers
                </p>
                {data.movers.gainers.length === 0 ? (
                  <p className="px-2 py-1 text-[12px] text-muted-foreground">No gainers at the last close.</p>
                ) : (
                  data.movers.gainers.map((r) => <DiscoveryItem key={r.ticker} row={r} />)
                )}
              </div>
              <div>
                <p className="px-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-destructive">
                  Losers
                </p>
                {data.movers.losers.length === 0 ? (
                  <p className="px-2 py-1 text-[12px] text-muted-foreground">No losers at the last close.</p>
                ) : (
                  data.movers.losers.map((r) => <DiscoveryItem key={r.ticker} row={r} />)
                )}
              </div>
            </div>
          </Panel>

          <Panel padding="md">
            <ListHead title="Most talked about" date={data.talked.date} />
            {data.talked.rows.length === 0 ? (
              <p className="px-2 py-1 text-[12px] leading-relaxed text-muted-foreground">
                No listed company coverage in the last 24 hours.
              </p>
            ) : (
              data.talked.rows.map((r) => (
                <DiscoveryItem
                  key={r.ticker}
                  row={r}
                  extra={`${r.count24h} ${r.count24h === 1 ? "story" : "stories"} · 24h${
                    r.surging && r.surgeRatio != null
                      ? ` · ${r.surgeRatio.toFixed(1)}× usual`
                      : ""
                  }`}
                />
              ))
            )}
          </Panel>

          <Panel padding="md">
            <ListHead title="Start with names you know" date={data.sectors.date} />
            {data.sectors.groups.length === 0 ? (
              <p className="px-2 py-1 text-[12px] leading-relaxed text-muted-foreground">
                No sector-labelled daily boards right now.
              </p>
            ) : (
              <div className="space-y-3">
                {data.sectors.groups.map((group) => (
                  <div key={group.id}>
                    <p className="px-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {group.label}
                    </p>
                    {group.rows.map((r) => (
                      <DiscoveryItem key={r.ticker} row={r} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </section>
  );
}
