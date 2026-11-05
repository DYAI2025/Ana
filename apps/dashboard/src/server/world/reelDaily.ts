import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SocialPost } from "@/features/social/types";
import type { WorldReelViewing } from "@/features/world/types";
import { berlinDay, historyFile } from "./audienceHistory";

/**
 * How long people watch Ana's Reels and how many skip in the first 3 s (ANA-52): the median over the Reels of the
 * snapshot that carry a measured value, and one stored value per Berlin day (the latest read of that day), so the
 * office tiles can say whether it rose or fell since the day before. Only these two numbers and a count are kept.
 * The median moves with the Reels in the snapshot and with their growing lifetime values; the UI says so.
 */
export interface ReelDay {
  day: string;
  watch_ms: number | null;
  skip_pct: number | null;
  reels: number;
  at: string;
}

export const REEL_DAYS_MAX = 30;
const FILE = "world-reel-daily.json";

/** next to the audience history, in the unit's StateDirectory */
export function reelDailyFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return path.join(path.dirname(historyFile(env)), FILE);
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const measured = (p: SocialPost, metric: "avg_watch_time" | "skip_rate"): number | null => {
  const o = p.observations.find((x) => x.metric_name === metric && x.availability_state === "VERIFIED");
  return o && typeof o.value === "number" && Number.isFinite(o.value) ? o.value : null;
};

export function reelMedians(posts: readonly SocialPost[]): { reels: number; skip_reels: number; watch_ms: number | null; skip_pct: number | null } {
  const reels = posts.filter((p) => p.format === "reel");
  const watch = reels.map((p) => measured(p, "avg_watch_time")).filter((v): v is number => v !== null);
  const skip = reels.map((p) => measured(p, "skip_rate")).filter((v): v is number => v !== null);
  return { reels: watch.length, skip_reels: skip.length, watch_ms: median(watch), skip_pct: median(skip) };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
function isDay(v: unknown): v is ReelDay {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.day) && (num(o.watch_ms) !== null || num(o.skip_pct) !== null) && (o.watch_ms === null || num(o.watch_ms) !== null) && (o.skip_pct === null || num(o.skip_pct) !== null);
}

async function readDays(file: string): Promise<ReelDay[]> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(raw) ? raw.filter(isDay) : [];
  } catch {
    // missing or broken: the comparison starts over, the tiles still show today's value
    return [];
  }
}

/** The snapshot to read: `fresh` is false for a stale fallback snapshot (shown, never stored as a new day's value). */
export interface ReelInput {
  posts: readonly SocialPost[];
  observedAt: string;
  fresh: boolean;
}

export interface ReelDaily {
  update: (input: ReelInput | null) => Promise<WorldReelViewing>;
}

export function createReelDaily({
  file = reelDailyFile(),
  now = Date.now,
  onWrite,
  mkdir = true,
}: { file?: string; now?: () => number; onWrite?: () => void; mkdir?: boolean } = {}): ReelDaily {
  let days: ReelDay[] | null = null;
  let storeError = false;
  async function write(all: ReelDay[]) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      if (mkdir) await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(all), { mode: 0o600 });
      await fs.rename(tmp, file);
      storeError = false;
      onWrite?.();
    } catch {
      // the comparison is a convenience: a full disk never breaks the world
      storeError = true;
      await fs.unlink(tmp).catch(() => undefined);
    }
  }
  async function run(input: ReelInput | null): Promise<WorldReelViewing> {
    if (days === null) days = await readDays(file);
    const today = berlinDay(now());
    const m = input ? reelMedians(input.posts) : { reels: 0, skip_reels: 0, watch_ms: null, skip_pct: null };
    // the day the snapshot was measured, not the day it was read (a snapshot cached before midnight stays yesterday's)
    const observed = input ? Date.parse(input.observedAt) : Number.NaN;
    const day = Number.isNaN(observed) ? today : berlinDay(observed);
    if (input?.fresh && (m.watch_ms !== null || m.skip_pct !== null)) {
      const stored = days.find((d) => d.day === day);
      if (day <= today && (!stored || stored.watch_ms !== m.watch_ms || stored.skip_pct !== m.skip_pct)) {
        days = [...days.filter((d) => d.day !== day), { day, reels: m.reels, watch_ms: m.watch_ms, skip_pct: m.skip_pct, at: new Date(now()).toISOString() }].sort((a, b) => a.day.localeCompare(b.day)).slice(-REEL_DAYS_MAX);
        await write(days);
      }
    }
    // the values shown are compared with the latest stored day before the day they were measured
    const before = [...days].filter((d) => d.day < day).sort((a, b) => b.day.localeCompare(a.day))[0] ?? null;
    return {
      state: "on",
      reels: m.reels,
      skip_reels: m.skip_reels,
      watch_ms: m.watch_ms,
      skip_pct: m.skip_pct,
      previous: before ? { day: before.day, watch_ms: before.watch_ms, skip_pct: before.skip_pct } : null,
      store_error: storeError,
    };
  }
  // one update at a time: parallel /api/world reads must not write the file out of order
  let queue: Promise<unknown> = Promise.resolve();
  return {
    update(input) {
      const next = queue.then(() => run(input));
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
