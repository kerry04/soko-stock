import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Radio, X } from "lucide-react";
import type { Article, CountrySignal, StockLink } from "./SignalMap";
import { SentimentDot } from "@/components/stocks/badges";
import { ChangeCell } from "@/components/stocks/change";
import { fmtPrice, timeAgo } from "@/lib/stocks/format";

/**
 * "Soko Live" broadcast pop-up for a selected country: a TV-news frame
 * over the live signal data — LIVE/BREAKING bug, EAT clock, a rotating
 * top story, the rest of the wire, the country's biggest exchange movers
 * as the market update, and a crawling headline ticker along the bottom.
 * Presentation only; every number comes from the same CountrySignal the
 * flat panel used. Nothing here is a real video feed.
 */

export function CountryBroadcast({
  signal,
  stocks,
  onClose,
}: {
  signal: CountrySignal;
  stocks: StockLink[];
  onClose: () => void;
}) {
  const { country, articles, instability, converging } = signal;
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Reset the rundown when a different country is opened.
  useEffect(() => setStoryIdx(0), [country.id]);

  // Rotate the top story like a broadcast rundown.
  useEffect(() => {
    if (paused || articles.length < 2) return;
    const id = setInterval(() => setStoryIdx((i) => (i + 1) % articles.length), 6000);
    return () => clearInterval(id);
  }, [paused, articles.length]);

  // Live clock.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Esc closes; lock body scroll while on air.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const top = articles[storyIdx % Math.max(1, articles.length)];
  const rest = articles.filter((_, i) => i !== (storyIdx % Math.max(1, articles.length)));
  const clock = now.toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi" });

  const tickerItems = [
    ...articles.map((a) => a.title),
    ...stocks.map(
      (s) =>
        `${s.ticker.split(".")[0]} ${s.changePercent != null ? `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%` : ""}`,
    ),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Live broadcast: ${country.name}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-lg border border-border bg-popover text-popover-foreground shadow-2xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Broadcast header: bug + brand + clock ─────────────────── */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-destructive-foreground ${
              converging ? "animate-pulse bg-destructive" : "bg-destructive"
            }`}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive-foreground" aria-hidden />
            {converging ? "Breaking" : "Live"}
          </span>
          <span className="font-mono text-sm font-black uppercase tracking-[0.22em] text-popover-foreground">
            Soko <span className="text-primary">Live</span>
          </span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            {country.name} desk
          </span>
          <span className="num ml-auto font-mono text-[11px] text-popover-foreground/80">
            {clock} EAT
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close broadcast"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrolling content ────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Top story */}
          <div
            className="border-b border-border px-4 py-4 sm:px-5"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              Top story
            </p>
            {top ? (
              <>
                <a
                  key={top.id}
                  href={top.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-display mt-1.5 block text-xl font-semibold leading-snug text-popover-foreground hover:underline sm:text-2xl"
                >
                  {top.title}
                </a>
                <p className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <SentimentDot score={top.sentiment_score} className="h-1.5 w-1.5" />
                  {top.source} · {timeAgo(top.published_at)}
                </p>
                {articles.length > 1 && (
                  <div className="mt-3 flex gap-1.5" aria-hidden>
                    {articles.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        tabIndex={-1}
                        onClick={() => setStoryIdx(i)}
                        className={`h-1 rounded-full transition-all ${
                          i === storyIdx % articles.length
                            ? "w-6 bg-primary"
                            : "w-2.5 bg-popover-foreground/25 hover:bg-popover-foreground/40"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Signal is moving on trend velocity — no headlines in the last 24h yet.
              </p>
            )}
          </div>

          {/* Signal meter */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 w-28 overflow-hidden rounded-full bg-popover-foreground/10"
                role="img"
                aria-label={`Instability index ${instability} of 100`}
              >
                <div
                  className={`h-full rounded-full ${
                    instability >= 60
                      ? "bg-destructive"
                      : instability >= 30
                        ? "bg-primary"
                        : "bg-success"
                  }`}
                  style={{ width: `${instability}%` }}
                />
              </div>
              <span className="num font-mono text-[10px] uppercase tracking-[0.14em] text-popover-foreground">
                Instability {instability}/100
              </span>
            </div>
            <span className="num font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {articles.length} articles · 24h
              {signal.velocity > 0 && ` · velocity +${signal.velocity.toFixed(1)}`}
            </span>
            {(signal.eventHits > 0 || signal.quakeHits > 0) && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
                {[
                  signal.eventHits > 0 ? `${signal.eventHits} unrest events` : null,
                  signal.quakeHits > 0 ? `${signal.quakeHits} quakes M≥4.5` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            {converging && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-destructive">
                Signals converging
              </span>
            )}
          </div>

          {/* More of the wire */}
          {rest.length > 0 && (
            <ul className="divide-y divide-border px-4 sm:px-5">
              {rest.slice(0, 4).map((a) => (
                <li key={a.id} className="py-2.5">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 text-sm leading-snug text-popover-foreground hover:underline"
                  >
                    <SentimentDot score={a.sentiment_score} className="mt-1.5 h-1.5 w-1.5" />
                    {a.title}
                  </a>
                  <p className="mt-0.5 pl-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {a.source} · {timeAgo(a.published_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* Market update */}
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              Market update · biggest movers
            </p>
            {stocks.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {stocks.map((s) => (
                  <li key={s.ticker}>
                    <Link
                      to="/stocks/$ticker"
                      params={{ ticker: s.ticker }}
                      onClick={onClose}
                      className="inline-flex items-baseline gap-2 rounded-lg border border-border bg-popover-foreground/5 px-3 py-1.5 hover:bg-popover-foreground/10"
                    >
                      <span className="text-sm font-semibold text-popover-foreground">{s.name}</span>
                      <span className="num font-mono text-[11px] text-muted-foreground">
                        {fmtPrice(s.price, s.currencySymbol)}
                      </span>
                      {s.changePercent != null && (
                        <ChangeCell value={s.changePercent} className="text-[11px]" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <Radio className="h-3.5 w-3.5" aria-hidden />
                No live exchange feed for this region yet.
              </p>
            )}
          </div>
        </div>

        {/* ── Headline ticker ───────────────────────────────────────── */}
        {tickerItems.length > 0 && (
          <div className="flex items-stretch overflow-hidden border-t border-primary/30 bg-popover">
            <span className="z-10 flex shrink-0 items-center bg-primary px-2.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-primary-foreground">
              {country.name}
            </span>
            <div className="relative flex flex-1 items-center overflow-hidden">
              <div
                className="animate-ticker flex whitespace-nowrap"
                style={{ animationDuration: "55s" }}
              >
                {[0, 1].map((copy) => (
                  <span
                    key={copy}
                    aria-hidden={copy === 1}
                    className="flex items-center font-mono text-[11px] text-popover-foreground"
                  >
                    {tickerItems.map((t, i) => (
                      <span key={i} className="flex items-center">
                        <span className="px-3">{t}</span>
                        <span className="text-primary">///</span>
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
