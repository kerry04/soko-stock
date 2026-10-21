import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import worldDots from "@/data/world-dots.json";
import { SIGNAL_COUNTRIES, type SignalCountry } from "@/lib/signal-countries";
import { isMarketRelevant } from "@/lib/news/relevance";
import { dedupeByTitle } from "@/lib/news/dedupe";
import { timeAgo } from "@/lib/stocks/format";
import { GlobeMap } from "./GlobeMap";
import { CountryBroadcast } from "./CountryBroadcast";
import { Chip } from "@/components/ui/chip";
import { StateBlock } from "@/components/common/states";

interface WorldDotsData {
  cols: number;
  rows: number;
  dots: [number, number, number][];
  countries: { id: string; name: string }[];
}

const DOTS = worldDots as WorldDotsData;

export interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  relevant_keywords: string[] | null;
  sentiment_score: number | null;
}

interface TrendRow {
  keyword: string;
  velocity: number;
  avg_sentiment: number;
  mentions_1h: number;
}

export interface StockLink {
  ticker: string;
  name: string;
  price: number;
  changePercent: number | null;
  currencySymbol: string;
}

export interface CountrySignal {
  country: SignalCountry;
  articles: Article[];
  score: number;
  velocity: number;
  /** 0–100 instability index: volume + negative sentiment + event-theme hits + quakes. */
  instability: number;
  /** True when ≥2 independent signal types fire in the same 24h window. */
  converging: boolean;
  eventHits: number;
  quakeHits: number;
}

function matchesCountry(a: Article, c: SignalCountry): boolean {
  const hay = `${a.title} ${(a.relevant_keywords ?? []).join(" ")}`.toLowerCase();
  if (c.keywords.some((k) => hay.includes(k))) return true;
  // USGS quake titles carry place names ("M 5.4 - 69 km ENE of Tadine, New
  // Caledonia") — fall back to matching the country name itself.
  if (a.source === "USGS Earthquakes") return hay.includes(c.name.toLowerCase());
  return false;
}

const EVENT_SOURCES = new Set(["GDELT Protests", "GDELT Conflict"]);

/**
 * Per-country instability index (0–100), recomputed live from our own
 * pipeline. Transparent formula, not a black box:
 *   volume (24h articles, capped) ............ 40 pts
 *   negative-sentiment share ................ 30 pts
 *   coded event hits (protests/conflict) .... 20 pts
 *   significant quakes (M≥4.5) .............. 10 pts
 * Converging = ≥2 independent signal types firing in the same window.
 */
function scoreCountry(
  country: SignalCountry,
  articles: Article[],
  trendByKw: Map<string, TrendRow>,
): CountrySignal {
  const matched = articles.filter((a) => matchesCountry(a, country));
  let velocity = 0;
  for (const kw of country.keywords) {
    const t = trendByKw.get(kw);
    if (t) velocity += Number(t.velocity) || 0;
  }
  const scored = matched.filter((a) => a.sentiment_score != null);
  const negShare =
    scored.length > 0
      ? scored.filter((a) => (a.sentiment_score ?? 0) < -0.2).length / scored.length
      : 0;
  const eventHits = matched.filter((a) => EVENT_SOURCES.has(a.source)).length;
  const quakeHits = matched.filter((a) => a.source === "USGS Earthquakes").length;

  const instability = Math.round(
    Math.min(1, matched.length / 20) * 40 +
      negShare * 30 +
      Math.min(1, eventHits / 3) * 20 +
      Math.min(1, quakeHits / 2) * 10,
  );
  const activeTypes = [
    matched.length >= 8,
    negShare >= 0.4 && scored.length >= 3,
    eventHits > 0,
    quakeHits > 0,
  ].filter(Boolean).length;
  const converging = activeTypes >= 2;

  // Map pulse score: article volume leads, keyword velocity amplifies.
  const score = matched.length + velocity / 25;
  return {
    country,
    articles: matched.slice(0, 8),
    score,
    velocity,
    instability,
    converging,
    eventHits,
    quakeHits,
  };
}

/**
 * Live signal map: a canvas dot-matrix world rendered from a build-time
 * baked grid (no tiles, no keys). Countries pulse with news-signal
 * intensity computed from our own pipeline. Click a country for headlines
 * and linked markets. Never fabricates data — quiet countries stay dim.
 */
