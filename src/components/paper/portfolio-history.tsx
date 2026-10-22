import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { fmtChange, fmtPrice } from "@/lib/stocks/format";
import {
  VALUE_RANGES,
  changeSinceStart,
  formatValueDay,
  pointsInRange,
  scrubIndex,
  stepScrub,
  type ValuePoint,
  type ValueRangeId,
} from "@/lib/paper/history";
import { cn } from "@/lib/utils";

/**
 * The Globe account strip's value chart: one currency at a time, one
 * honest point per day close. Snapshots begin with the first cron run, so
 * a young account gets a plain sentence instead of an invented curve.
 */
export function PortfolioHistory({
  points,
  symbol,
  cash,
  worth,
}: {
  /** Every stored day plus today's current point, oldest first. */
  points: ValuePoint[];
  symbol: string;
  cash: number;
  worth: number;
}) {
  const [range, setRange] = useState<ValueRangeId>("1m");
  const [selected, setSelected] = useState<number | null>(null);

  const rangePoints = pointsInRange(points, range);
  const change = changeSinceStart(rangePoints);
  const lastIndex = rangePoints.length - 1;
  const activeIndex = selected == null ? lastIndex : Math.min(selected, lastIndex);
  const activePoint = rangePoints[activeIndex];
  const enoughForChart = rangePoints.length >= 2;
  // The headline is today's value (cash plus priced shares), even when a
  // missing price means the chart has no fresh point to draw.
  const total = cash + worth;

  return (
    <div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Total practice value
      </p>
      <p className="num mt-0.5 font-mono text-[26px] font-semibold leading-none text-foreground">
        {fmtPrice(total, symbol)}
      </p>
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        <span className="num font-mono text-foreground">{fmtPrice(cash, symbol)}</span> cash ·{" "}
        <span className="num font-mono text-foreground">{fmtPrice(worth, symbol)}</span> in shares
      </p>

      {!enoughForChart ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          The chart adds one point after each day close.
        </p>
      ) : (
        <>
          {change && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              <span
                className={cn(
                  "num font-mono font-semibold",
                  change.amount > 0
                    ? "text-success"
                    : change.amount < 0
                      ? "text-destructive"
                      : "text-foreground",
                )}
              >
                {change.amount > 0 ? "+" : change.amount < 0 ? "−" : ""}
                {fmtPrice(Math.abs(change.amount), symbol)}
              </span>
              {change.percent != null && (
                <>
                  {" "}
                  (
                  <span
                    className={cn(
                      "num font-mono",
                      change.percent > 0
                        ? "text-success"
                        : change.percent < 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {fmtChange(change.percent)}
                  </span>
                  )
                </>
              )}{" "}
              since {formatValueDay(change.from.date)}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Value range">
            {VALUE_RANGES.map((r) => (
              <Chip
                key={r.id}
                role="tab"
                aria-selected={range === r.id}
                active={range === r.id}
                size="sm"
                onClick={() => {
                  setRange(r.id);
                  setSelected(null);
                }}
              >
                {r.label}
              </Chip>
            ))}
          </div>

          <div className="mt-2 rounded-lg border border-border/60 bg-background/40 px-2 pb-2 pt-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {activePoint ? formatValueDay(activePoint.date) : ""}
              </span>
              <span className="num font-mono text-[12px] font-semibold text-foreground">
                {activePoint ? fmtPrice(activePoint.total, symbol) : ""}
              </span>
            </div>
            <ValueChart
              points={rangePoints}
              activeIndex={activeIndex}
              symbol={symbol}
              onScrub={(index) => setSelected(index)}
              onLeave={() => setSelected(null)}
            />
          </div>
          <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            One point per day close · drag or use ← → to read a day
          </p>
        </>
      )}
    </div>
  );
}

function ValueChart({
  points,
  activeIndex,
  symbol,
  onScrub,
  onLeave,
}: {
  points: ValuePoint[];
  activeIndex: number;
  symbol: string;
  onScrub: (index: number) => void;
  onLeave: () => void;
}) {
  const W = 640;
  const H = 132;
  const padX = 6;
  const padY = 10;
  const totals = points.map((p) => p.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const span = Math.max(0.0001, max - min);
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const active = points[Math.min(activeIndex, points.length - 1)];
  const ax = x(Math.min(activeIndex, points.length - 1));
  const ay = y(active.total);

  const handle = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    onScrub(scrubIndex((e.clientX - rect.left) / rect.width, points.length));
  };

  return (
    <div
      tabIndex={0}
      role="img"
      aria-label={`Practice value from ${formatValueDay(points[0].date)} to ${formatValueDay(
        points[points.length - 1].date,
      )}. ${formatValueDay(active.date)}: ${fmtPrice(active.total, symbol)}. Use the left and right arrow keys to read each point.`}
      className="mt-1 cursor-crosshair rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      style={{ touchAction: "pan-y" }}
      onPointerDown={handle}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || e.buttons > 0) handle(e);
      }}
      onPointerLeave={onLeave}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onScrub(stepScrub(activeIndex, -1, points.length));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onScrub(stepScrub(activeIndex, 1, points.length));
        } else if (e.key === "Home") {
          e.preventDefault();
          onScrub(0);
        } else if (e.key === "End") {
          e.preventDefault();
          onScrub(points.length - 1);
        }
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" aria-hidden>
        <defs>
          <linearGradient id="sg-folio-value" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--primary)" }} stopOpacity="0.2" />
            <stop offset="100%" style={{ stopColor: "var(--primary)" }} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sg-folio-value)" />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line
          x1={ax}
          x2={ax}
          y1={padY}
          y2={H}
          className="stroke-border"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle cx={ax} cy={ay} r="3.6" className="fill-primary" />
      </svg>
      <div className="flex items-center justify-between px-1 font-mono text-[9.5px] text-muted-foreground">
        <span>{formatValueDay(points[0].date)}</span>
        <span>{formatValueDay(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
