/**
 * Transparent, auditable calculations over one Instagram snapshot (ANA-38 brief §6). No opaque scores:
 * every derived number names its formula, comparison population (n) and window. When the data cannot carry a claim the
 * result is INSUFFICIENT_EVIDENCE, never a filler finding.
 */
import type { CanonicalMetric, PostFormat, SocialPost, SocialSnapshot } from "./types";

/** Lifetime metrics keep growing after publishing; younger posts are listed but never compared (age disclosure, AC6). */
export const MATURE_AGE_DAYS = 7;
/** Smallest same-format group whose median is used as a baseline. */
export const MIN_GROUP_N = 5;
/** Larger samples needed before a pattern observation is stated. */
export const MIN_PATTERN_GROUP_N = 8;
export const MIN_THEME_N = 3;

const DAY_MS = 86_400_000;

export function verified(post: SocialPost, metric: CanonicalMetric): number | null {
  const o = post.observations.find((x) => x.metric_name === metric && x.availability_state === "VERIFIED");
  return o ? o.value : null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type RateName = "saves_per_reach" | "shares_per_reach" | "comments_per_reach" | "high_intent_rate";

export const RATE_FORMULA: Readonly<Record<RateName, string>> = {
  saves_per_reach: "saves ÷ reach",
  shares_per_reach: "shares ÷ reach",
  comments_per_reach: "comments ÷ reach",
  high_intent_rate: "(saves + shares) ÷ reach",
};

export interface PostAnalysis {
  post: SocialPost;
  ageDays: number | null;
  mature: boolean;
  reach: number | null;
  /** null when reach is missing or 0 (zero denominator) or an input is not VERIFIED. */
  rates: Readonly<Record<RateName, number | null>>;
  /** post reach ÷ median reach of its same-format group; null outside a usable group. */
  reachIndex: number | null;
  /** post high-intent rate ÷ group median high-intent rate. */
  highIntentIndex: number | null;
  /** why this post is outside the comparison, if it is */
  excluded: "no-insights" | "zero-reach" | "too-young" | "unknown-age" | "small-group" | null;
}

export interface FormatGroup {
  format: PostFormat;
  n: number;
  medianReach: number | null;
  medianHighIntent: number | null;
  /** publish dates of the group members (ISO), oldest and newest */
  window: { from: string; to: string } | null;
}

export interface Analysis {
  observedAt: string;
  posts: PostAnalysis[];
  groups: FormatGroup[];
}

const ratio = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : a / b);

export function analyze(snapshot: SocialSnapshot): Analysis {
  const observed = Date.parse(snapshot.observed_at);
  const base = snapshot.posts.map((post) => {
    const reach = verified(post, "reach");
    const saves = verified(post, "saves");
    const shares = verified(post, "shares");
    const comments = verified(post, "comments");
    const published = post.published_at ? Date.parse(post.published_at) : NaN;
    const ageDays = Number.isNaN(published) ? null : Math.max(0, (observed - published) / DAY_MS);
    const rates = {
      saves_per_reach: ratio(saves, reach),
      shares_per_reach: ratio(shares, reach),
      comments_per_reach: ratio(comments, reach),
      high_intent_rate: saves === null || shares === null ? null : ratio(saves + shares, reach),
    };
    const excluded: PostAnalysis["excluded"] =
      reach === null ? "no-insights" : reach <= 0 ? "zero-reach" : ageDays === null ? "unknown-age" : ageDays < MATURE_AGE_DAYS ? "too-young" : null;
    return { post, ageDays, mature: ageDays !== null && ageDays >= MATURE_AGE_DAYS, reach, rates, excluded };
  });

  const groups: FormatGroup[] = [];
  for (const format of [...new Set(base.map((b) => b.post.format))]) {
    const members = base.filter((b) => b.post.format === format && b.excluded === null);
    const dates = members.map((m) => m.post.published_at!).sort();
    groups.push({
      format,
      n: members.length,
      medianReach: median(members.map((m) => m.reach!)),
      medianHighIntent: median(members.map((m) => m.rates.high_intent_rate).filter((v): v is number => v !== null)),
      window: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    });
  }

  const posts = base.map((b): PostAnalysis => {
    const group = groups.find((g) => g.format === b.post.format);
    if (b.excluded !== null) return { ...b, reachIndex: null, highIntentIndex: null };
    if (!group || group.n < MIN_GROUP_N) return { ...b, reachIndex: null, highIntentIndex: null, excluded: "small-group" };
    return { ...b, reachIndex: ratio(b.reach, group.medianReach), highIntentIndex: ratio(b.rates.high_intent_rate, group.medianHighIntent) };
  });
  return { observedAt: snapshot.observed_at, posts, groups };
}

