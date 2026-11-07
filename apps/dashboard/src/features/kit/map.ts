/**
 * The audience map of the media kit (ANA-53): the world as a calm grid of dots (equirectangular, Antarctica cut off)
 * and one marker per country of the audience. The land is one SVG path of zero-length segments with round caps,
 * a few kilobytes instead of thousands of circles.
 */
import type { LatLon } from "@/features/world/geo";

export interface KitLand {
  /** viewBox width and height (cut at MAP_SOUTH) */
  width: number;
  height: number;
  /** height of the whole raster, 90° N to 90° S: the projection's scale */
  full: number;
  /** SVG path data: one "M x y h0" per land dot */
  path: string;
}

export interface KitGeo {
  land: KitLand;
  /** ISO 3166-1 alpha-2 → mainland centroid */
  centroids: ReadonlyMap<string, LatLon>;
}

/** southern edge of the map: below this latitude there is only Antarctica */
export const MAP_SOUTH = -58;

/** The land dots on a `step` pixel grid over an equirectangular raster (row 0 = 90° N), cut at MAP_SOUTH. */
export function landDots(raster: { width: number; height: number; land: Uint8Array }, step = 6): KitLand {
  const { width, height, land } = raster;
  const bottom = Math.floor(((90 - MAP_SOUTH) / 180) * height);
  const parts: string[] = [];
  for (let y = Math.floor(step / 2); y < bottom; y += step) {
    for (let x = Math.floor(step / 2); x < width; x += step) {
      if (land[y * width + x] === 1) parts.push(`M${x} ${y}h0`);
    }
  }
  return { width, height: bottom, full: height, path: parts.join("") };
}

/** the point of a coordinate on the map */
export function project(c: LatLon, land: Pick<KitLand, "width" | "full">): { x: number; y: number } {
  return { x: Math.round(((c.lon + 180) / 360) * land.width * 10) / 10, y: Math.round(((90 - c.lat) / 180) * land.full * 10) / 10 };
}
