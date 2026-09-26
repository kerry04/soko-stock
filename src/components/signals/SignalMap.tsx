import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Globe2, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPercent } from "@/lib/format";
import worldDots from "@/data/world-dots.json";
import { SIGNAL_COUNTRIES, type SignalCountry } from "@/lib/signal-countries";

interface WorldDotsData {
  cols: number;
  rows: number;
  dots: [number, number, number][];
  countries: { id: string; name: string }[];
}

const DOTS = worldDots as WorldDotsData;

interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  relevant_keywords: string[] | null;
}

interface TrendRow {
  keyword: string;
  velocity: number;
  avg_sentiment: number;
  mentions_1h: number;
}

interface MarketLink {
  slug: string;
  question: string;
  yes_price: number;
}

export interface CountrySignal {
  country: SignalCountry;
  articles: Article[];
  score: number;
  velocity: number;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function matchesCountry(a: Article, c: SignalCountry): boolean {
  const hay = `${a.title} ${(a.relevant_keywords ?? []).join(" ")}`.toLowerCase();
  return c.keywords.some((k) => hay.includes(k));
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
  const [markets, setMarkets] = useState<MarketLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [selected, setSelected] = useState<CountrySignal | null>(null);
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
    const [{ data: news }, { data: trends }, { data: mkts }] = await Promise.all([
      supabase
        .from("raw_news_data")
        .select("id, title, url, source, published_at, relevant_keywords")
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(400),
      supabase.from("trending_keywords").select("keyword, velocity, avg_sentiment, mentions_1h"),
      supabase
        .from("markets")
        .select("slug, question, keywords, yes_price")
        .eq("status", "open")
        .limit(60),
    ]);

    const articles = ((news ?? []) as Article[]).filter((a) => a.title && a.url);
    const trendRows = (trends ?? []) as TrendRow[];
    const trendByKw = new Map<string, TrendRow>();
    trendRows.forEach((t) => trendByKw.set(t.keyword.toLowerCase(), t));

    const sigs: CountrySignal[] = SIGNAL_COUNTRIES.map((country) => {
      const matched = articles.filter((a) => matchesCountry(a, country));
      let velocity = 0;
      for (const kw of country.keywords) {
        const t = trendByKw.get(kw);
        if (t) velocity += Number(t.velocity) || 0;
      }
      // Score: article volume leads, keyword velocity amplifies. Transparent
      // and recomputed live — not a black box.
      const score = matched.length + velocity / 25;
      return { country, articles: matched.slice(0, 8), score, velocity };
    }).filter((s) => s.score > 0);

    sigs.sort((a, b) => b.score - a.score);
    setSignals(sigs);
    setMarkets(
      ((mkts ?? []) as (MarketLink & { keywords: string[] | null; question: string })[]).map(
        (m) => ({
          slug: m.slug,
          question: m.question,
          yes_price: Number(m.yes_price),
        }),
      ),
    );
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
  useEffect(() => {
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
          ctx.fillStyle = isDark
            ? `rgba(34, 197, 94, ${alpha.toFixed(3)})`
            : `rgba(22, 163, 74, ${alpha.toFixed(3)})`;
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
          ctx.strokeStyle = isDark
            ? `rgba(34, 197, 94, ${(0.5 * (1 - phase) * heat).toFixed(3)})`
            : `rgba(22, 163, 74, ${(0.5 * (1 - phase) * heat).toFixed(3)})`;
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
    // Rebuild dot colors when signals change by re-running the effect.
  }, [signals, countryIdxById]);

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

  const linkedMarkets = useMemo(() => {
    if (!selected) return [];
    const kws = selected.country.keywords;
    return markets
      .filter((m) => {
        const hay = m.question.toLowerCase();
        return kws.some((k) => hay.includes(k));
      })
      .slice(0, 3);
  }, [selected, markets]);

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-border/70 bg-card/30"
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
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Tuning frequencies…
            </span>
          </div>
        )}
      </div>

      {/* Legend / status strip */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
          Live
        </span>
        <span>{signals.length} countries with signal</span>
        {asOf && (
          <span>as of {asOf.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        )}
        <span className="ml-auto hidden sm:inline">Click a lit country for headlines</span>
      </div>

      {/* Country detail panel */}
      {selected && (
        <CountryPanel signal={selected} markets={linkedMarkets} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CountryPanel({
  signal,
  markets,
  onClose,
}: {
  signal: CountrySignal;
  markets: MarketLink[];
  onClose: () => void;
}) {
  return (
    <section
      aria-label={`${signal.country.name} signals`}
      className="mt-3 rounded-xl border border-border/70 bg-card/60 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-success" aria-hidden />
            <h3 className="font-mono text-sm font-bold uppercase tracking-[0.18em]">
              {signal.country.name}
            </h3>
          </div>
          <p className="num mt-1 font-mono text-[11px] text-muted-foreground">
            {signal.articles.length} articles · 24h
            {signal.velocity > 0 && ` · velocity +${signal.velocity.toFixed(1)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {signal.articles.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No signals tracked here yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {signal.articles.slice(0, 5).map((a) => (
            <li key={a.id} className="group">
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm leading-snug text-foreground group-hover:underline"
              >
                {a.title}
                <ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" aria-hidden />
              </a>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {a.source} · {timeAgo(a.published_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {markets.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Trade this region
          </p>
          <ul className="mt-2 space-y-2">
            {markets.map((m) => (
              <li
                key={m.slug}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.question}</p>
                  <p className="num font-mono text-[11px] text-success">
                    YES {formatPercent(m.yes_price)}
                  </p>
                </div>
                <Link
                  to="/markets/$slug"
                  params={{ slug: m.slug }}
                  className="shrink-0 rounded-md bg-success px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-success-foreground hover:bg-success/90"
                >
                  Trade
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {markets.length === 0 && (
        <p className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4 font-mono text-[11px] text-muted-foreground">
          <Radio className="h-3.5 w-3.5" aria-hidden />
          No open markets linked to this region yet.
        </p>
      )}
    </section>
  );
}
