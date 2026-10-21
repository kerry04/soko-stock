import { describe, expect, it } from "vitest";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  findFeatureAtGeo,
  isTapGesture,
  pointInGeometry,
  pointInRing,
  TAP_MAX_DISTANCE_PX,
  TAP_MAX_DURATION_MS,
  type PointerSnapshot,
} from "./globe-tap";

const snap = (over: Partial<PointerSnapshot>): PointerSnapshot => ({
  x: 100,
  y: 200,
  time: 1000,
  pointerId: 7,
  ...over,
});

describe("isTapGesture", () => {
  it("accepts a short, near-stationary press", () => {
    expect(isTapGesture(snap({}), snap({ x: 103, y: 198, time: 1000 + 180 }))).toBe(true);
  });

  it("accepts a press exactly at the distance and duration limits", () => {
    expect(
      isTapGesture(
        snap({}),
        snap({ x: 100 + TAP_MAX_DISTANCE_PX, time: 1000 + TAP_MAX_DURATION_MS }),
      ),
    ).toBe(true);
  });

  it("rejects a drag (moved too far)", () => {
    expect(isTapGesture(snap({}), snap({ x: 100 + TAP_MAX_DISTANCE_PX + 1, time: 1150 }))).toBe(
      false,
    );
  });

  it("rejects a long press / hold", () => {
    expect(isTapGesture(snap({}), snap({ time: 1000 + TAP_MAX_DURATION_MS + 1 }))).toBe(false);
  });

  it("rejects a release from a different pointer (pinch remnant)", () => {
    expect(isTapGesture(snap({}), snap({ pointerId: 8, time: 1100 }))).toBe(false);
  });

  it("rejects a release timestamped before the press", () => {
    expect(isTapGesture(snap({}), snap({ time: 900 }))).toBe(false);
  });
});

// A rough Kenya-sized square: lng 34–42, lat -5–5.
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [34, -5],
      [42, -5],
      [42, 5],
      [34, 5],
      [34, -5],
    ],
  ],
};

// Same square with a hole at lng 37–38, lat 0–1 (think: a lake enclave).
const withHole: Polygon = {
  type: "Polygon",
  coordinates: [
    square.coordinates[0],
    [
      [37, 0],
      [38, 0],
      [38, 1],
      [37, 1],
      [37, 0],
    ],
  ],
};

// Two disjoint boxes (mainland + island).
const multi: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    square.coordinates,
    [
      [
        [50, 10],
        [52, 10],
        [52, 12],
        [50, 12],
        [50, 10],
      ],
    ],
  ],
};

describe("pointInRing / pointInGeometry", () => {
  it("finds points inside and outside a ring", () => {
    expect(pointInRing(38, 0.5, square.coordinates[0])).toBe(true);
    expect(pointInRing(30, 0.5, square.coordinates[0])).toBe(false);
    expect(pointInRing(38, 9, square.coordinates[0])).toBe(false);
  });

  it("excludes points inside a hole", () => {
    expect(pointInGeometry(37.5, 0.5, withHole)).toBe(false);
    expect(pointInGeometry(36, 0.5, withHole)).toBe(true);
  });

  it("matches any polygon of a MultiPolygon", () => {
    expect(pointInGeometry(51, 11, multi)).toBe(true);
    expect(pointInGeometry(38, 0, multi)).toBe(true);
    expect(pointInGeometry(45, 11, multi)).toBe(false);
  });
});

describe("findFeatureAtGeo", () => {
  const kenya: Feature<Polygon> = {
    type: "Feature",
    id: "404",
    properties: { name: "Kenya" },
    geometry: square,
  };
  const island: Feature<MultiPolygon> = {
    type: "Feature",
    id: "999",
    properties: { name: "Island" },
    geometry: multi,
  };

  it("returns the feature containing the point", () => {
    expect(findFeatureAtGeo([kenya, island], 38, 0)).toBe(kenya);
    expect(findFeatureAtGeo([kenya, island], 51, 11)).toBe(island);
  });

  it("returns null over the ocean", () => {
    expect(findFeatureAtGeo([kenya, island], 20, -30)).toBeNull();
  });

  it("returns null for an empty feature set", () => {
    expect(findFeatureAtGeo([], 38, 0)).toBeNull();
  });
});
