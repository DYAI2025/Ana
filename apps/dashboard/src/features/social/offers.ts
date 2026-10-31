/**
 * Substack offer hypotheses (ANA-38 brief §7) under the F1.I1 evidence contract (Jira ANA-39, Confluence 108920834).
 *
 * H1 and H4 are product hypotheses, not demand. Each one is read through four independent evidence lanes; there is no
 * blended score and no status spanning lanes:
 * - CONTENT_RESONANCE: verified (saves + shares) ÷ reach of topically eligible posts against their own format's median.
 *   Descriptive engagement only — never need, purchase intent or rejection of a product. Low resonance posts are shown
 *   as comparators, not as counterevidence.
 * - TOPICAL_FIT: which posts are about the hypothesis' specific subject matter (themes.ts), with provenance.
 * - AUDIENCE_NEED: NOT_CONNECTED in F1.I1 (no permissioned comment or request source).
 * - COMMERCIAL_OUTCOME: NOT_CONNECTED in F1.I1 (no signup, click or sales source).
 * Nothing here selects a product. The analyst can choose the next evidence to collect, or abstain.
 */
import { median, MIN_GROUP_N, MIN_PATTERN_GROUP_N, MIN_THEME_N, type Analysis, type PostAnalysis, type ThemeId, type ThemeOf } from "./insights";
import type { CandidateHypothesis, TopicalFit } from "./themes";
import type { PostFormat, SocialPost } from "./types";

export type HypothesisId = "H1" | "H2" | "H3" | "H4";

export interface Hypothesis {
  id: HypothesisId;
  status: "candidate" | "parked";
}

export const HYPOTHESES: readonly Hypothesis[] = [
  // Opportunity Drop / Creator Shortlist: curated creator, UGC and remote work opportunities
  { id: "H1", status: "candidate" },
  // Money Teardown — parked
  { id: "H2", status: "parked" },
  // Pitch Room — parked
  { id: "H3", status: "parked" },
  // Working File: reusable creator/business files, templates, checklists and workflows from Ana's own work
  { id: "H4", status: "candidate" },
];

export const LANES = ["CONTENT_RESONANCE", "TOPICAL_FIT", "AUDIENCE_NEED", "COMMERCIAL_OUTCOME"] as const;
export type LaneId = (typeof LANES)[number];

/** Expressed-need sources this slice cannot see (no comment ingestion or request source is connected). */
export const AUDIENCE_SIGNALS = ["comment-questions", "direct-requests"] as const;
/** Downstream commercial signals this slice cannot see (no Substack, link or sales source connected). */
export const COMMERCIAL_SIGNALS = ["substack-registrations", "paid-subscribers", "link-clicks", "sales"] as const;

export type TopicalFitOf = (post: SocialPost, hypothesis: CandidateHypothesis) => TopicalFit;

export interface ThemeSignal {
  theme: ThemeId;
  n: number;
  state: "OBSERVED" | "INSUFFICIENT_EVIDENCE";
  medianSavesIndex: number | null;
  medianSharesIndex: number | null;
  medianContentActionIndex: number | null;
}

const nums = (xs: Array<number | null>) => xs.filter((v): v is number => v !== null);

/** Descriptive per-theme engagement (browsing aid). Themes never qualify a hypothesis. */
export function themeSignals(analysis: Analysis, themeOf: ThemeOf): ThemeSignal[] {
  const pool = analysis.posts.filter((p) => p.contentActionIndex !== null);
  return (["travel", "creator", "money", "personal", "opportunities"] as const).map((theme) => {
    const ps = pool.filter((p) => themeOf(p.post).includes(theme));
    const enough = ps.length >= MIN_THEME_N;
    return {
      theme,
      n: ps.length,
      state: enough ? "OBSERVED" : "INSUFFICIENT_EVIDENCE",
      medianSavesIndex: enough ? median(nums(ps.map((p) => p.savesIndex))) : null,
      medianSharesIndex: enough ? median(nums(ps.map((p) => p.sharesIndex))) : null,
      medianContentActionIndex: enough ? median(nums(ps.map((p) => p.contentActionIndex))) : null,
    };
  });
}

export interface EligiblePost {
  p: PostAnalysis;
  fit: TopicalFit;
  /** also topically eligible for the other candidate: one post, never two independent pieces of evidence */
  overlap: boolean;
}

