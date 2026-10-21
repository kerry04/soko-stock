import { useEffect, useMemo, useState } from "react";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/card";
import { LIVE_EXCHANGES, type Exchange } from "@/lib/stocks/exchanges";
import { cn } from "@/lib/utils";

/**
 * The Session Ring — a 24-hour dial of every live exchange, drawn from
 * metadata and the clock alone.
 *
 * Each marker sits at its exchange city's LOCAL time (Intl + the IANA
 * zone pinned in exchanges.ts) and carries the exchange code; the dot
 * is the data state that already exists in the metadata — LIVE for the
 * Yahoo-sourced board (JSE), EOD for the African Financials boards.
 * The ledger under the dial prints every exchange's local time and
 * state in full. The dial makes NO trading-hours claim: no open/closed
 * state, no session arcs — local time and data provenance only.
 *
 * Geometry note: Africa's twelve exchanges span UTC+0…+4, so at any
 * moment they occupy only five hour-angles on the dial, up to six on
 * one ray. Full code+time labels cannot physically fit on those rays
 * (a rotated label needs ~50px of rim arc; neighbouring rays are 15°
 * apart), so markers carry the code radially and the complete readout
 * lives in the ledger directly beneath — same panel, same facts.
 */

const SIZE = 400;
const C = SIZE / 2;
const RIM = 104;

interface RingEntry {
  ex: Exchange;
  /** "HH:MM" local time at the exchange city. */
  time: string;
  /** Decimal local hours, 0–24 — the marker's angle on the dial. */
  decimal: number;
  /** UTC offset in minutes, for ledger ordering. */
  offsetMin: number;
  state: "LIVE" | "EOD";
  /** Index within the group sharing this exact local time. */
  k: number;
}

function localParts(tz: string, now: Date): { hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hh: get("hour") % 24, mm: get("minute") };
}

