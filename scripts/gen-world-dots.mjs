/**
 * Build-time generator: rasterizes the world landmass into a dot grid.
 *
 * Reads world-atlas countries-110m.json (TopoJSON), samples an
 * equirectangular grid, and writes a compact JSON of land dots with
 * per-dot country attribution. Checked into the repo — the Signal Map
 * renders from it with zero runtime fetches, zero API keys, zero tiles.
 *
 * Run: node scripts/gen-world-dots.mjs
 * Output: src/data/world-dots.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = require("world-atlas/countries-110m.json");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "data", "world-dots.json");

const COLS = 200;
const ROWS = 100;

const land = feature(topo, topo.objects.land);
const countries = feature(topo, topo.objects.countries);

function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonContains(polygon, lon, lat) {
  // polygon: array of rings; first is exterior, rest are holes.
  if (!ringContains(polygon[0], lon, lat)) return false;
  for (let k = 1; k < polygon.length; k++) {
    if (ringContains(polygon[k], lon, lat)) return false;
  }
  return true;
}

function geometryContains(geom, lon, lat) {
  if (!geom) return false;
  if (geom.type === "Polygon") return polygonContains(geom.coordinates, lon, lat);
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      if (polygonContains(poly, lon, lat)) return true;
    }
  }
  return false;
}

const landGeoms = land.features.map((f) => f.geometry);
const countryGeoms = countries.features.map((f) => ({
  id: String(f.id),
  name: f.properties?.name ?? String(f.id),
  geometry: f.geometry,
}));

function isLand(lon, lat) {
  for (const g of landGeoms) {
    if (geometryContains(g, lon, lat)) return true;
  }
  return false;
}

function countryAt(lon, lat) {
  for (let i = 0; i < countryGeoms.length; i++) {
    if (geometryContains(countryGeoms[i].geometry, lon, lat)) return i;
  }
  return -1;
}

const dots = [];
for (let row = 0; row < ROWS; row++) {
  const lat = 90 - ((row + 0.5) / ROWS) * 180;
  for (let col = 0; col < COLS; col++) {
    const lon = ((col + 0.5) / COLS) * 360 - 180;
    if (!isLand(lon, lat)) continue;
    const ci = countryAt(lon, lat);
    const x = Math.round((((lon + 180) / 360) * 10000)) / 10000;
    const y = Math.round((((90 - lat) / 180) * 10000)) / 10000;
    dots.push([x, y, ci]);
  }
}

const payload = {
  cols: COLS,
  rows: ROWS,
  dots,
  countries: countryGeoms.map((c) => ({ id: c.id, name: c.name })),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
console.log(
  `wrote ${OUT}: ${dots.length} land dots, ${countryGeoms.length} countries, ${(Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1)} KB`,
);