export interface HeroReading {
  post: PostAnalysis;
  group: FormatGroup;
}

/** Row A hero: the newest mature post that has a same-format baseline. */
export function heroReading(analysis: Analysis): HeroReading | null {
  const candidates = analysis.posts
    .filter((p) => p.reachIndex !== null && p.post.published_at)
    .sort((a, b) => Date.parse(b.post.published_at!) - Date.parse(a.post.published_at!));
  const post = candidates[0];
  if (!post) return null;
  return { post, group: analysis.groups.find((g) => g.format === post.post.format)! };
}

// ---------- pattern observations ----------

export type ThemeId = "travel" | "creator" | "money" | "personal" | "opportunities";
export type ThemeOf = (post: SocialPost) => readonly ThemeId[];

export interface PatternEvidence {
  kind: "hidden-winner" | "practical-value-family" | "reuse-candidate";
  /** theme or post the observation is about */
  subject: { type: "post"; mediaId: string } | { type: "theme"; theme: ThemeId };
  sampleN: number;
  window: { from: string; to: string };
  formula: string;
  comparator: string;
  /** value of the subject relative to the comparator (×) */
  index: number;
  sourcePosts: string[];
  counterexamples: string[];
  limitations: Array<"lifetime-accrual" | "single-snapshot" | "derived-themes" | "no-causality" | "format-only">;
}

export type PatternResult = { state: "OBSERVED"; evidence: PatternEvidence } | { state: "INSUFFICIENT_EVIDENCE"; kind: PatternEvidence["kind"]; reason: InsufficientReason };

export type InsufficientReason = "no-large-group" | "no-candidate" | "few-themes" | "below-threshold";

const compared = (a: Analysis) => a.posts.filter((p) => p.reachIndex !== null && p.highIntentIndex !== null);

