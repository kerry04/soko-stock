import type { Feature, MultiPolygon, Polygon } from "geojson";

/**
 * Tap detection + geo hit-testing for the 3D globe.
 *
 * Why this exists: globe.gl's own polygon click path is unreliable for
 * touch. Its pointer layer marks a press as "dragging" on any pressed
 * pointermove when the pointer is not a mouse and either movementX is
 * undefined (most touch browsers) or moves more than 1px — i.e. every
 * real finger tap — and then swallows the click on pointerup because
 * clickAfterDrag defaults to false. Even a perfectly still tap depends
 * on a hover raycast that touch never produces. So GlobeMap tracks the
 * gesture itself: a short, near-stationary press is a tap, the tap
 * point is converted to geo coords by the globe, and the country is
 * found by hit-testing the same GeoJSON features the polygons are
 * drawn from. Everything here is pure so it can be unit-tested.
 */

/** Max pointer travel (CSS px) for a press to count as a tap. Finger
 *  taps routinely jitter a few px; a rotate drag travels far more. */
export const TAP_MAX_DISTANCE_PX = 10;

/** Max press duration (ms) for a tap. Longer presses are holds/drags. */
export const TAP_MAX_DURATION_MS = 500;

export interface PointerSnapshot {
  x: number;
  y: number;
  /** Event timeStamp (ms, monotonic clock shared by pointer events). */
  time: number;
  pointerId: number;
}

/** True when down→up looks like a tap on the same pointer: short press,
 *  barely moved. Anything else is a drag, a hold, or a pinch remnant. */
export function isTapGesture(down: PointerSnapshot, up: PointerSnapshot): boolean {
  if (down.pointerId !== up.pointerId) return false;
  const dt = up.time - down.time;
  if (dt < 0 || dt > TAP_MAX_DURATION_MS) return false;
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_MAX_DISTANCE_PX;
}

type Position = number[];

/** Ray-casting point-in-ring over [lng, lat] positions. Points exactly
 *  on an edge are unspecified (either answer is fine for a tap target). */
export function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point in a GeoJSON Polygon/MultiPolygon coordinate set: inside an
 *  outer ring and not inside any of its holes. The 110m atlas splits
 *  countries at the antimeridian, so rings never wrap past ±180. */
export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: Polygon | MultiPolygon,
): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    if (rings.length === 0) continue;
    if (!pointInRing(lng, lat, rings[0])) continue;
    if (rings.slice(1).some((hole) => pointInRing(lng, lat, hole))) continue;
    return true;
  }
  return false;
}

/** First feature whose geometry contains the geo point, or null (ocean,
 *  or a country the atlas doesn't draw). Same feature set the globe's
 *  polygons are rendered from, so a tap can only hit what is visible. */
export function findFeatureAtGeo<F extends Feature<Polygon | MultiPolygon>>(
  features: readonly F[],
  lng: number,
  lat: number,
): F | null {
  for (const f of features) {
    if (f.geometry && pointInGeometry(lng, lat, f.geometry)) return f;
  }
  return null;
}