export interface TopicalLane {
  /** DERIVED if any eligible post rests on a caption rule; MANUAL_SESSION if all rest on session corrections */
  state: "DERIVED" | "MANUAL_SESSION" | "UNCLASSIFIED";
  eligible: EligiblePost[];
  nDerived: number;
  nManual: number;
  /** posts whose caption rule matched but that an analyst excluded in this session */
  sessionExcluded: EligiblePost[];
  nOverlap: number;
  /** F1.I1 has no persistent, independent review; the UI says so instead of implying one */
  durableReview: "NOT_AVAILABLE";
}

export type UnindexedReason = NonNullable<PostAnalysis["excluded"]> | "missing-saves-shares" | "zero-baseline";
export type ResonanceLimitation = "lifetime-accrual" | "single-snapshot" | "maturity-not-age-matched" | "unequal-ages" | "format-skew" | "stale-snapshot" | "overlap" | "no-causality";

export interface ResonanceLane {
  state: "OBSERVED" | "INSUFFICIENT_EVIDENCE";
  /** topically eligible posts (the denominator before comparability filters) */
  nEligible: number;
  /** eligible posts with a same-format content-action index */
  nIndexed: number;
  unindexed: Array<{ reason: UnindexedReason; n: number }>;
  /** median content-action index of the indexed posts; null below MIN_THEME_N */
  medianIndex: number | null;
  /** index > 1: more saves + shares per reached account than the same-format median — engagement, not demand */
  aboveMedian: EligiblePost[];
  /** index < 1: low-resonance comparators — not evidence against the product */
  belowMedian: EligiblePost[];
  formats: Array<{ format: PostFormat; nEligible: number; nIndexed: number; groupN: number }>;
  ageDays: { min: number; max: number } | null;
  window: { from: string; to: string } | null;
  observedAt: string;
  limitations: ResonanceLimitation[];
}

export type NextActionId = "review-captions" | "comparable-observations" | "audience-questions" | "commercial-results";
export type Decision = NextActionId | "ABSTAIN";

export interface HypothesisEvidence {
  hypothesis: Hypothesis & { id: CandidateHypothesis };
  topicalFit: TopicalLane;
  contentResonance: ResonanceLane;
  audienceNeed: { state: "NOT_CONNECTED"; signals: typeof AUDIENCE_SIGNALS };
  commercialOutcome: { state: "NOT_CONNECTED"; signals: typeof COMMERCIAL_SIGNALS };
  /** informational next observations; none of them is executed, stored or sent from here */
  nextActions: NextActionId[];
  /**
   * the smallest permitted next step; ABSTAIN when no post has specific subject matter: there is nothing to read for
   * this hypothesis yet, and reviewing captions stays available as an option rather than a recommendation
   */
  suggested: Decision;
}

/** Unequal-age disclosure: oldest compared post more than twice the age of the youngest. */
const UNEQUAL_AGE_RATIO = 2;
/** Format-skew disclosure: one format holds this share of the eligible posts while others exist. */
const SKEW_SHARE = 0.8;

function windowOf(posts: readonly PostAnalysis[]) {
  const dates = posts.map((p) => p.post.published_at).filter((d): d is string => !!d).sort();
  return dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null;
}

