import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { SIGNAL_COUNTRY_BY_ID } from "@/lib/signal-countries";
import type { CountrySignal } from "./SignalMap";

/**
 * 3D signal globe (globe.gl / three.js), loaded lazily so the three.js
 * chunk only ships to the map page. Same data, same semantics as the flat
 * dot map: quiet countries stay dark slate, signal countries glow green by
 * heat, converging countries burn red and sit higher, rings pulse from the
 * hottest centroids. Clicking a lit country opens the same detail panel.
 * Falls back to the flat map (via onError) if WebGL or the chunk fails.
 *
 * DOM contract (load-bearing): globe.gl owns everything inside the host
 * node — it rewrites that subtree imperatively. React must never render
 * conditional children inside the host, and must not clear it manually;
 * React's only job is mounting/removing the host node itself. The loading
 * overlay lives as a SIBLING of the host for the same reason. Violating
 * this crashes the page with a removeChild NotFoundError the moment the
 * overlay unmounts.
 */

interface CountryFeature extends Feature<Polygon | MultiPolygon, { name: string }> {
  signal: CountrySignal | null;
}

interface RingDatum {
  lat: number;
  lng: number;
  color: string;
  maxRadius: number;
}

/** Minimal typed facade over the globe.gl instance (its own generics are
 *  data-shape-driven; we only use this fixed surface). */
interface GlobeApi {
  width(n: number): GlobeApi;
  height(n: number): GlobeApi;
  backgroundColor(c: string): GlobeApi;
  showAtmosphere(b: boolean): GlobeApi;
  atmosphereColor(c: string): GlobeApi;
  atmosphereAltitude(n: number): GlobeApi;
  polygonsData(d: CountryFeature[]): GlobeApi;
  polygonCapColor(fn: (f: CountryFeature) => string): GlobeApi;
  polygonSideColor(fn: (f: CountryFeature) => string): GlobeApi;
  polygonStrokeColor(fn: (f: CountryFeature) => string): GlobeApi;
  polygonAltitude(fn: (f: CountryFeature) => number): GlobeApi;
  polygonLabel(fn: (f: CountryFeature) => string): GlobeApi;
  onPolygonClick(fn: (f: CountryFeature) => void): GlobeApi;
  onPolygonHover(fn: (f: CountryFeature | null) => void): GlobeApi;
  polygonsTransitionDuration(n: number): GlobeApi;
  ringsData(d: RingDatum[]): GlobeApi;
  ringLat(fn: (d: RingDatum) => number): GlobeApi;
  ringLng(fn: (d: RingDatum) => number): GlobeApi;
  ringColor(fn: (d: RingDatum) => string): GlobeApi;
  ringMaxRadius(fn: (d: RingDatum) => number): GlobeApi;
  ringPropagationSpeed(n: number): GlobeApi;
  ringRepeatPeriod(n: number): GlobeApi;
  pointOfView(pov: { lat: number; lng: number; altitude: number }, ms?: number): GlobeApi;
  controls(): {
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableZoom: boolean;
    minDistance: number;
    maxDistance: number;
    addEventListener?: (ev: string, fn: () => void) => void;
  };
  pauseAnimation(): void;
  _destructor?: () => void;
}

type GlobeFactory = (config?: Record<string, unknown>) => (el: HTMLElement) => GlobeApi;

const centroidLatLng = (s: CountrySignal) => ({
  lat: 90 - s.country.cy * 180,
  lng: s.country.cx * 360 - 180,
});

