/**
 * Trial lab: what Ana's trial Reels say about people outside her community. Trial Reels (Meta's is_shared_to_feed
 * false) are shown to non-followers only, so their numbers are compared with other trials, never with feed Reels.
 *
 * Two readings, both pure and computed in the browser from the world payload (captions are only matched here, never
 * stored or sent anywhere):
 * - pairs: Ana often posts the same video as a trial and, minutes later, as a feed Reel with the same caption. A pair
 *   shows directly how strangers and the community took the same video.
 * - categories: for each theme, caption opening, kind of shot and mood, how a value does among trials (against the
 *   trial median) next to how it does among feed Reels (against the feed median). A value that does clearly better
 *   with strangers than with the community is a hint, not a cause: Meta does not say why a post did well.
 */
import { median, type WorldPost } from "./model";
import { TAG_MIN_CONFIDENCE, type PostTags } from "./postTags";

/** a Reel's numbers count here once it is this old (Instagram keeps testing a trial for a few days) */
export const LAB_MIN_AGE_DAYS = 3;
/** a feed Reel pairs with a trial posted at most this long before it (Ana's pairs: 2 to 31 minutes, checked 2026-11-06) */
export const PAIR_WINDOW_MS = 24 * 3_600_000;
/** a category value is compared only with at least this many measured Reels on each side */
export const LAB_MIN_N = 3;
/**
 * a value counts as doing better with strangers (or in the community) only when the two indexes differ by at least
 * this much (0.15 = 15 % of the usual engagement); smaller gaps on a few Reels are noise, not a finding
 */
export const LAB_MIN_DIFF = 0.15;
/** the caption start that has to match for a pair */
const KEY_CHARS = 24;
const MIN_KEY_CHARS = 6;
const DAY_MS = 86_400_000;

/** first characters of a caption, case, accents, emoji and punctuation removed; null when too short to match on */
export function captionKey(caption: string | null): string | null {
  if (!caption) return null;
  const k = caption
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, KEY_CHARS);
  return k.length >= MIN_KEY_CHARS ? k : null;
}

export interface ReelPair {
  trial: WorldPost;
  feed: WorldPost;
  /** minutes the trial went out before the feed Reel */
  leadMinutes: number;
  /** both at least LAB_MIN_AGE_DAYS old: their numbers can be compared */
  settled: boolean;
  /** feed reach ÷ trial reach; null when either is unknown */
  reachX: number | null;
  /** trial engagement ÷ feed engagement (how strangers took it compared with the community); null when unknown */
  erShare: number | null;
}

const at = (p: WorldPost) => (p.published_at ? Date.parse(p.published_at) : Number.NaN);
const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);

/** Trial and feed version of the same video: same caption start, trial first, at most PAIR_WINDOW_MS apart. Newest first. */
export function reelPairs(posts: readonly WorldPost[], nowMs: number): ReelPair[] {
  const keyed = (trial: boolean) =>
    posts
      .filter((p) => p.format === "reel" && p.trial === trial && !Number.isNaN(at(p)))
      .map((p) => ({ p, key: captionKey(p.caption) }))
      .filter((x): x is { p: WorldPost; key: string } => x.key !== null);
  const trials = keyed(true);
  const feeds = keyed(false);
  // every possible match, closest in time first; each Reel is used once
  const candidates = trials
    .flatMap((t) => feeds.filter((f) => f.key === t.key && at(f.p) >= at(t.p) && at(f.p) - at(t.p) <= PAIR_WINDOW_MS).map((f) => ({ t: t.p, f: f.p, gap: at(f.p) - at(t.p) })))
    .sort((x, y) => x.gap - y.gap);
  const used = new Set<string>();
  const pairs: ReelPair[] = [];
  for (const c of candidates) {
    if (used.has(c.t.id) || used.has(c.f.id)) continue;
    used.add(c.t.id);
    used.add(c.f.id);
    const settled = nowMs - at(c.t) >= LAB_MIN_AGE_DAYS * DAY_MS && nowMs - at(c.f) >= LAB_MIN_AGE_DAYS * DAY_MS;
    pairs.push({ trial: c.t, feed: c.f, leadMinutes: Math.round(c.gap / 60_000), settled, reachX: ratio(c.f.reach, c.t.reach), erShare: ratio(c.t.er, c.f.er) });
  }
  return pairs.sort((x, y) => at(y.feed) - at(x.feed));
}

