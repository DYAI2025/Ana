/**
 * Transparent, auditable calculations over one Instagram snapshot (ANA-38 brief §6). No opaque scores:
 * every derived number names its formula, comparison population (n) and window. When the data cannot carry a claim the
 * result is INSUFFICIENT_EVIDENCE, never a filler finding. All indices compare a post with posts of its own format.
 */
import type { CanonicalMetric, PostFormat, SocialPost, SocialSnapshot } from "./types";

/**
 * Lifetime metrics keep growing after publishing; younger posts are listed but never compared (age disclosure, AC6).
 * This is a minimum-maturity filter, not age matching: an 8-day-old and a 200-day-old post are still compared.
 */
export const MATURE_AGE_DAYS = 7;
/** Smallest same-format population whose median is used as a baseline — per metric. */
export const MIN_GROUP_N = 5;
/** Larger samples needed before a pattern observation or the descriptive H1-only/H4-only comparison is stated. */
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

/**
 * content_action_rate = (saves + shares) ÷ reach: action counts per reached account. Not a share of unique people, not a
 * probability and not purchase intent; one account can save and share, so the ratio can exceed 1.
 */
export type RateName = "saves_per_reach" | "shares_per_reach" | "comments_per_reach" | "content_action_rate";
/** Instagram fields each rate is computed from (inspector provenance). */
export const RATE_INPUTS: Readonly<Record<RateName, string>> = {
  saves_per_reach: "saved, reach",
  shares_per_reach: "shares, reach",
  comments_per_reach: "comments, reach",
  content_action_rate: "saved, shares, reach",
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
  /** post content-action rate ÷ group median content-action rate (needs MIN_GROUP_N posts with that rate). */
  contentActionIndex: number | null;
  /** post saves per reach ÷ group median saves per reach. */
  savesIndex: number | null;
  /** post shares per reach ÷ group median shares per reach. */
  sharesIndex: number | null;
  /** why this post is outside the comparison, if it is */
  excluded: "no-insights" | "zero-reach" | "too-young" | "unknown-age" | "unknown-format" | "small-group" | null;
}

export interface FormatGroup {
  format: PostFormat;
  /** mature posts of this format with verified reach > 0 */
  n: number;
  medianReach: number | null;
  /** posts that also have verified saves and shares (the population of the content-action median) */
  nContentAction: number;
  medianContentAction: number | null;
  nSaves: number;
  medianSaves: number | null;
  nShares: number;
  medianShares: number | null;
  /** publish dates of the group members (ISO), oldest and newest */
  window: { from: string; to: string } | null;
}

export interface Analysis {
  observedAt: string;
  posts: PostAnalysis[];
  groups: FormatGroup[];
}

const ratio = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : a / b);
const present = (xs: Array<number | null>) => xs.filter((v): v is number => v !== null);

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
      content_action_rate: saves === null || shares === null ? null : ratio(saves + shares, reach),
    };
    const excluded: PostAnalysis["excluded"] =
      reach === null
        ? "no-insights"
        : reach <= 0
          ? "zero-reach"
          : post.format === "unknown"
            ? "unknown-format"
            : ageDays === null
              ? "unknown-age"
              : ageDays < MATURE_AGE_DAYS
                ? "too-young"
                : null;
    return { post, ageDays, mature: ageDays !== null && ageDays >= MATURE_AGE_DAYS, reach, rates, excluded };
  });

  const groups: FormatGroup[] = [];
  for (const format of [...new Set(base.map((b) => b.post.format))].filter((f) => f !== "unknown")) {
    const members = base.filter((b) => b.post.format === format && b.excluded === null);
    const hi = present(members.map((m) => m.rates.content_action_rate));
    const sv = present(members.map((m) => m.rates.saves_per_reach));
    const sh = present(members.map((m) => m.rates.shares_per_reach));
    const dates = members.map((m) => m.post.published_at!).sort();
    groups.push({
      format,
      n: members.length,
      medianReach: median(members.map((m) => m.reach!)),
      nContentAction: hi.length,
      medianContentAction: median(hi),
      nSaves: sv.length,
      medianSaves: median(sv),
      nShares: sh.length,
      medianShares: median(sh),
      window: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    });
  }

  const posts = base.map((b): PostAnalysis => {
    const none = { reachIndex: null, contentActionIndex: null, savesIndex: null, sharesIndex: null };
    const group = groups.find((g) => g.format === b.post.format);
    if (b.excluded !== null) return { ...b, ...none };
    if (!group || group.n < MIN_GROUP_N) return { ...b, ...none, excluded: "small-group" };
    const gated = (n: number, value: number | null, med: number | null) => (n >= MIN_GROUP_N ? ratio(value, med) : null);
    return {
      ...b,
      reachIndex: ratio(b.reach, group.medianReach),
      contentActionIndex: gated(group.nContentAction, b.rates.content_action_rate, group.medianContentAction),
      savesIndex: gated(group.nSaves, b.rates.saves_per_reach, group.medianSaves),
      sharesIndex: gated(group.nShares, b.rates.shares_per_reach, group.medianShares),
    };
  });
  return { observedAt: snapshot.observed_at, posts, groups };
}