export function GlobeMap({
  signals,
  selected,
  onSelect,
  onError,
}: {
  signals: CountrySignal[];
  selected: CountrySignal | null;
  onSelect: (s: CountrySignal | null) => void;
  onError: (message?: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeApi | null>(null);
  const featuresRef = useRef<CountryFeature[]>([]);
  const signalsRef = useRef(signals);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const onErrorRef = useRef(onError);
  signalsRef.current = signals;
  selectedRef.current = selected;
  onSelectRef.current = onSelect;
  onErrorRef.current = onError;
  const [ready, setReady] = useState(false);

  // Build / update the polygon + ring layers from the live signals.
  // Hard-wrapped: globe.gl applies data inside its own animation digest,
  // so an accessor throw escapes the mount try/catch and would take the
  // whole page down via the router error boundary. Any failure here must
  // degrade to the flat map, never crash.
  const syncLayers = (globe: GlobeApi) => {
    try {
      const sigs = signalsRef.current;
      const maxScore = Math.max(1, ...sigs.map((s) => s.score));
      const byId = new Map(sigs.map((s) => [s.country.id, s]));
      const features = featuresRef.current.map((f) => ({
        ...f,
        signal: byId.get(String(f.id)) ?? null,
      }));
      featuresRef.current = features;
      globe.polygonsData(features);

      const heat = (s: CountrySignal) => Math.min(1, s.score / maxScore);
      const ringSignals = [
        ...sigs.filter((s) => s.converging),
        ...sigs.filter((s) => !s.converging),
      ].slice(0, 6);
      globe.ringsData(
        ringSignals.map((s) => ({
          ...centroidLatLng(s),
          color: s.converging ? "rgba(239, 68, 68, 0.9)" : "rgba(34, 197, 94, 0.85)",
          maxRadius: 3 + heat(s) * 5,
        })),
      );
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    let ro: ResizeObserver | undefined;

    // Diagnostic + safety net: globe.gl digests data inside its own
    // animation loop, so a throw there never reaches React. Surface the
    // first one through the same fallback path instead of a dead page.
    const onWindowError = (ev: ErrorEvent) => {
      if (ev.message) onErrorRef.current(ev.message);
    };
    window.addEventListener("error", onWindowError);

    (async () => {
      try {
        const [{ default: GlobeCtor }, { feature }, atlas] = await Promise.all([
          import("globe.gl"),
          import("topojson-client"),
          import("world-atlas/countries-110m.json"),
        ]);
        if (cancelled) return;
        const topo = atlas.default ?? atlas;
        const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<
          Polygon | MultiPolygon,
          { name: string }
        >;
        featuresRef.current = fc.features.map((f) => ({
          ...f,
          signal: null,
        })) as CountryFeature[];

        const Globe = GlobeCtor as unknown as GlobeFactory;
        const globe = Globe({ animateIn: true })(host);
        globeRef.current = globe;

        const maxScore = () => Math.max(1, ...signalsRef.current.map((s) => s.score));
        const heatOf = (f: CountryFeature) =>
          f.signal ? Math.min(1, f.signal.score / maxScore()) : 0;

        globe
          .backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(true)
          .atmosphereColor("#f59e0b")
          .atmosphereAltitude(0.16)
          .polygonCapColor((f) => {
            if (!f.signal) return "rgba(51, 65, 85, 0.88)";
            const h = heatOf(f);
            return f.signal.converging
              ? `rgba(239, 68, 68, ${(0.55 + 0.45 * h).toFixed(3)})`
              : `rgba(34, 197, 94, ${(0.4 + 0.55 * h).toFixed(3)})`;
          })
          .polygonSideColor(() => "rgba(15, 23, 42, 0.55)")
          .polygonStrokeColor((f) =>
            selectedRef.current && String(f.id) === selectedRef.current.country.id
              ? "rgba(255, 255, 255, 0.95)"
              : "rgba(100, 116, 139, 0.45)",
          )
          .polygonAltitude((f) => {
            if (!f.signal) return 0.012;
            const base = 0.02 + heatOf(f) * 0.05;
            return selectedRef.current && String(f.id) === selectedRef.current.country.id
              ? base + 0.03
              : base;
          })
          .polygonLabel((f) => {
            const s = f.signal;
            const name =
              s?.country.name ?? SIGNAL_COUNTRY_BY_ID[String(f.id)]?.name ?? f.properties.name;
            if (!s) {
              return `<div style="font-family:monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;background:rgba(2,6,23,0.92);border:1px solid rgba(100,116,139,0.5);border-radius:6px;padding:5px 8px;color:#e2e8f0">${name}</div>`;
            }
            return `<div style="font-family:monospace;font-size:11px;background:rgba(2,6,23,0.94);border:1px solid ${
              s.converging ? "rgba(239,68,68,0.7)" : "rgba(34,197,94,0.6)"
            };border-radius:6px;padding:6px 9px;color:#e2e8f0">
              <div style="font-weight:700;letter-spacing:0.14em;text-transform:uppercase">${name}</div>
              <div style="color:${s.converging ? "#f87171" : "#4ade80"};margin-top:2px">${s.articles.length} articles · 24h · instability ${s.instability}/100${s.converging ? " · CONVERGING" : ""}</div>
            </div>`;
          })
          .onPolygonClick((f) => {
            const s = f.signal;
            if (s) {
              onSelectRef.current(selectedRef.current?.country.id === s.country.id ? null : s);
              const { lat, lng } = centroidLatLng(s);
              globe.pointOfView({ lat, lng, altitude: 1.35 }, 900);
            } else {
              onSelectRef.current(null);
            }
          })
          .onPolygonHover((f) => {
            host.style.cursor = f?.signal ? "pointer" : "grab";
          })
          .polygonsTransitionDuration(650)
          .ringLat((d) => d.lat)
          .ringLng((d) => d.lng)
          .ringColor((d) => d.color)
          .ringMaxRadius((d) => d.maxRadius)
          .ringPropagationSpeed(1.7)
          .ringRepeatPeriod(1100)
          .pointOfView({ lat: 6, lng: 20, altitude: 1.55 });

        const controls = globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.55;
        controls.enableZoom = true;
        controls.minDistance = 135;
        controls.maxDistance = 420;
        try {
          controls.addEventListener?.("start", () => {
            controls.autoRotate = false;
            if (resumeTimer) clearTimeout(resumeTimer);
          });
          controls.addEventListener?.("end", () => {
            resumeTimer = setTimeout(() => {
              controls.autoRotate = true;
            }, 3000);
          });
        } catch {
          /* controls events are a nicety, not load-bearing */
        }

        const resize = () => {
          globe.width(host.clientWidth).height(host.clientHeight);
        };
        resize();
        ro = new ResizeObserver(resize);
        ro.observe(host);

        syncLayers(globe);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("error", onWindowError);
      if (resumeTimer) clearTimeout(resumeTimer);
      ro?.disconnect();
      try {
        globeRef.current?.pauseAnimation();
        globeRef.current?._destructor?.();
      } catch {
        /* noop */
      }
      globeRef.current = null;
      // No manual DOM clearing: React removes the host node wholesale on
      // unmount, and globe's children go with it.
    };
    // Mount once; live data flows through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh layers (colors, altitudes, rings) whenever signals/selection move.
  useEffect(() => {
    if (globeRef.current && ready) syncLayers(globeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, selected, ready]);

  return (
    <div
      className="relative h-[440px] w-full overflow-hidden rounded-xl border border-border/70 bg-[radial-gradient(ellipse_at_center,#0b1220_0%,#020617_72%)] sm:h-[540px]"
      role="img"
      aria-label="3D globe: countries glowing with live news-signal intensity. Drag to spin, click a lit country for headlines."
    >
      {/* Globe host: globe.gl owns this node's entire subtree. */}
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Spinning up the globe…
          </span>
        </div>
      )}
    </div>
  );
}