function windowOf(posts: readonly PostAnalysis[]): { from: string; to: string } {
  const dates = posts.map((p) => p.post.published_at!).sort();
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

/** Candidate hidden winner: below-median distribution but clearly above-median saves + shares per reached account. */
export function hiddenWinner(analysis: Analysis): PatternResult {
  const pool = compared(analysis);
  const group = analysis.groups.filter((g) => g.n >= MIN_PATTERN_GROUP_N).sort((a, b) => b.n - a.n)[0];
  if (!group) return { state: "INSUFFICIENT_EVIDENCE", kind: "hidden-winner", reason: "no-large-group" };
  const members = pool.filter((p) => p.post.format === group.format);
  const winner = members.filter((p) => p.reachIndex! < 1 && p.highIntentIndex! >= 1.5).sort((a, b) => b.highIntentIndex! - a.highIntentIndex!)[0];
  if (!winner) return { state: "INSUFFICIENT_EVIDENCE", kind: "hidden-winner", reason: "no-candidate" };
  return {
    state: "OBSERVED",
    evidence: {
      kind: "hidden-winner",
      subject: { type: "post", mediaId: winner.post.media_id },
      sampleN: members.length,
      window: windowOf(members),
      formula: `${RATE_FORMULA.high_intent_rate} ÷ median`,
      comparator: `median of ${members.length} mature ${group.format} posts`,
      index: winner.highIntentIndex!,
      sourcePosts: [winner.post.media_id],
      counterexamples: members.filter((p) => p.reachIndex! < 1 && p.highIntentIndex! < 1).slice(0, 3).map((p) => p.post.media_id),
      limitations: ["lifetime-accrual", "single-snapshot", "no-causality"],
    },
  };
}

function byTheme(analysis: Analysis, themeOf: ThemeOf) {
  const pool = compared(analysis);
  const map = new Map<ThemeId, PostAnalysis[]>();
  for (const p of pool) for (const t of themeOf(p.post)) map.set(t, [...(map.get(t) ?? []), p]);
  return { pool, map };
}

/** Candidate practical-value content family: the theme with the highest median saves per reached account. */
export function practicalValueFamily(analysis: Analysis, themeOf: ThemeOf): PatternResult {
  const { pool, map } = byTheme(analysis, themeOf);
  const overall = median(pool.map((p) => p.rates.saves_per_reach).filter((v): v is number => v !== null));
  const themes = [...map.entries()]
    .filter(([, ps]) => ps.length >= MIN_THEME_N)
    .map(([theme, ps]) => ({ theme, ps, med: median(ps.map((p) => p.rates.saves_per_reach!).filter((v) => v !== null)) }));
  if (themes.length < 2 || overall === null || overall <= 0) return { state: "INSUFFICIENT_EVIDENCE", kind: "practical-value-family", reason: "few-themes" };
  const best = themes.sort((a, b) => (b.med ?? 0) - (a.med ?? 0))[0]!;
  const index = (best.med ?? 0) / overall;
  if (index < 1.25) return { state: "INSUFFICIENT_EVIDENCE", kind: "practical-value-family", reason: "below-threshold" };
  return {
    state: "OBSERVED",
    evidence: {
      kind: "practical-value-family",
      subject: { type: "theme", theme: best.theme },
      sampleN: best.ps.length,
      window: windowOf(best.ps),
      formula: `median(${RATE_FORMULA.saves_per_reach}) of theme ÷ median of all compared posts`,
      comparator: `median of ${pool.length} compared posts (all formats with a baseline)`,
      index,
      sourcePosts: best.ps.map((p) => p.post.media_id),
      counterexamples: best.ps.filter((p) => (p.rates.saves_per_reach ?? 0) < overall).map((p) => p.post.media_id),
      limitations: ["derived-themes", "lifetime-accrual", "single-snapshot", "no-causality"],
    },
  };
}

/** Candidate content group worth reusing or testing: the theme with the highest median reach index. */
export function reuseCandidate(analysis: Analysis, themeOf: ThemeOf): PatternResult {
  const { map } = byTheme(analysis, themeOf);
  const themes = [...map.entries()]
    .filter(([, ps]) => ps.length >= MIN_THEME_N)
    .map(([theme, ps]) => ({ theme, ps, med: median(ps.map((p) => p.reachIndex!)) ?? 0 }))
    .sort((a, b) => b.med - a.med);
  const best = themes[0];
  if (!best) return { state: "INSUFFICIENT_EVIDENCE", kind: "reuse-candidate", reason: "few-themes" };
  if (best.med < 1.2) return { state: "INSUFFICIENT_EVIDENCE", kind: "reuse-candidate", reason: "below-threshold" };
  return {
    state: "OBSERVED",
    evidence: {
      kind: "reuse-candidate",
      subject: { type: "theme", theme: best.theme },
      sampleN: best.ps.length,
      window: windowOf(best.ps),
      formula: "median(post reach ÷ same-format median reach) of theme",
      comparator: "1.00× = the same-format median",
      index: best.med,
      sourcePosts: best.ps.map((p) => p.post.media_id),
      counterexamples: best.ps.filter((p) => p.reachIndex! < 1).map((p) => p.post.media_id),
      limitations: ["derived-themes", "lifetime-accrual", "single-snapshot", "no-causality"],
    },
  };
}

export function patternObservations(analysis: Analysis, themeOf: ThemeOf): PatternResult[] {
  return [hiddenWinner(analysis), practicalValueFamily(analysis, themeOf), reuseCandidate(analysis, themeOf)];
}
