import "server-only";
import { promises as fs } from "node:fs";
import { cache } from "react";
import path from "node:path";
import { EMPTY_KIT_CONFIG, parseKitConfig, type KitConfig } from "@/features/kit/config";
import { landDots, type KitGeo } from "@/features/kit/map";
import { loadGeo } from "@/features/world/geo";
import { historyFile } from "@/server/world/audienceHistory";

/**
 * media-kit.json (ANA-53): Ana's line, contact, case studies, packages, add-ons and brand presets. It sits next to
 * the audience history in the unit's StateDirectory, so it is never part of a release or of git (the repo is public).
 * Read on every page view: an edited file shows at once. Missing = empty kit content; unreadable = empty plus a flag
 * the internal preview shows.
 */
export function kitConfigFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return path.join(path.dirname(historyFile(env)), "media-kit.json");
}

/** one read per request: the page and its metadata share it */
export const readKitConfigOnce = cache(() => readKitConfig());

export async function readKitConfig(file = kitConfigFile()): Promise<{ config: KitConfig; error: boolean }> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException)?.code === "ENOENT";
    return { config: EMPTY_KIT_CONFIG, error: !missing };
  }
  try {
    return { config: parseKitConfig(JSON.parse(text)), error: false };
  } catch {
    return { config: EMPTY_KIT_CONFIG, error: true };
  }
}

let geo: Promise<KitGeo | null> | null = null;
/** the map's land dots and country centroids, built once per process */
export function kitGeo(): Promise<KitGeo | null> {
  geo ??= loadGeo()
    .then((g) => ({ land: landDots(g), centroids: g.centroids }))
    .catch(() => {
      geo = null;
      return null;
    });
  return geo;
}