/**
 * What a pair can show: "young" while either Reel is under LAB_MIN_AGE_DAYS old; "missing" when both are old enough
 * but Instagram returned no reach or engagement for one of them (the worker reads insights for part of the posts per
 * call); "ready" otherwise.
 */
export function pairState(p: ReelPair): "young" | "missing" | "ready" {
  if (!p.settled) return "young";
  return p.erShare === null ? "missing" : "ready";
}

/** what the settled pairs say together: medians over pairs with both numbers */
export function pairSummary(pairs: readonly ReelPair[]): { n: number; reachX: number | null; erShare: number | null } {
  const settled = pairs.filter((p) => p.settled);
  const pick = (f: (p: ReelPair) => number | null) => {
    const v = settled.map(f).filter((x): x is number => x !== null);
    return v.length ? median(v) : null;
  };
  return { n: settled.length, reachX: pick((p) => p.reachX), erShare: pick((p) => p.erShare) };
}

export const LAB_FIELDS = ["theme", "hook", "shot", "mood"] as const;
export type LabField = (typeof LAB_FIELDS)[number];

export interface StrangerRow {
  field: LabField;
  value: string;
  /** median of (engagement ÷ the kind's median engagement): 1 = typical for that kind */
  trial: { n: number; index: number };
  feed: { n: number; index: number };
  /** trial index − feed index: above 0 = does better with strangers than with the community */
  diff: number;
}

/**
 * Category values compared between trials and feed Reels, each against its own kind's median engagement, so the lower
 * trial level does not count against a value. Only values with LAB_MIN_N measured Reels on both sides; largest
 * difference first.
 */
export function strangerSignals(posts: readonly WorldPost[], tags: Readonly<Record<string, PostTags>>, nowMs: number): StrangerRow[] {
  const measured = posts.filter((p) => p.format === "reel" && typeof p.trial === "boolean" && p.er !== null && nowMs - at(p) >= LAB_MIN_AGE_DAYS * DAY_MS);
  const base = (trial: boolean) => {
    const ers = measured.filter((p) => p.trial === trial).map((p) => p.er as number);
    return ers.length >= LAB_MIN_N ? median(ers) : null;
  };
  const baseTrial = base(true);
  const baseFeed = base(false);
  if (!baseTrial || !baseFeed) return [];
  const rows: StrangerRow[] = [];
  for (const field of LAB_FIELDS) {
    const byValue = new Map<string, { trial: number[]; feed: number[] }>();
    for (const p of measured) {
      const t = tags[p.id];
      if (!t || t.confidence < TAG_MIN_CONFIDENCE) continue;
      const g = byValue.get(t[field]) ?? { trial: [], feed: [] };
      (p.trial ? g.trial : g.feed).push((p.er as number) / (p.trial ? baseTrial : baseFeed));
      byValue.set(t[field], g);
    }
    for (const [value, g] of byValue) {
      if (g.trial.length < LAB_MIN_N || g.feed.length < LAB_MIN_N) continue;
      const trial = { n: g.trial.length, index: median(g.trial) as number };
      const feed = { n: g.feed.length, index: median(g.feed) as number };
      rows.push({ field, value, trial, feed, diff: trial.index - feed.index });
    }
  }
  return rows.sort((x, y) => y.diff - x.diff);
}

/** the clear cases only: at most `max` values each way, largest gap first */
export function clearSignals(rows: readonly StrangerRow[], max = 3): { better: StrangerRow[]; worse: StrangerRow[] } {
  return {
    better: rows.filter((r) => r.diff >= LAB_MIN_DIFF).slice(0, max),
    worse: rows.filter((r) => r.diff <= -LAB_MIN_DIFF).slice(-max).reverse(),
  };
}
