import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AudienceSeries } from "@/features/world/types";
import os from "node:os";

/**
 * One aggregated audience snapshot per Berlin day: who engaged in the last 7 days (countries, age, gender) next to the
 * posts published in those 7 days (id, format, time; never captions). Over weeks this lets the team compare which kind
 * of post went with which shift of the audience. Correlation only: Meta says nothing about which post a given person
 * engaged with. Nothing about individual people is stored, and losing the file only loses the comparison history.
 */
export interface HistoryEntry {
  /** Berlin calendar day, YYYY-MM-DD */
  day: string;
  fetched_at: string;
  week: { country: Pair[]; age: Pair[]; gender: Pair[] };
  posts: Array<{ id: string; format: string; published_at: string }>;
}
type Pair = [string, number];

export const HISTORY_MAX_DAYS = 400;
const POST_MAX = 60;

const FILE = "world-audience-history.json";
const first = (v: string | undefined) => v?.split(":")[0] || undefined;

/**
 * Kept data, so on the VPS it lives in the unit's StateDirectory (systemd sets STATE_DIRECTORY), not in the
 * CacheDirectory that `systemctl clean` may empty. WORLD_STATE_DIR overrides it (e2e); before the unit had a
 * StateDirectory the file lived in the cache, and a missing state file is seeded from there once (legacyHistoryFile).
 */
export function historyFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return path.join(env.WORLD_STATE_DIR || first(env.STATE_DIRECTORY) || first(env.CACHE_DIRECTORY) || os.tmpdir(), FILE);
}

/** where the history lived before the StateDirectory, if that is a different file */
export function legacyHistoryFile(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const cache = first(env.CACHE_DIRECTORY);
  if (env.WORLD_STATE_DIR || !env.STATE_DIRECTORY || !cache) return null;
  const legacy = path.join(cache, FILE);
  return legacy === historyFile(env) ? null : legacy;
}

export function berlinDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

const pairs = (s: AudienceSeries, max: number): Pair[] => (s.state === "ok" ? s.results.slice(0, max).map((r) => [r.key, r.value]) : []);

/** The entry for one read, or null when the last 7 days are not known (nothing worth comparing). */
export function historyEntry(
  nowMs: number,
  fetchedAt: string,
  week: { country: AudienceSeries; age: AudienceSeries; gender: AudienceSeries },
  posts: ReadonlyArray<{ id: string; format: string; published_at: string | null }>,
): HistoryEntry | null {
  if (week.country.state !== "ok" && week.age.state !== "ok" && week.gender.state !== "ok") return null;
  const since = nowMs - 7 * 86_400_000;
  return {
    day: berlinDay(nowMs),
    fetched_at: fetchedAt,
    week: { country: pairs(week.country, 20), age: pairs(week.age, 10), gender: pairs(week.gender, 3) },
    posts: posts
      .filter((p): p is { id: string; format: string; published_at: string } => p.published_at !== null && Date.parse(p.published_at) >= since && Date.parse(p.published_at) <= nowMs)
      .slice(0, POST_MAX)
      .map((p) => ({ id: p.id.slice(0, 40), format: p.format.slice(0, 20), published_at: p.published_at })),
  };
}

function isEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.day) && typeof o.fetched_at === "string" && typeof o.week === "object" && o.week !== null && Array.isArray(o.posts);
}

async function readFile(file: string): Promise<HistoryEntry[] | null> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === "ENOENT" ? null : [];
  }
}

/** The stored days; a missing file falls back to the legacy location (read only, the next record writes the new one). */
export async function readHistory(file: string = historyFile(), legacy: string | null = file === historyFile() ? legacyHistoryFile() : null): Promise<HistoryEntry[]> {
  const own = await readFile(file);
  if (own !== null) return own;
  return legacy ? ((await readFile(legacy)) ?? []) : [];
}

/** Keeps one entry per day (the latest read of that day wins) and at most HISTORY_MAX_DAYS days. */
export async function recordHistory(entry: HistoryEntry, file: string = historyFile(), legacy: string | null = file === historyFile() ? legacyHistoryFile() : null): Promise<HistoryEntry[]> {
  // the first write to the StateDirectory carries over what the cache held
  const all = (await readHistory(file, legacy)).filter((e) => e.day !== entry.day);
  all.push(entry);
  all.sort((a, b) => a.day.localeCompare(b.day));
  const kept = all.slice(-HISTORY_MAX_DAYS);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(kept), { mode: 0o600 });
  await fs.rename(tmp, file);
  return kept;
}
