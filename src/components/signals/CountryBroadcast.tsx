import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Radio, X } from "lucide-react";
import type { Article, CountrySignal, StockLink } from "./SignalMap";

/**
 * "Soko Live" broadcast pop-up for a selected country: a TV-news frame
 * over the live signal data — LIVE/BREAKING bug, EAT clock, a rotating
 * top story, the rest of the wire, the country's biggest exchange movers
 * as the market update, and a crawling headline ticker along the bottom.
 * Presentation only; every number comes from the same CountrySignal the
 * flat panel used. Nothing here is a real video feed.
 */

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function sentimentDot(a: Article): string {
  if (a.sentiment_score == null) return "bg-slate-400";
  if (a.sentiment_score < -0.2) return "bg-red-500";
  if (a.sentiment_score > 0.2) return "bg-emerald-500";
  return "bg-slate-400";
}

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
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-[#0a0f1a] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Broadcast header: bug + brand + clock ─────────────────── */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-white ${
              converging ? "animate-pulse bg-red-600" : "bg-red-600"
            }`}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
            {converging ? "Breaking" : "Live"}
          </span>
          <span className="font-mono text-sm font-black uppercase tracking-[0.22em] text-white">
            Soko <span className="text-amber-400">Live</span>
          </span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400 sm:inline">
            {country.name} desk
          </span>
          <span className="num ml-auto font-mono text-[11px] text-slate-300">
            {clock} EAT
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close broadcast"
            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrolling content ────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Top story */}
          <div
            className="border-b border-white/10 px-4 py-4 sm:px-5"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">
              Top story
            </p>
            {top ? (
              <>
                <a
                  key={top.id}
                  href={top.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 block text-xl font-bold leading-snug text-white hover:underline sm:text-2xl"
                >
                  {top.title}
                </a>
                <p className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${sentimentDot(top)}`} aria-hidden />
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
                            ? "w-6 bg-amber-400"
                            : "w-2.5 bg-white/25 hover:bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                Signal is moving on trend velocity — no headlines in the last 24h yet.
              </p>
            )}
          </div>

          {/* Signal meter */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10"
                role="img"
                aria-label={`Instability index ${instability} of 100`}
              >
                <div
                  className={`h-full rounded-full ${
                    instability >= 60
                      ? "bg-red-500"
                      : instability >= 30
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${instability}%` }}
                />
              </div>
              <span className="num font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
                Instability {instability}/100
              </span>
            </div>
            <span className="num font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {articles.length} articles · 24h
              {signal.velocity > 0 && ` · velocity +${signal.velocity.toFixed(1)}`}
            </span>
            {(signal.eventHits > 0 || signal.quakeHits > 0) && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-400">
                {[
                  signal.eventHits > 0 ? `${signal.eventHits} unrest events` : null,
                  signal.quakeHits > 0 ? `${signal.quakeHits} quakes M≥4.5` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            {converging && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-red-400">
                Signals converging
              </span>
            )}
          </div>

          {/* More of the wire */}
          {rest.length > 0 && (
            <ul className="divide-y divide-white/5 px-4 sm:px-5">
              {rest.slice(0, 4).map((a) => (
                <li key={a.id} className="py-2.5">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 text-sm leading-snug text-slate-100 hover:underline"
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sentimentDot(a)}`}
                      aria-hidden
                    />
                    {a.title}
                  </a>
                  <p className="mt-0.5 pl-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    {a.source} · {timeAgo(a.published_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* Market update */}
          <div className="border-t border-white/10 px-4 py-3 sm:px-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">
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
                      className="inline-flex items-baseline gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10"
                    >
                      <span className="text-sm font-semibold text-white">{s.name}</span>
                      <span className="num font-mono text-[11px] text-slate-300">
                        {s.currencySymbol}
                        {s.price.toLocaleString("en-ZA", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {s.changePercent != null && (
                        <span
                          className={`num font-mono text-[11px] font-bold ${
                            s.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {s.changePercent >= 0 ? "+" : ""}
                          {s.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                <Radio className="h-3.5 w-3.5" aria-hidden />
                No live exchange feed for this region yet.
              </p>
            )}
          </div>
        </div>

        {/* ── Headline ticker ───────────────────────────────────────── */}
        {tickerItems.length > 0 && (
          <div className="flex items-stretch overflow-hidden border-t border-amber-400/30 bg-black">
            <span className="z-10 flex shrink-0 items-center bg-amber-400 px-2.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-black">
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
                    className="flex items-center font-mono text-[11px] text-slate-200"
                  >
                    {tickerItems.map((t, i) => (
                      <span key={i} className="flex items-center">
                        <span className="px-3">{t}</span>
                        <span className="text-amber-400">///</span>
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
