import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BadgeAlert,
  Banknote,
  Landmark,
  LineChart,
  Percent,
  TriangleAlert,
} from "lucide-react";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SkeletonBlock, StateBlock } from "@/components/common/states";
import { BandChip, type BandState } from "@/components/macro/BandChip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/economy")({
  head: () => ({
    meta: [
      { title: "Economy — Soko Stock" },
      {
        name: "description",
        content:
          "Kenya macro snapshot: inflation vs the CBK target band, the Central Bank Rate, T-bill yields and KES/USD.",
      },
    ],
  }),
  component: EconomyPage,
});

interface IndicatorSnapshot {
  value: number;
  unit: string | null;
  released_at: string;
  source: string;
  source_url: string | null;
  verified: boolean;
}

interface HistoryPoint {
  released_at: string;
  value: number;
}

interface Overview {
  ok: boolean;
  band: BandState | null;
  indicators: {
    cpi_yoy: IndicatorSnapshot | null;
    cbr: IndicatorSnapshot | null;
    fx_usd: IndicatorSnapshot | null;
    tbill_91: IndicatorSnapshot | null;
    tbill_182: IndicatorSnapshot | null;
    tbill_364: IndicatorSnapshot | null;
  };
  cpiHistory: HistoryPoint[];
  asOf: string;
}

const BAND_LO = 2.5;
const BAND_HI = 7.5;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtNum(v: number | null, digits = 2): string {
  return v == null ? "—" : v.toFixed(digits);
}

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
      <BadgeAlert className="h-3 w-3" aria-hidden /> not yet checked
    </span>
  );
}

function SourceLine({ snap, fallback }: { snap: IndicatorSnapshot | null; fallback: string }) {
  if (!snap) return <p className="font-mono text-[11px] text-muted-foreground">{fallback}: no data</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
      <span>
        {fallback} · {snap.source} · released {fmtDate(snap.released_at)}
      </span>
      {!snap.verified && <PendingBadge />}
    </p>
  );
}

