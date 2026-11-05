import "server-only";
import type { WorldPlace, WorldRelease } from "@/features/world/types";

/**
 * Ana's current region, set by the operator on the server (`WORLD_ANA_PLACE=label;lat;lon[;time zone]`, e.g.
 * "Region;-1.29;36.82;Africa/Nairobi"; a two-letter country code as the label, e.g. "TH", is shown as the country name
 * in each dashboard language). Region level only, never committed to Git. Anything malformed means
 * "unknown"; an unknown time zone is dropped (local time is then estimated from the longitude).
 */
export function readAnaPlace(env: Readonly<Record<string, string | undefined>> = process.env): WorldPlace | null {
  const raw = env.WORLD_ANA_PLACE?.trim();
  if (!raw) return null;
  const parts = raw.split(";").map((p) => p.trim());
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [label = "", latRaw = "", lonRaw = "", tzRaw = ""] = parts;
  if (!label || label.length > 40 || !/^[\p{L}\p{N} .,'()-]+$/u.test(label)) return null;
  if (!/^-?\d{1,3}(\.\d{1,4})?$/.test(latRaw) || !/^-?\d{1,3}(\.\d{1,4})?$/.test(lonRaw)) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { label, lat, lon, tz: validTimeZone(tzRaw) };
}

export function validTimeZone(raw: string): string | null {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(raw)) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

/** The running release: `/srv/dyai/runtime/ana-dashboard/releases/<sha>` is the working directory of a real release. */
export function readRelease(cwd: string = process.cwd(), uptimeSeconds: number = process.uptime(), now: number = Date.now()): WorldRelease {
  const match = /\/releases\/([0-9a-f]{40})(\/|$)/.exec(cwd);
  return { sha: match?.[1] ?? null, started_at: new Date(now - uptimeSeconds * 1000).toISOString() };
}