/** Formats the content map can plot: a baseline population on both axes (reach and content-action). */
export function mapGroups(analysis: Analysis): FormatGroup[] {
  return analysis.groups.filter((g) => g.n >= MIN_GROUP_N && g.nContentAction >= MIN_GROUP_N).sort((a, b) => b.nContentAction - a.nContentAction);
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

/** Formula identifiers; the UI renders them in the active language. */
export type FormulaId = "content-action-index" | "theme-saves-index" | "theme-reach-index";
export type Comparator = { kind: "format-median"; n: number; format: PostFormat } | { kind: "within-format-medians"; n: number };

export interface PatternEvidence {
  kind: "hidden-winner" | "practical-value-family" | "reuse-candidate";
  /** theme or post the observation is about */
  subject: { type: "post"; mediaId: string } | { type: "theme"; theme: ThemeId };
  sampleN: number;
  window: { from: string; to: string };
  formula: FormulaId;
  comparator: Comparator;
  /** value of the subject relative to the comparator (×) */
  index: number;
  sourcePosts: string[];
  counterexamples: string[];
  limitations: Array<"lifetime-accrual" | "single-snapshot" | "derived-themes" | "no-causality" | "format-only">;
}

export type InsufficientReason = "no-large-group" | "no-candidate" | "few-themes" | "below-threshold";
export type PatternResult = { state: "OBSERVED"; evidence: PatternEvidence } | { state: "INSUFFICIENT_EVIDENCE"; kind: PatternEvidence["kind"]; reason: InsufficientReason };

function windowOf(posts: readonly PostAnalysis[]): { from: string; to: string } {
  const dates = posts.map((p) => p.post.published_at!).sort();
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

/** Candidate hidden winner: below-median distribution but clearly above-median saves + shares per reached account. */
export function hiddenWinner(analysis: Analysis): PatternResult {
  // the population is the posts actually compared on both axes, not every post with reach
  const byFormat = analysis.groups
    .map((g) => ({ g, members: analysis.posts.filter((p) => p.post.format === g.format && p.reachIndex !== null && p.contentActionIndex !== null) }))
    .filter((x) => x.members.length >= MIN_PATTERN_GROUP_N)
    .sort((a, b) => b.members.length - a.members.length)[0];
  if (!byFormat) return { state: "INSUFFICIENT_EVIDENCE", kind: "hidden-winner", reason: "no-large-group" };
  const { g, members } = byFormat;
  const winner = members.filter((p) => p.reachIndex! < 1 && p.contentActionIndex! >= 1.5).sort((a, b) => b.contentActionIndex! - a.contentActionIndex!)[0];
  if (!winner) return { state: "INSUFFICIENT_EVIDENCE", kind: "hidden-winner", reason: "no-candidate" };
  return {
    state: "OBSERVED",
    evidence: {
      kind: "hidden-winner",
      subject: { type: "post", mediaId: winner.post.media_id },
      sampleN: members.length,
      window: windowOf(members),
      formula: "content-action-index",
      comparator: { kind: "format-median", n: g.nContentAction, format: g.format },
      index: winner.contentActionIndex!,
      sourcePosts: [winner.post.media_id],
      counterexamples: members.filter((p) => p.reachIndex! < 1 && p.contentActionIndex! < 1).slice(0, 3).map((p) => p.post.media_id),
      limitations: ["lifetime-accrual", "single-snapshot", "no-causality"],
    },
  };
}

function byTheme(analysis: Analysis, themeOf: ThemeOf, has: (p: PostAnalysis) => boolean) {
  const map = new Map<ThemeId, PostAnalysis[]>();
  for (const p of analysis.posts.filter(has)) for (const t of themeOf(p.post)) map.set(t, [...(map.get(t) ?? []), p]);
  return map;
}

/**
 * Candidate practical-value content family: the theme whose posts save best relative to their own format
 * (median of post saves-per-reach ÷ same-format median), so the format mix of a theme cannot create the effect.
 */
export function practicalValueFamily(analysis: Analysis, themeOf: ThemeOf): PatternResult {
  const map = byTheme(analysis, themeOf, (p) => p.savesIndex !== null);
  const themes = [...map.entries()].filter(([, ps]) => ps.length >= MIN_THEME_N).map(([theme, ps]) => ({ theme, ps, med: median(ps.map((p) => p.savesIndex!))! }));
  if (themes.length < 2) return { state: "INSUFFICIENT_EVIDENCE", kind: "practical-value-family", reason: "few-themes" };
  const best = themes.sort((a, b) => b.med - a.med)[0]!;
  if (best.med < 1.25) return { state: "INSUFFICIENT_EVIDENCE", kind: "practical-value-family", reason: "below-threshold" };
  return {
    state: "OBSERVED",
    evidence: {
      kind: "practical-value-family",
      subject: { type: "theme", theme: best.theme },
      sampleN: best.ps.length,
      window: windowOf(best.ps),
      formula: "theme-saves-index",
      comparator: { kind: "within-format-medians", n: best.ps.length },
      index: best.med,
      sourcePosts: best.ps.map((p) => p.post.media_id),
      counterexamples: best.ps.filter((p) => p.savesIndex! < 1).map((p) => p.post.media_id),
      limitations: ["derived-themes", "lifetime-accrual", "single-snapshot", "no-causality"],
    },
  };
}

/** Candidate content group worth reusing or testing: the theme with the highest median reach index. */
export function reuseCandidate(analysis: Analysis, themeOf: ThemeOf): PatternResult {
  const map = byTheme(analysis, themeOf, (p) => p.reachIndex !== null);
  const themes = [...map.entries()]
    .filter(([, ps]) => ps.length >= MIN_THEME_N)
    .map(([theme, ps]) => ({ theme, ps, med: median(ps.map((p) => p.reachIndex!))! }))
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
      formula: "theme-reach-index",
      comparator: { kind: "within-format-medians", n: best.ps.length },
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
