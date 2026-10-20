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

function SectionTitle({ icon: Icon, children }: { icon: typeof Landmark; children: string }) {
  return (
    <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden /> {children}
    </h2>
  );
}

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-400">
      <BadgeAlert className="h-3 w-3" aria-hidden /> pending verification
    </span>
  );
}

function SourceLine({ snap, fallback }: { snap: IndicatorSnapshot | null; fallback: string }) {
  if (!snap) return <p className="text-xs text-muted-foreground">{fallback}: no data</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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

/** 24-month CPI sparkline with the target band shaded. */
function CpiSparkline({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="mt-3 text-sm text-muted-foreground">No history yet.</p>;
  }
  const W = 560;
  const H = 120;
  const PAD = 6;
  const vals = history.map((h) => h.value);
  const lo = Math.min(...vals, BAND_LO) - 0.25;
  const hi = Math.max(...vals, BAND_HI) + 0.25;
  const x = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2);
  const pts = history.map((h, i) => `${x(i).toFixed(1)},${y(h.value).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-28 w-full"
      role="img"
      aria-label="24-month inflation history"
      preserveAspectRatio="none"
    >
      <rect
        x={PAD}
        y={y(BAND_HI)}
        width={W - PAD * 2}
        height={Math.max(0, y(BAND_LO) - y(BAND_HI))}
        className="fill-success/15"
      />
      <polyline points={pts} fill="none" className="stroke-foreground" strokeWidth="2" />
      {history.map((h, i) =>
        i === history.length - 1 ? (
          <circle key={i} cx={x(i)} cy={y(h.value)} r="3.5" className="fill-foreground" />
        ) : null,
      )}
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
        <span className="font-mono text-sm tabular-nums">{value}</span>
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
      <main className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5 sm:py-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-success">
          Terminal · economy
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Economy</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {loading ? "Loading…" : data ? `As of ${fmtDate(data.asOf)}` : "No data"}
          </p>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-xl border border-border/70 bg-card/40"
              />
            ))}
          </div>
        ) : !hasAny ? (
          <section className="mt-6 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">
              No macro data ingested yet — inflation, rates and FX will appear here
              once the pipeline runs its first cycle.
            </p>
          </section>
        ) : (
          <>
            {(band === "hot" || band === "crisis") && cpi && (
              <div
                role="alert"
                className={cn(
                  "mt-6 flex items-start gap-3 rounded-xl border p-4",
                  band === "crisis"
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-amber-400/50 bg-amber-400/10",
                )}
              >
                <TriangleAlert
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    band === "crisis" ? "text-red-500" : "text-amber-400",
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
            <section
              aria-label="Inflation"
              className="mt-6 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
            >
              <SectionTitle icon={LineChart}>Inflation · CPI year-on-year</SectionTitle>
              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                <span className="font-mono text-5xl font-extrabold tabular-nums sm:text-6xl">
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
            </section>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {/* Policy rate */}
              <section
                aria-label="Policy rate"
                className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
              >
                <SectionTitle icon={Landmark}>Central Bank Rate</SectionTitle>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  {ind?.cbr ? `${ind.cbr.value.toFixed(2)}%` : "—"}
                </p>
                <div className="mt-2">
                  <SourceLine snap={ind?.cbr ?? null} fallback="Policy rate" />
                </div>
              </section>

              {/* T-bills */}
              <section
                aria-label="Treasury bill yields"
                className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
              >
                <SectionTitle icon={Percent}>T-bill yields</SectionTitle>
                <div className="mt-2">
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
              </section>

              {/* FX */}
              <section
                aria-label="Foreign exchange"
                className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5"
              >
                <SectionTitle icon={Banknote}>KES / USD</SectionTitle>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  {ind?.fx_usd ? `KSh ${fmtNum(ind.fx_usd.value)}` : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  CBK daily indicative mean rate
                </p>
                <div className="mt-2">
                  <SourceLine snap={ind?.fx_usd ?? null} fallback="FX" />
                </div>
              </section>
            </div>

            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Educational terminal — not investment advice.
            </p>
          </>
        )}
      </main>
    </TerminalShell>
  );
}