/** Target-band bar: 0–10% scale, shaded 2.5–7.5% region, marker at the value. */
function BandBar({ value }: { value: number | null }) {
  const pct = (v: number) => Math.min(100, Math.max(0, (v / 10) * 100));
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-muted/40">
        <div
          className="absolute inset-y-0 rounded-full bg-success/25"
          style={{ left: `${pct(BAND_LO)}%`, width: `${pct(BAND_HI) - pct(BAND_LO)}%` }}
        />
        {value != null && (
          <div
            className="absolute inset-y-[-3px] w-[3px] rounded bg-foreground"
            style={{ left: `calc(${pct(value)}% - 1px)` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>0%</span>
        <span>
          CBK target {BAND_LO}–{BAND_HI}%
        </span>
        <span>10%</span>
      </div>
    </div>
  );
}

/**
 * 24-month CPI history with the stock chart's furniture: hairline
 * gridlines with mono value labels in the left gutter, a time axis in
 * the bottom strip, the CBK band shaded, and a last-value tag in the
 * right gutter tied to the final point.
 */
function CpiSparkline({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="mt-3 text-sm text-muted-foreground">No history yet.</p>;
  }
  const W = 720;
  const H = 180;
  const padL = 42;
  const padR = 58;
  const padT = 10;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const vals = history.map((h) => h.value);
  const lo = Math.min(...vals, BAND_LO) - 0.25;
  const hi = Math.max(...vals, BAND_HI) + 0.25;
  const x = (i: number) => padL + (i / (history.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const pts = history.map((h, i) => `${x(i).toFixed(1)},${y(h.value).toFixed(1)}`).join(" ");

  const gridFracs = [0, 1 / 3, 2 / 3, 1];
  const dateFmt = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const timeIdx = [0, Math.floor((history.length - 1) / 2), history.length - 1];

  const last = history[history.length - 1];
  const lastLabel = `${last.value.toFixed(2)}%`;
  const tagW = Math.ceil(lastLabel.length * 5.9) + 12;
  const tagX = W - tagW;
  const tagY = Math.min(padT + plotH - 18, Math.max(padT, y(last.value) - 9));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-36 w-full"
      role="img"
      aria-label="24-month inflation history"
    >
      {/* CBK target band */}
      <rect
        x={padL}
        y={y(BAND_HI)}
        width={plotW}
        height={Math.max(0, y(BAND_LO) - y(BAND_HI))}
        className="fill-success/15"
      />

      {/* Gridlines + value axis */}
      {gridFracs.map((f) => {
        const v = lo + (hi - lo) * f;
        const gy = y(v);
        return (
          <g key={f}>
            <line
              x1={padL}
              x2={padL + plotW}
              y1={gy}
              y2={gy}
              className="stroke-border"
              strokeWidth="1"
              opacity="0.55"
            />
            <text
              x={padL - 6}
              y={gy + 3}
              textAnchor="end"
              fontSize="9.5"
              className="fill-muted-foreground font-mono"
            >
              {v.toFixed(1)}%
            </text>
          </g>
        );
      })}

      {/* Time axis */}
      {timeIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 4}
          textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"}
          fontSize="9.5"
          className="fill-muted-foreground font-mono"
        >
          {dateFmt(new Date(history[i].released_at))}
        </text>
      ))}

      <polyline
        points={pts}
        fill="none"
        className="stroke-primary"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Last point + value tag */}
      <line
        x1={x(history.length - 1)}
        x2={tagX}
        y1={y(last.value)}
        y2={y(last.value)}
        className="stroke-primary"
        strokeWidth="1"
        opacity="0.6"
      />
      <circle cx={x(history.length - 1)} cy={y(last.value)} r="3.5" className="fill-primary" />
      <rect x={tagX} y={tagY} width={tagW} height="18" rx="2" className="fill-primary" />
      <text
        x={tagX + tagW / 2}
        y={tagY + 12.5}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        className="fill-primary-foreground font-mono"
      >
        {lastLabel}
      </text>
    </svg>
  );
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right">
        <span className="num font-mono text-sm tabular-nums">{value}</span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

/**
 * Economy: Kenya macro snapshot. Inflation vs the CBK target band first,
 * then the policy rate, T-bill yields and KES/USD. Every value comes from
 * the macro pipeline — absent data renders as "—", never a guess.
 */
function EconomyPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/macro/overview");
        const json = res.ok ? await res.json() : null;
        if (!cancelled && json?.ok) setData(json as Overview);
      } catch {
        /* enrichment-style failure: page still renders with empty states */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ind = data?.indicators;
  const cpi = ind?.cpi_yoy ?? null;
  const band = data?.band ?? null;
  const hasAny = !!cpi || !!ind?.cbr || !!ind?.fx_usd || !!ind?.tbill_91;

  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="ECO · Kenya macro"
          title="Economy"
          description="Kenya macro snapshot: inflation vs the CBK target band, the Central Bank Rate, T-bill yields and KES/USD."
          actions={
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {loading ? "Loading…" : data ? `As of ${fmtDate(data.asOf)}` : "No data"}
            </p>
          }
        />

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="h-56" />
            ))}
          </div>
        ) : !hasAny ? (
          <StateBlock
            tone="empty"
            message="No economy figures yet. Inflation, interest rates and the shilling's exchange rate will appear here as soon as the first figures are published."
          />
        ) : (
          <>
            {(band === "hot" || band === "crisis") && cpi && (
              <div
                role="alert"
                className={cn(
                  "mb-4 flex items-start gap-3 rounded-lg border p-4",
                  band === "crisis"
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-primary/50 bg-primary/10",
                )}
              >
                <TriangleAlert
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    band === "crisis" ? "text-destructive" : "text-primary",
                  )}
                  aria-hidden
                />
                <p className="text-sm">
                  {band === "hot"
                    ? `Inflation at ${cpi.value.toFixed(2)}% — approaching the top of the CBK ${BAND_LO}–${BAND_HI}% target band.`
                    : `Inflation at ${cpi.value.toFixed(2)}% — above the CBK ${BAND_LO}–${BAND_HI}% target band. Real returns on shilling deposits are likely negative.`}
                </p>
              </div>
            )}

            {/* Inflation hero */}
            <Panel variant="folio" padding="md" role="region" aria-label="Inflation">
              <PanelHeader>
                <PanelTitle className="flex items-center gap-2">
                  <LineChart className="h-3.5 w-3.5" aria-hidden /> Inflation · CPI year-on-year
                </PanelTitle>
              </PanelHeader>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <span className="font-display text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
                  {cpi ? `${cpi.value.toFixed(2)}%` : "—"}
                </span>
                <span className="pb-1.5">
                  <BandChip band={band} />
                </span>
                {cpi && !cpi.verified && (
                  <span className="pb-1.5">
                    <PendingBadge />
                  </span>
                )}
              </div>
              <BandBar value={cpi?.value ?? null} />
              <CpiSparkline history={data?.cpiHistory ?? []} />
              <div className="mt-3">
                <SourceLine snap={cpi} fallback="CPI YoY" />
              </div>
            </Panel>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {/* Policy rate */}
              <Panel variant="stat" padding="md" role="region" aria-label="Policy rate">
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2">
                    <Landmark className="h-3.5 w-3.5" aria-hidden /> Central Bank Rate
                  </PanelTitle>
                </PanelHeader>
                <p className="num font-mono text-3xl font-bold tabular-nums">
                  {ind?.cbr ? `${ind.cbr.value.toFixed(2)}%` : "—"}
                </p>
                <div className="mt-2">
                  <SourceLine snap={ind?.cbr ?? null} fallback="Policy rate" />
                </div>
              </Panel>

              {/* T-bills */}
              <Panel variant="stat" padding="md" role="region" aria-label="Treasury bill yields">
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2">
                    <Percent className="h-3.5 w-3.5" aria-hidden /> T-bill yields
                  </PanelTitle>
                </PanelHeader>
                <div>
                  <StatRow
                    label="91-day"
                    value={ind?.tbill_91 ? `${fmtNum(ind.tbill_91.value)}%` : "—"}
                  />
                  <StatRow
                    label="182-day"
                    value={ind?.tbill_182 ? `${fmtNum(ind.tbill_182.value)}%` : "—"}
                  />
                  <StatRow
                    label="364-day"
                    value={ind?.tbill_364 ? `${fmtNum(ind.tbill_364.value)}%` : "—"}
                  />
                </div>
                <div className="mt-2">
                  <SourceLine snap={ind?.tbill_91 ?? null} fallback="T-bill auction" />
                </div>
              </Panel>

              {/* FX */}
              <Panel variant="stat" padding="md" role="region" aria-label="Foreign exchange">
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2">
                    <Banknote className="h-3.5 w-3.5" aria-hidden /> KES / USD
                  </PanelTitle>
                </PanelHeader>
                <p className="num font-mono text-3xl font-bold tabular-nums">
                  {ind?.fx_usd ? `KSh ${fmtNum(ind.fx_usd.value)}` : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  CBK daily indicative mean rate
                </p>
                <div className="mt-2">
                  <SourceLine snap={ind?.fx_usd ?? null} fallback="FX" />
                </div>
              </Panel>
            </div>
          </>
        )}
      </PageContainer>
    </TerminalShell>
  );
}