function resonance(analysis: Analysis, eligible: EligiblePost[], stale: boolean): ResonanceLane {
  const indexed = eligible.filter((e) => e.p.contentActionIndex !== null);
  const counts = new Map<UnindexedReason, number>();
  for (const e of eligible) {
    if (e.p.contentActionIndex !== null) continue;
    const group = analysis.groups.find((g) => g.format === e.p.post.format);
    // compared post without an index: its own rate is missing, its format lacks a rate population, or the median is 0
    const reason: UnindexedReason =
      e.p.excluded ?? (e.p.rates.content_action_rate === null ? "missing-saves-shares" : !group || group.nContentAction < MIN_GROUP_N ? "small-group" : "zero-baseline");
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const formats = [...new Set(eligible.map((e) => e.p.post.format))].map((format) => ({
    format,
    nEligible: eligible.filter((e) => e.p.post.format === format).length,
    nIndexed: indexed.filter((e) => e.p.post.format === format).length,
    groupN: analysis.groups.find((g) => g.format === format)?.nContentAction ?? 0,
  }));
  const ages = indexed.map((e) => e.p.ageDays).filter((a): a is number => a !== null);
  const ageDays = ages.length ? { min: Math.min(...ages), max: Math.max(...ages) } : null;
  const largest = Math.max(0, ...formats.map((f) => f.nEligible));
  const limitations: ResonanceLimitation[] = ["lifetime-accrual", "single-snapshot", "maturity-not-age-matched", "no-causality"];
  if (ageDays && ageDays.max > ageDays.min * UNEQUAL_AGE_RATIO) limitations.push("unequal-ages");
  // mixed formats where one dominates or a minority format has no usable baseline (e.g. 49 Reels / 1 Feed post)
  // the indexed posts are the ones the median is read from: a skew there counts even when the eligible set looks mixed
  const indexedFormats = formats.filter((f) => f.nIndexed > 0);
  const largestIndexed = Math.max(0, ...indexedFormats.map((f) => f.nIndexed));
  if (
    (formats.length > 1 && (largest / eligible.length >= SKEW_SHARE || formats.some((f) => f.groupN < MIN_GROUP_N))) ||
    (indexedFormats.length > 1 && largestIndexed / indexed.length >= SKEW_SHARE)
  )
    limitations.push("format-skew");
  if (eligible.some((e) => e.overlap)) limitations.push("overlap");
  if (stale) limitations.push("stale-snapshot");
  const enough = indexed.length >= MIN_THEME_N;
  return {
    state: enough ? "OBSERVED" : "INSUFFICIENT_EVIDENCE",
    nEligible: eligible.length,
    nIndexed: indexed.length,
    unindexed: [...counts.entries()].map(([reason, n]) => ({ reason, n })),
    medianIndex: enough ? median(indexed.map((e) => e.p.contentActionIndex!)) : null,
    aboveMedian: indexed.filter((e) => e.p.contentActionIndex! > 1).sort((a, b) => b.p.contentActionIndex! - a.p.contentActionIndex!),
    belowMedian: indexed.filter((e) => e.p.contentActionIndex! < 1).sort((a, b) => a.p.contentActionIndex! - b.p.contentActionIndex!),
    formats,
    ageDays,
    window: windowOf(indexed.map((e) => e.p)),
    observedAt: analysis.observedAt,
    limitations,
  };
}

export function hypothesisEvidence(analysis: Analysis, fitOf: TopicalFitOf, { stale = false }: { stale?: boolean } = {}): HypothesisEvidence[] {
  const candidates = HYPOTHESES.filter((h): h is Hypothesis & { id: CandidateHypothesis } => h.status === "candidate");
  const fits = new Map(analysis.posts.map((p) => [p.post.media_id, { H1: fitOf(p.post, "H1"), H4: fitOf(p.post, "H4") }]));
  return candidates.map((hypothesis) => {
    const other: CandidateHypothesis = hypothesis.id === "H1" ? "H4" : "H1";
    const entry = (p: PostAnalysis): EligiblePost => {
      const f = fits.get(p.post.media_id)!;
      return { p, fit: f[hypothesis.id], overlap: f[other].eligible };
    };
    const eligible = analysis.posts.filter((p) => fits.get(p.post.media_id)![hypothesis.id].eligible).map(entry);
    const sessionExcluded = analysis.posts
      .filter((p) => {
        const f = fits.get(p.post.media_id)![hypothesis.id];
        return !f.eligible && f.source === "manual-session" && f.matched.length > 0;
      })
      .map(entry);
    const nManual = eligible.filter((e) => e.fit.source === "manual-session").length;
    const topical: TopicalLane = {
      state: eligible.length === 0 ? "UNCLASSIFIED" : nManual === eligible.length ? "MANUAL_SESSION" : "DERIVED",
      eligible,
      nDerived: eligible.length - nManual,
      nManual,
      sessionExcluded,
      nOverlap: eligible.filter((e) => e.overlap).length,
      durableReview: "NOT_AVAILABLE",
    };
    const res = resonance(analysis, eligible, stale);
    const nextActions: NextActionId[] = [];
    if (topical.state === "UNCLASSIFIED") nextActions.push("review-captions");
    if (topical.state !== "UNCLASSIFIED" && res.state === "INSUFFICIENT_EVIDENCE") nextActions.push("comparable-observations");
    nextActions.push("audience-questions", "commercial-results");
    return {
      hypothesis,
      topicalFit: topical,
      contentResonance: res,
      audienceNeed: { state: "NOT_CONNECTED", signals: AUDIENCE_SIGNALS },
      commercialOutcome: { state: "NOT_CONNECTED", signals: COMMERCIAL_SIGNALS },
      nextActions,
      suggested: topical.state === "UNCLASSIFIED" ? "ABSTAIN" : nextActions[0]!,
    };
  });
}

export interface EngagementComparison {
  state: "DESCRIPTIVE" | "INSUFFICIENT_EVIDENCE";
  /** indexed posts eligible for exactly one hypothesis; posts eligible for both are counted once, in nBoth */
  nH1Only: number;
  nH4Only: number;
  nBoth: number;
  medianH1Only: number | null;
  medianH4Only: number | null;
  /**
   * medianH1Only − medianH4Only: an absolute difference of two dimensionless index values (e.g. 1.30 − 1.00 = 0.30),
   * not a relative percentage and not a multiplier. Descriptive content engagement only; it never ranks products.
   */
  difference: number | null;
  /**
   * limits of comparing the two disjoint groups with each other: always lifetime/single snapshot/maturity cutoff/no
   * causality; plus format-skew when the groups' formats differ or one format dominates, unequal-ages across both
   * groups, and a stale snapshot
   */
  limitations: ResonanceLimitation[];
}

/**
 * Replaces the ANA-38 "next test" lean (|median H1-only − median H4-only| ≥ 0.25 → "lean H1/H4"). Engagement with
 * existing posts cannot choose a product, so no lean or threshold exists any more; the medians are shown descriptively
 * once both disjoint groups hold MIN_PATTERN_GROUP_N indexed posts.
 */
export function engagementComparison(evidence: readonly HypothesisEvidence[]): EngagementComparison {
  const indexed = (h: CandidateHypothesis) => evidence.find((e) => e.hypothesis.id === h)?.topicalFit.eligible.filter((e) => e.p.contentActionIndex !== null) ?? [];
  const h1 = indexed("H1");
  const h4 = indexed("H4");
  const in1 = new Set(h1.map((e) => e.p.post.media_id));
  const in4 = new Set(h4.map((e) => e.p.post.media_id));
  const posts1 = h1.filter((e) => !in4.has(e.p.post.media_id)).map((e) => e.p);
  const posts4 = h4.filter((e) => !in1.has(e.p.post.media_id)).map((e) => e.p);
  const only1 = posts1.map((p) => p.contentActionIndex!);
  const only4 = posts4.map((p) => p.contentActionIndex!);
  const limitations: ResonanceLimitation[] = ["lifetime-accrual", "single-snapshot", "maturity-not-age-matched", "no-causality"];
  const both = [...posts1, ...posts4];
  const ages = both.map((p) => p.ageDays).filter((a): a is number => a !== null);
  if (ages.length && Math.max(...ages) > Math.min(...ages) * UNEQUAL_AGE_RATIO) limitations.push("unequal-ages");
  const share = (ps: readonly PostAnalysis[]) => {
    const counts = new Map<string, number>();
    for (const p of ps) counts.set(p.post.format, (counts.get(p.post.format) ?? 0) + 1);
    return counts;
  };
  const top = (ps: readonly PostAnalysis[]) => [...share(ps).entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const all = share(both);
  if (both.length && ((all.size > 1 && Math.max(...all.values()) / both.length >= SKEW_SHARE) || (posts1.length && posts4.length && top(posts1) !== top(posts4))))
    limitations.push("format-skew");
  if (evidence.some((e) => e.contentResonance.limitations.includes("stale-snapshot"))) limitations.push("stale-snapshot");
  const base = { nH1Only: only1.length, nH4Only: only4.length, nBoth: h1.length - only1.length, limitations };
  if (only1.length < MIN_PATTERN_GROUP_N || only4.length < MIN_PATTERN_GROUP_N) return { state: "INSUFFICIENT_EVIDENCE", ...base, medianH1Only: null, medianH4Only: null, difference: null };
  const m1 = median(only1)!;
  const m4 = median(only4)!;
  return { state: "DESCRIPTIVE", ...base, medianH1Only: m1, medianH4Only: m4, difference: m1 - m4 };
}