export function SignalMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [signals, setSignals] = useState<CountrySignal[]>([]);
  const [stocks, setStocks] = useState<StockLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [selected, setSelected] = useState<CountrySignal | null>(null);
  const [view, setView] = useState<"globe" | "flat">("globe");
  const [globeError, setGlobeError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<CountrySignal | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  const signalsRef = useRef<CountrySignal[]>([]);
  const hoveredRef = useRef<CountrySignal | null>(null);
  const selectedRef = useRef<CountrySignal | null>(null);
  signalsRef.current = signals;
  hoveredRef.current = hovered;
  selectedRef.current = selected;

  const countryIdxById = useMemo(() => {
    const m = new Map<string, number>();
    DOTS.countries.forEach((c, i) => m.set(c.id, i));
    return m;
  }, []);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ data: news }, { data: trends }] = await Promise.all([
      supabase
        .from("raw_news_data")
        .select("id, title, url, source, published_at, relevant_keywords, sentiment_score")
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(600),
      supabase.from("trending_keywords").select("keyword, velocity, avg_sentiment, mentions_1h"),
    ]);

    const articles = dedupeByTitle(
      ((news ?? []) as Article[]).filter(
        (a) => a.title && a.url && isMarketRelevant(a.title),
      ),
    );
    const trendRows = (trends ?? []) as TrendRow[];
    const trendByKw = new Map<string, TrendRow>();
    trendRows.forEach((t) => trendByKw.set(t.keyword.toLowerCase(), t));

    const sigs: CountrySignal[] = SIGNAL_COUNTRIES.map((country) =>
      scoreCountry(country, articles, trendByKw),
    ).filter((s) => s.score > 0);

    sigs.sort((a, b) => b.score - a.score);
    setSignals(sigs);
    setAsOf(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    const id = setInterval(
      () => {
        if (document.visibilityState === "visible") load().catch(() => {});
      },
      5 * 60 * 1000,
    );
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  // ── Canvas rendering ──────────────────────────────────────────────
  // Deps include `view`: when the flat canvas (re)mounts via the toggle,
  // this must run again — signal data alone doesn't change on a toggle,
  // and without the re-run the canvas stayed blank until the next
  // 5-minute refresh.
  useEffect(() => {
    if (view !== "flat") return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = width / 2;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Per-dot country lookup: dot index -> signal (or null). Rebuilt
    // whenever the signal set changes (the effect re-runs on [signals]).
    const dotSignal: (CountrySignal | null)[] = DOTS.dots.map(() => null);
    for (const s of signalsRef.current) {
      const idx = countryIdxById.get(s.country.id);
      if (idx === undefined) continue;
      for (let i = 0; i < DOTS.dots.length; i++) {
        if (DOTS.dots[i][2] === idx) dotSignal[i] = s;
      }
    }

    const maxScore = Math.max(1, ...signalsRef.current.map((s) => s.score));
    const dark = () => document.documentElement.classList.contains("dark");

    const draw = (t: number) => {
      const isDark = dark();
      ctx.clearRect(0, 0, width, height);
      const r = Math.max(1, width / 640);

      for (let i = 0; i < DOTS.dots.length; i++) {
        const [x, y] = DOTS.dots[i];
        const s = dotSignal[i];
        const px = x * width;
        const py = y * height;
        if (s) {
          const heat = Math.min(1, s.score / maxScore);
          const pulse = reduced ? 0 : 0.25 * Math.sin(t / 700 + px / 40) + 0.25;
          const alpha = 0.45 + heat * 0.5 + pulse * heat;
          // Converging countries burn red; the rest pulse green.
          const rgb = s.converging ? "239, 68, 68" : isDark ? "34, 197, 94" : "22, 163, 74";
          ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          const rad = r * (1 + heat * 1.6);
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = isDark ? "rgba(148, 163, 184, 0.28)" : "rgba(100, 116, 139, 0.35)";
          ctx.beginPath();
          ctx.arc(px, py, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Expanding rings on the hottest countries.
      if (!reduced) {
        const hot = signalsRef.current.slice(0, 6);
        for (const s of hot) {
          const heat = Math.min(1, s.score / maxScore);
          const phase = (t / 2400 + s.country.cx * 7) % 1;
          const rad = (6 + phase * 34) * heat + 4;
          const rgb = s.converging ? "239, 68, 68" : isDark ? "34, 197, 94" : "22, 163, 74";
          ctx.strokeStyle = `rgba(${rgb}, ${(0.5 * (1 - phase) * heat).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(s.country.cx * width, s.country.cy * height, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Hover / selection crosshair.
      const focus = hoveredRef.current ?? selectedRef.current;
      if (focus) {
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1;
        const fx = focus.country.cx * width;
        const fy = focus.country.cy * height;
        ctx.beginPath();
        ctx.arc(fx, fy, 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // Rebuild dot colors when signals change (or the flat view remounts)
    // by re-running the effect.
  }, [signals, countryIdxById, view]);

  const pickCountry = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    let best: CountrySignal | null = null;
    let bestD = 0.055;
    for (const s of signalsRef.current) {
      const d = Math.hypot(s.country.cx - nx, s.country.cy - ny);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };

  // Stocks listed in the selected country (via its live exchange, if any).
  useEffect(() => {
    if (!selected) {
      setStocks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { EXCHANGES } = await import("@/lib/stocks/exchanges");
        const ex = EXCHANGES.find(
          (e) => e.countryAlpha2 === selected.country.alpha2 && e.status === "live",
        );
        if (!ex) {
          if (!cancelled) setStocks([]);
          return;
        }
        const res = await fetch(`/api/stocks/board?exchange=${ex.id}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        const rows = (json.rows ?? []) as {
          ticker: string;
          name: string;
          price: number;
          changePercent: number | null;
        }[];
        const top = [...rows]
          .sort(
            (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
          )
          .slice(0, 3)
          .map((r) => ({ ...r, currencySymbol: json.currencySymbol as string }));
        if (!cancelled) setStocks(top);
      } catch {
        if (!cancelled) setStocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="relative">
      {view === "globe" ? (
        <GlobeMap
          signals={signals}
          selected={selected}
          onSelect={setSelected}
          onError={(msg) => {
            setGlobeError(msg ?? "unknown globe error");
            setView("flat");
          }}
        />
      ) : (
        <div
          ref={wrapRef}
        className="relative w-full cursor-crosshair overflow-hidden rounded-lg border border-border/70 bg-card/30"
      >
        <canvas
          ref={canvasRef}
          className="block w-full"
          role="img"
          aria-label="World signal map: countries pulsing with live news intensity"
          onMouseMove={(e) => {
            const s = pickCountry(e.clientX, e.clientY);
            setHovered(s);
            if (s) {
              const rect = wrapRef.current?.getBoundingClientRect();
              setTipPos(rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
            } else setTipPos(null);
          }}
          onMouseLeave={() => {
            setHovered(null);
            setTipPos(null);
          }}
          onClick={(e) => {
            const s = pickCountry(e.clientX, e.clientY);
            setSelected((prev) => (prev?.country.id === s?.country.id ? null : s));
          }}
        />
        {hovered && tipPos && !selected && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-background/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
            style={{ left: tipPos.x, top: Math.max(8, tipPos.y - 52) }}
          >
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
              {hovered.country.name}
            </div>
            <div className="num font-mono text-[10px] text-success">
              {hovered.articles.length} articles · 24h
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <StateBlock tone="loading" title="Tuning frequencies…" className="border-none px-0 py-0" />
          </div>
        )}
        </div>
      )}

      {/* Legend / status strip */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
          Live
        </span>
        <span>{signals.length} countries with signal</span>
        {globeError && (
          <span className="normal-case tracking-normal text-destructive">
            globe unavailable ({globeError}) — showing flat map
          </span>
        )}
        {signals.some((s) => s.converging) && (
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" aria-hidden />
            {signals.filter((s) => s.converging).length} converging
          </span>
        )}
        {asOf && (
          <span>as of {asOf.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          <Chip size="sm" active={view === "globe"} onClick={() => setView("globe")}>
            Globe
          </Chip>
          <Chip size="sm" active={view === "flat"} onClick={() => setView("flat")}>
            Flat
          </Chip>
        </span>
        <span className="hidden sm:inline">
          {view === "globe"
            ? "Drag to spin · click a lit country"
            : "Click a lit country for headlines"}
        </span>
      </div>

      {/* Country rail — every lit country as a plain button. The reliable
          way into the broadcast: 3D hit-testing on a spinning globe can
          swallow clicks as drags, a button never does. */}
      {signals.length > 0 && (
        <div
          className="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto pb-1"
          role="group"
          aria-label="Countries with signal — open a broadcast"
        >
          {[...signals]
            .sort((a, b) => b.articles.length - a.articles.length)
            .map((s) => {
              const isSel = selected?.country.id === s.country.id;
              return (
                <Chip
                  key={s.country.id}
                  active={isSel}
                  onClick={() =>
                    setSelected((prev) => (prev?.country.id === s.country.id ? null : s))
                  }
                  className="shrink-0"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${s.converging ? "bg-destructive" : "bg-success"} animate-pulse`}
                    aria-hidden
                  />
                  <span className="font-bold uppercase tracking-[0.12em]">{s.country.name}</span>
                  <span className="num text-muted-foreground">{s.articles.length} · 24h</span>
                  {s.converging && (
                    <span className="font-bold uppercase tracking-[0.12em] text-destructive">
                      Converging
                    </span>
                  )}
                </Chip>
              );
            })}
        </div>
      )}

      {/* Country broadcast pop-up (click a lit country, either view) */}
      {selected && (
        <CountryBroadcast signal={selected} stocks={stocks} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