function offsetMinutes(tz: string, now: Date): number {
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  return Math.round((local.getTime() - now.getTime()) / 60000);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function SessionRing() {
  const [now, setNow] = useState(() => new Date());

  // The dial is a clock, not an animation: refresh the readout once a
  // minute, in step with the terminal's other slow cadences.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { entries, eatTime, eatDecimal } = useMemo(() => {
    const raw = LIVE_EXCHANGES.map((ex) => {
      const { hh, mm } = localParts(ex.tz, now);
      return {
        ex,
        time: `${pad(hh)}:${pad(mm)}`,
        decimal: hh + mm / 60,
        offsetMin: offsetMinutes(ex.tz, now),
        state: (ex.source === "yahoo" ? "LIVE" : "EOD") as "LIVE" | "EOD",
        k: 0,
      };
    });
    // Exchanges sharing a local time share a ray: stagger their dots
    // inward and their labels outward so all of them stay legible.
    const groups = new Map<string, number>();
    for (const e of [...raw].sort((a, b) => a.ex.shortName.localeCompare(b.ex.shortName))) {
      const k = groups.get(e.time) ?? 0;
      e.k = k;
      groups.set(e.time, k + 1);
    }
    const eat = localParts("Africa/Nairobi", now);
    return {
      entries: [...raw].sort(
        (a, b) => a.offsetMin - b.offsetMin || a.ex.shortName.localeCompare(b.ex.shortName),
      ),
      eatTime: `${pad(eat.hh)}:${pad(eat.mm)}`,
      eatDecimal: eat.hh + eat.mm / 60,
    };
  }, [now]);

  const point = (decimal: number, r: number): [number, number] => {
    const t = (decimal / 24) * Math.PI * 2;
    return [C + r * Math.sin(t), C - r * Math.cos(t)];
  };

  return (
    <Panel variant="folio" padding="md" aria-label="Session ring: local time and data state for every live exchange">
      <PanelHeader>
        <PanelTitle>Session ring</PanelTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          24H · Local time + data state
        </span>
      </PanelHeader>
      <PanelContent>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto block w-full max-w-[340px]"
          role="img"
          aria-label={`24-hour dial of ${entries.length} exchanges by local time. Nairobi is ${eatTime} EAT. Full local times are listed below the dial.`}
        >
          {/* Dial face */}
          <circle cx={C} cy={C} r={RIM} className="fill-card stroke-border" strokeWidth={1} />
          <circle
            cx={C}
            cy={C}
            r={56}
            fill="none"
            className="stroke-border"
            strokeWidth={0.5}
            strokeOpacity={0.5}
          />
          {/* Hour ticks — longer at 00 / 06 / 12 / 18 */}
          {Array.from({ length: 24 }, (_, h) => {
            const [x1, y1] = point(h, RIM - (h % 6 === 0 ? 9 : 5));
            const [x2, y2] = point(h, RIM);
            return (
              <line
                key={h}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="stroke-muted-foreground"
                strokeWidth={h % 6 === 0 ? 1.2 : 0.7}
                strokeOpacity={h % 6 === 0 ? 0.8 : 0.45}
              />
            );
          })}
          {/* The Nairobi ray — where the reader is sitting. */}
          {(() => {
            const [x, y] = point(eatDecimal, RIM - 3);
            return (
              <line
                x1={C}
                y1={C}
                x2={x}
                y2={y}
                className="stroke-primary"
                strokeWidth={1}
                strokeOpacity={0.45}
              />
            );
          })()}

          {/* Exchange markers: dot (state) on the ray, code read radially. */}
          {entries.map((e) => {
            const clockDeg = e.decimal * 15;
            const [dx, dy] = point(e.decimal, RIM - 6 - e.k * 7);
            const labelR = RIM + 12 + e.k * 12.5;
            // Labels read outward; on the dial's left half (past 09:00,
            // up to and including 18:00) flip them so they never render
            // upside down — the anchor moves to the outer end of the span.
            const flip = clockDeg > 90 && clockDeg <= 270;
            const [lx, ly] = point(e.decimal, flip ? labelR + 30 : labelR);
            const rotation = flip ? clockDeg + 90 : clockDeg - 90;
            return (
              <g key={e.ex.id}>
                <circle
                  cx={dx}
                  cy={dy}
                  r={3.2}
                  className={e.state === "LIVE" ? "fill-primary" : "fill-muted-foreground"}
                >
                  <title>{`${e.ex.shortName} · ${e.time} local · ${e.state}`}</title>
                </circle>
                <text
                  x={lx}
                  y={ly}
                  transform={`rotate(${rotation} ${lx} ${ly})`}
                  textAnchor="start"
                  dominantBaseline="central"
                  className="fill-foreground font-mono"
                  fontSize={9.5}
                  fontWeight={700}
                  letterSpacing={0.5}
                >
                  {e.ex.shortName}
                </text>
              </g>
            );
          })}

          {/* Centre: the reader's clock. */}
          <circle cx={C} cy={C} r={2.5} className="fill-primary" />
          <text
            x={C}
            y={C - 12}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground font-display"
            fontSize={30}
            fontWeight={600}
          >
            {eatTime}
          </text>
          <text
            x={C}
            y={C + 16}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground font-mono"
            fontSize={8.5}
            letterSpacing={2}
          >
            {`EAT · ${entries.length} EXCHANGES`}
          </text>
        </svg>

        {/* State legend — the dot is the claim, printed honestly. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Live · Yahoo feed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
            EOD · End-of-day boards
          </span>
        </div>

        {/* The full readout: every exchange, its local time, its state. */}
        <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
          {entries.map((e) => (
            <li
              key={e.ex.id}
              className="flex items-baseline gap-2 border-b border-border/50 py-1.5 font-mono text-[11px]"
            >
              <span className="w-10 shrink-0 font-bold text-foreground">{e.ex.shortName}</span>
              <span className="flex-1 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {e.ex.country}
              </span>
              <span className="num text-foreground">{e.time}</span>
              <span
                className={cn(
                  "w-8 shrink-0 text-right font-bold",
                  e.state === "LIVE" ? "text-primary" : "text-muted-foreground",
                )}
              >
                {e.state}
              </span>
            </li>
          ))}
        </ul>
      </PanelContent>
    </Panel>
  );
}
