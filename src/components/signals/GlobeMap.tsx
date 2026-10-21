import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { SIGNAL_COUNTRY_BY_ID } from "@/lib/signal-countries";
import { StateBlock } from "@/components/common/states";
import { findFeatureAtGeo, isTapGesture, type PointerSnapshot } from "./globe-tap";
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
  onPolygonClick(fn: (f: CountryFeature, ev?: { timeStamp: number }) => void): GlobeApi;
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
  toGlobeCoords(x: number, y: number): { lat: number; lng: number } | null;
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

  // ── Tap detection ─────────────────────────────────────────────────
  // globe.gl's polygon click almost never fires for touch: its pointer
  // layer flags any pressed touch pointermove as a drag (movementX is
  // undefined on most touch browsers, which alone trips the flag) and
  // then swallows the click on release (clickAfterDrag is false). So
  // the wrapper tracks gestures itself and hit-tests taps against the
  // same features the polygons are drawn from. Mouse keeps using the
  // polygon click path; both funnel into applyFeatureTap, deduped by
  // the originating pointerup's timeStamp (globe.gl forwards the same
  // event object to onPolygonClick, deferred via requestAnimationFrame,
  // so a duplicate always carries the tap's timeStamp).
  const downRef = useRef<PointerSnapshot | null>(null);
  const activePointersRef = useRef(0);
  const multiTouchRef = useRef(false);
  const lastTapRef = useRef<{ timeStamp: number; featureId: string } | null>(null);

  /** The one selection behaviour, shared by polygon clicks and taps:
   *  a lit country toggles selection and flies into view; a quiet
   *  country clears the selection. Reads only refs, so it never goes
   *  stale inside the mount-once effect or the pointer handlers. */
  const applyFeatureTap = (f: CountryFeature) => {
    const s = f.signal;
    if (s) {
      onSelectRef.current(selectedRef.current?.country.id === s.country.id ? null : s);
      const globe = globeRef.current;
      if (globe) {
        const { lat, lng } = centroidLatLng(s);
        globe.pointOfView({ lat, lng, altitude: 1.35 }, 900);
      }
    } else {
      onSelectRef.current(null);
    }
  };

  /** Resolve a tap at container-relative CSS px to a country and apply
   *  it. Off-globe (null geo) and ocean taps (no feature) are ignored,
   *  mirroring a background click, which selects nothing. */
  const handleTapAt = (relX: number, relY: number, timeStamp: number) => {
    const globe = globeRef.current;
    if (!globe) return;
    const geo = globe.toGlobeCoords(relX, relY);
    if (!geo) return;
    const f = findFeatureAtGeo(featuresRef.current, geo.lng, geo.lat);
    if (!f) return;
    lastTapRef.current = { timeStamp, featureId: String(f.id) };
    applyFeatureTap(f);
  };

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
            // Theme-var colours: the label pill follows the app theme
            // (popover surface) instead of a hard-coded dark slate.
            if (!s) {
              return `<div style="font-family:monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;background:var(--color-popover);border:1px solid var(--color-border);border-radius:4px;padding:5px 8px;color:var(--color-popover-foreground)">${name}</div>`;
            }
            return `<div style="font-family:monospace;font-size:11px;background:var(--color-popover);border:1px solid color-mix(in oklch, var(${
              s.converging ? "--color-destructive" : "--color-success"
            }) 65%, transparent);border-radius:4px;padding:6px 9px;color:var(--color-popover-foreground)">
              <div style="font-weight:700;letter-spacing:0.14em;text-transform:uppercase">${name}</div>
              <div style="color:var(${s.converging ? "--color-destructive" : "--color-success"});margin-top:2px">${s.articles.length} articles · 24h · instability ${s.instability}/100${s.converging ? " · CONVERGING" : ""}</div>
            </div>`;
          })
          .onPolygonClick((f, ev) => {
            // A tap already resolved by the wrapper's own detector
            // arrives here again (globe.gl defers its click through
            // requestAnimationFrame with the same pointerup event) —
            // applying it twice would toggle the selection back off.
            const last = lastTapRef.current;
            if (
              ev &&
              last &&
              Math.abs(ev.timeStamp - last.timeStamp) <= 1 &&
              last.featureId === String(f.id)
            ) {
              return;
            }
            applyFeatureTap(f);
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
      className="relative h-[440px] w-full overflow-hidden rounded-lg border border-border/70 bg-[radial-gradient(ellipse_at_center,var(--color-card)_0%,var(--color-background)_75%)] sm:h-[540px]"
      role="img"
      aria-label="3D globe: countries glowing with live news-signal intensity. Drag to spin, click a lit country for headlines."
      onPointerDown={(e) => {
        activePointersRef.current += 1;
        if (activePointersRef.current > 1) {
          // Second finger down (pinch): this gesture is not a tap.
          multiTouchRef.current = true;
          downRef.current = null;
          return;
        }
        if (e.isPrimary && e.button === 0) {
          downRef.current = {
            x: e.clientX,
            y: e.clientY,
            time: e.timeStamp,
            pointerId: e.pointerId,
          };
        }
      }}
      onPointerUp={(e) => {
        activePointersRef.current = Math.max(0, activePointersRef.current - 1);
        if (activePointersRef.current === 0) multiTouchRef.current = false;
        const down = downRef.current;
        downRef.current = null;
        if (!down || multiTouchRef.current || !e.isPrimary || e.button !== 0) return;
        const up: PointerSnapshot = {
          x: e.clientX,
          y: e.clientY,
          time: e.timeStamp,
          pointerId: e.pointerId,
        };
        if (!isTapGesture(down, up)) return;
        // Best-effort only: a failed tap must never take the page down,
        // and no preventDefault — drags, pinches and page scroll are
        // left exactly as the globe's own controls handle them.
        try {
          const host = hostRef.current;
          if (!host) return;
          const rect = host.getBoundingClientRect();
          handleTapAt(e.clientX - rect.left, e.clientY - rect.top, e.timeStamp);
        } catch {
          /* ignore: mouse clicks and the country rail still work */
        }
      }}
      onPointerCancel={() => {
        activePointersRef.current = Math.max(0, activePointersRef.current - 1);
        if (activePointersRef.current === 0) multiTouchRef.current = false;
        downRef.current = null;
      }}
    >
      {/* Globe host: globe.gl owns this node's entire subtree. */}
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <StateBlock tone="loading" title="Spinning up the globe…" className="border-none px-0 py-0" />
        </div>
      )}
    </div>
  );
}
