/**
 * Geography for the world scene, from Natural Earth via world-atlas (countries-110m, ISC) and ISO 3166 code pairs from
 * i18n-iso-countries (MIT). Pure functions so they can be tested without WebGL.
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { feature } from "topojson-client";

export interface LatLon {
  lat: number;
  lon: number;
}

type Ring = ReadonlyArray<readonly number[]>;

/** Removes ±360° jumps so a ring that crosses the antimeridian stays continuous (x may leave −180…180). */
export function unwrapRing(ring: Ring): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let offset = 0;
  let prev: number | null = null;
  for (const p of ring) {
    const lon = p[0] ?? 0;
    const lat = p[1] ?? 0;
    if (prev !== null) {
      const d = lon - prev;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    prev = lon;
    out.push([lon + offset, lat]);
  }
  return out;
}

function polygonsOf(f: Feature): Ring[][] {
  const g = f.geometry as Polygon | MultiPolygon | null;
  if (!g) return [];
  return g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
}

/**
 * Equirectangular land raster (row 0 = 90° N). Scanline fill with the even-odd rule over every ring of every
 * polygon, so holes (lakes in the data) stay water. Columns wrap around the antimeridian.
 */
export function rasterizeLand(features: readonly Feature[], width: number, height: number): Uint8Array {
  const grid = new Uint8Array(width * height);
  for (const f of features) {
    for (const polygon of polygonsOf(f)) {
      const rings = polygon.map(unwrapRing);
      for (let y = 0; y < height; y++) {
        const lat = 90 - ((y + 0.5) / height) * 180;
        const xs: number[] = [];
        for (const ring of rings) {
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[i];
            const b = ring[j];
            if (!a || !b) continue;
            if (a[1] > lat !== b[1] > lat) xs.push(a[0] + ((lat - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const x0 = Math.ceil((((xs[k] ?? 0) + 180) / 360) * width - 0.5);
          const x1 = Math.floor((((xs[k + 1] ?? 0) + 180) / 360) * width - 0.5);
          for (let x = x0; x <= x1; x++) grid[y * width + (((x % width) + width) % width)] = 1;
        }
      }
    }
  }
  return grid;
}

export function isLand(grid: Uint8Array, width: number, height: number, lat: number, lon: number): boolean {
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
  const x = (((Math.floor(((lon + 180) / 360) * width)) % width) + width) % width;
  return grid[y * width + x] === 1;
}

/** Area-weighted centroid of the largest polygon (the mainland), in degrees. */
export function mainlandCentroid(f: Feature): LatLon | null {
  let best: { area: number; c: LatLon } | null = null;
  for (const polygon of polygonsOf(f)) {
    const outer = polygon[0];
    if (!outer) continue;
    const ring = unwrapRing(outer);
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p = ring[i];
      const q = ring[j];
      if (!p || !q) continue;
      const cross = q[0] * p[1] - p[0] * q[1];
      a += cross;
      cx += (q[0] + p[0]) * cross;
      cy += (q[1] + p[1]) * cross;
    }
    if (Math.abs(a) < 1e-9) continue;
    const c = { lon: cx / (3 * a), lat: cy / (3 * a) };
    c.lon = ((((c.lon + 180) % 360) + 360) % 360) - 180;
    if (!best || Math.abs(a) > best.area) best = { area: Math.abs(a), c };
  }
  return best?.c ?? null;
}

export interface Geo {
  width: number;
  height: number;
  land: Uint8Array;
  /** ISO 3166-1 alpha-2 → mainland centroid; small countries absent from the 110m data are missing */
  centroids: ReadonlyMap<string, LatLon>;
}

export function buildGeo(topology: Topology, codes: ReadonlyArray<readonly string[]>, width = 720, height = 360): Geo {
  const countries = feature(topology, topology.objects.countries as GeometryCollection).features as Feature[];
  const alpha2ByNumeric = new Map<string, string>();
  for (const row of codes) {
    const a2 = row[0];
    const num = row[2];
    if (a2 && num) alpha2ByNumeric.set(num, a2);
  }
  const centroids = new Map<string, LatLon>();
  for (const f of countries) {
    const a2 = typeof f.id === "string" ? alpha2ByNumeric.get(f.id) : undefined;
    const c = a2 ? mainlandCentroid(f) : null;
    if (a2 && c) centroids.set(a2, c);
  }
  return { width, height, land: rasterizeLand(countries, width, height), centroids };
}

/** Loads the topology lazily: only the World page pays for it. */
export async function loadGeo(): Promise<Geo> {
  const [topo, codes] = await Promise.all([import("world-atlas/countries-110m.json"), import("i18n-iso-countries/codes.json")]);
  return buildGeo(topo.default as unknown as Topology, codes.default as ReadonlyArray<readonly string[]>);
}
