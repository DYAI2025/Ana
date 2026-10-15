// @vitest-environment node
/**
 * F1.I1 evidence oracles (Jira ANA-39 AC2–AC4, Confluence 108920834). Every caption, id and number here is synthetic.
 * The ANA-38 fixture is used only where the before/after false-positive correction is pinned.
 */
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../../e2e/fake-social/core.mjs";
import { normalizeSnapshot } from "@/server/social/normalize";
import { analyze, MATURE_AGE_DAYS, MIN_GROUP_N, MIN_PATTERN_GROUP_N, MIN_THEME_N, type Analysis, type PostAnalysis } from "./insights";
import { AUDIENCE_SIGNALS, COMMERCIAL_SIGNALS, engagementComparison, HYPOTHESES, hypothesisEvidence, LANES, type HypothesisEvidence, type TopicalFitOf } from "./offers";
import { assignTheme, deriveTopicalFit, topicalFit, type CandidateHypothesis, type HypothesisCorrections } from "./themes";
import type { Observation, PostFormat, SocialPost, SocialSnapshot } from "./types";

const OBSERVED = "2026-10-10T12:00:00.000Z";

interface Spec {
  id: string;
  caption?: string | null;
  format?: PostFormat;
  days?: number;
  reach?: number | null;
  saves?: number | null;
  shares?: number | null;
}

function observation(mediaId: string, metric: Observation["metric_name"], value: number | null): Observation {
  return {
    account_id: "syn-account",
    media_id: mediaId,
    provider: "instagram",
    provider_api_version: "v26.0",
    metric_name: metric,
    native_metric_name: metric === "saves" ? "saved" : metric,
    value,
    unit: metric === "reach" ? "accounts" : "count",
    period: "lifetime",
    availability_state: value === null ? "UNAVAILABLE" : "VERIFIED",
    availability_reason: null,
    observed_at: OBSERVED,
    baseline_definition: null,
    source_reference: `instagram:media/${mediaId}/insights`,
  };
}

function post({ id, caption = "A quiet morning", format = "reel", days = 20, reach = 1000, saves = 20, shares = 10 }: Spec): SocialPost {
  return {
    media_id: id,
    media_type: format === "reel" ? "VIDEO" : "IMAGE",
    media_product_type: format === "reel" ? "REELS" : "FEED",
    format,
    caption,
    permalink: null,
    thumbnail_url: null,
    published_at: new Date(Date.parse(OBSERVED) - days * 86_400_000).toISOString(),
    insights_state: "ok",
    observations: [observation(id, "reach", reach), observation(id, "saves", saves), observation(id, "shares", shares)],
  };
}

function snap(specs: Spec[]): SocialSnapshot {
  return {
    provider: "instagram",
    provider_api_version: "v26.0",
    account_id: "syn-account",
    handle: "synthetic_creator",
    observed_at: OBSERVED,
    served_at: OBSERVED,
    coverage: { requested: null, retrieved: specs.length, total_available: null, has_more: false, pages_fetched: null, posts_with_insights: specs.length, posts_without_insights: 0, budget_used: null, budget_limit: null, insights_priority: null, halted: null, optional_fields: "ACCEPTED" },
    account: [],
    posts: specs.map(post),
  };
}

/** n neutral posts of one format with spread values: the same-format baseline population. */
const filler = (n: number, format: PostFormat = "reel", prefix = "fill") =>
  Array.from({ length: n }, (_, i): Spec => ({ id: `${prefix}${i}`, format, reach: 1000 + i * 100, saves: 20 + i, shares: 10 + i }));

const ruleFit = (corrections: HypothesisCorrections = {}): TopicalFitOf => (p, h) => topicalFit(p, h, corrections);
const evidenceOf = (s: SocialSnapshot, corrections: HypothesisCorrections = {}, stale = false) => hypothesisEvidence(analyze(s), ruleFit(corrections), { stale });
const lane = (ev: HypothesisEvidence[], h: CandidateHypothesis) => ev.find((e) => e.hypothesis.id === h)!;
const eligibleIds = (e: HypothesisEvidence) => e.topicalFit.eligible.map((x) => x.p.post.media_id);
const fitOf = (caption: string, h: CandidateHypothesis) => deriveTopicalFit(caption, h);

describe("AC2 · topical fit is specific; generic keywords never qualify a hypothesis", () => {
  it("negative: a travel-only post is not H1 (or H4), however many saves it has", () => {
    expect(fitOf("Island trip vlog: beach day, passport, nomad life abroad", "H1")).toEqual([]);
    expect(fitOf("Island trip vlog: beach day, passport, nomad life abroad", "H4")).toEqual([]);
    const ev = evidenceOf(snap([...filler(6), { id: "travel", caption: "Island trip vlog: beach day, nomad life", saves: 400, shares: 200 }]));
    expect(eligibleIds(lane(ev, "H1"))).not.toContain("travel");
    expect(lane(ev, "H1").contentResonance.aboveMedian.map((x) => x.p.post.media_id)).not.toContain("travel");
  });

  it("negative: generic money is not H4 (or H1)", () => {
    expect(fitOf("Freelance money: what I earn, my rates, income and salary", "H4")).toEqual([]);
    expect(fitOf("Freelance money: what I earn, my rates, income and salary", "H1")).toEqual([]);
  });

  it("negative: generic creator/UGC content without a job or opportunity is not H1", () => {
    expect(fitOf("UGC creator day in my life, brand collab behind the scenes", "H1")).toEqual([]);
    expect(fitOf("How to pitch brands as a creator", "H1")).toEqual([]);
    // an opportunity word without a creator/UGC/remote/brand domain is not a creator opportunity either
    expect(fitOf("What a great opportunity to travel", "H1")).toEqual([]);
    expect(fitOf("Apply sunscreen before the beach", "H1")).toEqual([]);
  });

  it("negative (review round 1): opportunity and domain words that only co-occur are not an H1 opportunity", () => {
    for (const caption of ["Remote island trip, what an opportunity!", "Brands I love: a once in a lifetime opportunity to see Bali", "My position on brand collabs", "Quit my job to become a creator"]) {
      expect(fitOf(caption, "H1"), caption).toEqual([]);
    }
  });

  it("negative (review round 1): Italian 'modello' (model) is not a reusable file", () => {
    expect(fitOf("Il modello di business dei creator", "H4")).toEqual([]);
    expect(fitOf("Shot on my iPhone, modello Pro", "H4")).toEqual([]);
  });

  it("positive: compact hashtags and German/Italian job wording", () => {
    expect(fitOf("New this week #ugcjobs #remotework", "H1")).toEqual(["ugcjobs"]);
    expect(fitOf("Stellenangebote für Creator", "H1")).toEqual(["stellenangebote", "creator"]);
    expect(fitOf("Opportunità di lavoro per creator UGC", "H1")).toEqual(["opportunità di lavoro", "creator"]);
    expect(fitOf("Meine Checklisten für Kooperationen", "H4")).toEqual(["checklisten"]);
  });

  it("negative: generic tips without a reusable artifact are not H4", () => {
    expect(fitOf("10 tips: how to grow, a step by step guide and my best resources", "H4")).toEqual([]);
  });

  it("ambiguous: unclear or missing captions stay UNCLASSIFIED", () => {
    expect(topicalFit(post({ id: "x", caption: "Feel good friday" }), "H1", {})).toEqual({ hypothesis: "H1", eligible: false, source: "unclassified", matched: [] });
    expect(topicalFit(post({ id: "y", caption: null }), "H4", {})).toMatchObject({ eligible: false, source: "unclassified" });
  });

  it("positive: a specific creator-job caption yields DERIVED H1 topical fit only", () => {
    const fit = topicalFit(post({ id: "job", caption: "UGC jobs this week: 5 brands hiring creators" }), "H1", {});
    expect(fit).toEqual({ hypothesis: "H1", eligible: true, source: "derived-keyword", matched: ["jobs", "hiring", "ugc", "creators", "brands"] });
    expect(topicalFit(post({ id: "job", caption: "UGC jobs this week: 5 brands hiring creators" }), "H4", {}).eligible).toBe(false);
    expect(fitOf("New ugc-job board for remote creators", "H1").length).toBeGreaterThan(0); // hyphenated phrase
  });

  it("positive: a specific template/file caption yields DERIVED H4 topical fit only", () => {
    const fit = topicalFit(post({ id: "file", caption: "My media kit template and rate card for pitching" }), "H4", {});
    expect(fit).toEqual({ hypothesis: "H4", eligible: true, source: "derived-keyword", matched: ["template", "media kit", "rate card"] });
    expect(topicalFit(post({ id: "file", caption: "My media kit template and rate card for pitching" }), "H1", {}).eligible).toBe(false);
  });

  it("regression (ANA-38 coupling): a broad manual 'opportunities' theme never qualifies H1 or H4, let alone both", () => {
    const travel = post({ id: "travel", caption: "Island trip vlog" });
    const theme = assignTheme(travel, { travel: ["opportunities"] });
    // the theme override is recorded as such, but carries nothing a hypothesis could read
    expect(theme).toEqual({ themes: ["opportunities"], source: "manual-session", matched: [] });
    expect("families" in theme).toBe(false);
    const ev = evidenceOf(snap([...filler(6), { id: "travel", caption: "Island trip vlog" }]));
    expect(eligibleIds(lane(ev, "H1"))).toEqual([]);
    expect(eligibleIds(lane(ev, "H4"))).toEqual([]);
  });

  it("genuine specific dual-topic evidence is eligible for both, visible as overlap, and counted once", () => {
    const ev = evidenceOf(snap([...filler(6), { id: "dual", caption: "Remote job board plus my application checklist template" }, { id: "h1", caption: "Creator opportunities: casting call for UGC" }]));
    const h1 = lane(ev, "H1");
    const h4 = lane(ev, "H4");
    expect(eligibleIds(h1)).toEqual(["dual", "h1"]);
    expect(eligibleIds(h4)).toEqual(["dual"]);
    expect(h1.topicalFit.eligible.find((x) => x.p.post.media_id === "dual")!.overlap).toBe(true);
    expect(h1.topicalFit.nOverlap).toBe(1);
    expect(h4.contentResonance.limitations).toContain("overlap");
    const c = engagementComparison(ev);
    expect(c).toMatchObject({ nH1Only: 1, nH4Only: 0, nBoth: 1 });
  });

  it("session corrections are hypothesis-specific, marked MANUAL_SESSION and never durable review", () => {
    const s = snap([...filler(6), { id: "travel", caption: "Island trip vlog" }, { id: "job", caption: "Remote jobs for creators" }]);
    const ev = evidenceOf(s, { travel: { H1: true }, job: { H1: false } });
    const h1 = lane(ev, "H1");
    expect(eligibleIds(h1)).toEqual(["travel"]);
    expect(h1.topicalFit).toMatchObject({ state: "MANUAL_SESSION", nDerived: 0, nManual: 1, durableReview: "NOT_AVAILABLE" });
    // the excluded post keeps its caption-rule evidence visible
    expect(h1.topicalFit.sessionExcluded.map((x) => [x.p.post.media_id, x.fit.source, x.fit.matched])).toEqual([["job", "manual-session", ["jobs", "creators", "remote"]]]);
    // including a post for H1 never includes it for H4
    expect(eligibleIds(lane(ev, "H4"))).toEqual([]);
    expect(lane(evidenceOf(s), "H1").topicalFit.state).toBe("DERIVED");
  });

  it("before/after on the ANA-38 synthetic fixture: travel and money posts no longer count for H1/H4", () => {
    const fixture = normalizeSnapshot(buildSnapshot());
    const ev = hypothesisEvidence(analyze(fixture), ruleFit());
    // ANA-38 counted syn003 ("moving abroad") and syn005 ("Island trip vlog") as H1 "supporting posts"
    expect(eligibleIds(lane(ev, "H1"))).toEqual(["syn002", "syn008", "syn022"]);
    // ANA-38 counted syn010 ("Freelance money") and syn018 ("Budget breakdown") as H4 "supporting posts"
    expect(eligibleIds(lane(ev, "H4"))).toEqual(["syn004", "syn013", "syn020"]);
    for (const id of ["syn003", "syn005", "syn011", "syn014"]) expect(eligibleIds(lane(ev, "H1"))).not.toContain(id);
    for (const id of ["syn010", "syn018", "syn006"]) expect(eligibleIds(lane(ev, "H4"))).not.toContain(id);
  });
});

describe("AC3 · four independent lanes; engagement is never product evidence", () => {
  const s = snap([...filler(6), ...[0, 1, 2].map((i): Spec => ({ id: `job${i}`, caption: "UGC jobs: brands hiring", saves: 10 + i * 40, shares: 5 + i * 20 }))]);
  const ev = evidenceOf(s);

  it("H1 and H4 are the only candidates; H2/H3 stay parked", () => {
    expect(HYPOTHESES.map((h) => [h.id, h.status])).toEqual([["H1", "candidate"], ["H2", "parked"], ["H3", "parked"], ["H4", "candidate"]]);
    expect(ev.map((e) => e.hypothesis.id)).toEqual(["H1", "H4"]);
  });

  it("audience need and commercial outcome are NOT_CONNECTED with the missing sources named", () => {
    expect(LANES).toEqual(["CONTENT_RESONANCE", "TOPICAL_FIT", "AUDIENCE_NEED", "COMMERCIAL_OUTCOME"]);
    for (const e of ev) {
      expect(e.audienceNeed).toEqual({ state: "NOT_CONNECTED", signals: AUDIENCE_SIGNALS });
      expect(e.commercialOutcome).toEqual({ state: "NOT_CONNECTED", signals: COMMERCIAL_SIGNALS });
    }
  });

  it("no supporting/contradicting, demand or blended field exists; resonance splits into above-median and low-resonance comparators", () => {
    const h1 = lane(ev, "H1");
    for (const key of ["supporting", "contradicting", "state", "score", "demand", "lean"]) expect(Object.keys(h1)).not.toContain(key);
    expect(h1.contentResonance).toMatchObject({ state: "OBSERVED", nEligible: 3, nIndexed: 3 });
    expect(h1.contentResonance.aboveMedian.every((x) => x.p.contentActionIndex! > 1)).toBe(true);
    expect(h1.contentResonance.belowMedian.every((x) => x.p.contentActionIndex! < 1)).toBe(true);
    expect(h1.contentResonance.aboveMedian.length + h1.contentResonance.belowMedian.length).toBeLessThanOrEqual(3);
  });

  it("each lane carries its own provenance and denominators", () => {
    const h1 = lane(ev, "H1");
    expect(h1.topicalFit).toMatchObject({ state: "DERIVED", nDerived: 3, nManual: 0, nOverlap: 0 });
    expect(h1.topicalFit.eligible[0]!.fit).toMatchObject({ source: "derived-keyword", matched: ["jobs", "hiring", "ugc", "brands"] });
    expect(h1.contentResonance.formats).toEqual([{ format: "reel", nEligible: 3, nIndexed: 3, groupN: 9 }]);
    expect(h1.contentResonance.observedAt).toBe(OBSERVED);
  });

  it("nothing eligible → ABSTAIN is the suggestion; otherwise the smallest gap is suggested, never a product", () => {
    expect(lane(ev, "H4")).toMatchObject({ suggested: "ABSTAIN", nextActions: ["review-captions", "audience-questions", "commercial-results"] });
    expect(lane(ev, "H1")).toMatchObject({ suggested: "audience-questions", nextActions: ["audience-questions", "commercial-results"] });
  });
});

describe("AC4 · comparability limits are disclosed, missing data never becomes a value", () => {
  const job = (id: string, extra: Partial<Spec> = {}): Spec => ({ id, caption: "Remote jobs for creators", ...extra });

  it("the 7-day cutoff and per-metric gates are unchanged", () => {
    expect([MATURE_AGE_DAYS, MIN_GROUP_N, MIN_THEME_N, MIN_PATTERN_GROUP_N]).toEqual([7, 5, 3, 8]);
  });

  it("content action rate = (saves + shares) ÷ reach is an action ratio that can exceed 1", () => {
    const a = analyze(snap([{ id: "p", reach: 100, saves: 90, shares: 40 }]));
    expect(a.posts[0]!.rates.content_action_rate).toBeCloseTo(1.3, 10);
  });

  it("zero reach, missing saves/shares and too-young posts are counted as not compared, never as 0", () => {
    const ev = evidenceOf(snap([...filler(6), job("zero", { reach: 0 }), job("nosave", { saves: null }), job("young", { days: 3 }), job("ok")]));
    const r = lane(ev, "H1").contentResonance;
    expect(r).toMatchObject({ nEligible: 4, nIndexed: 1, state: "INSUFFICIENT_EVIDENCE", medianIndex: null });
    expect(r.unindexed).toEqual([
      { reason: "zero-reach", n: 1 },
      { reason: "missing-saves-shares", n: 1 },
      { reason: "too-young", n: 1 },
    ]);
  });

  it("a zero same-format median yields no index (never Infinity) and says why", () => {
    const zeros = Array.from({ length: 6 }, (_, i): Spec => ({ id: `z${i}`, saves: 0, shares: 0 }));
    const a = analyze(snap([...zeros, job("j", { saves: 5, shares: 5 })]));
    expect(a.posts.every((p) => p.contentActionIndex === null)).toBe(true);
    expect(a.posts.some((p) => p.contentActionIndex === Infinity)).toBe(false);
    const r = lane(hypothesisEvidence(a, ruleFit()), "H1").contentResonance;
    expect(r.unindexed).toEqual([{ reason: "zero-baseline", n: 1 }]);
  });

  it("fewer than MIN_GROUP_N format observations → small-group, no index", () => {
    const ev = evidenceOf(snap([...filler(3), job("j")]));
    expect(lane(ev, "H1").contentResonance.unindexed).toEqual([{ reason: "small-group", n: 1 }]);
  });

  it("fewer than MIN_THEME_N eligible compared posts → INSUFFICIENT_EVIDENCE with a comparable-observations step", () => {
    const ev = evidenceOf(snap([...filler(6), job("a"), job("b")]));
    expect(lane(ev, "H1")).toMatchObject({ contentResonance: { state: "INSUFFICIENT_EVIDENCE", nIndexed: 2, medianIndex: null }, suggested: "comparable-observations" });
  });

  it("unequal ages: an 8-day and a 200-day post are both compared, and the reading says it is not age-matched", () => {
    const ev = evidenceOf(snap([...filler(6), job("young", { days: 8 }), job("old", { days: 200 }), job("mid", { days: 30 })]));
    const r = lane(ev, "H1").contentResonance;
    expect(r.nIndexed).toBe(3);
    expect(r.ageDays).toEqual({ min: 8, max: 200 });
    expect(r.limitations).toEqual(expect.arrayContaining(["maturity-not-age-matched", "unequal-ages", "lifetime-accrual", "single-snapshot"]));
  });

  it("49 Reels / 1 Feed post: the lone feed post has no baseline and the skew is disclosed", () => {
    const reels = Array.from({ length: 49 }, (_, i) => job(`r${i}`, { reach: 1000 + i * 10, saves: 20 + (i % 7), shares: 10 + (i % 5) }));
    const ev = evidenceOf(snap([...reels, job("feed", { format: "image" })]));
    const r = lane(ev, "H1").contentResonance;
    expect(r.formats).toEqual([
      { format: "reel", nEligible: 49, nIndexed: 49, groupN: 49 },
      { format: "image", nEligible: 1, nIndexed: 0, groupN: 1 },
    ]);
    expect(r.unindexed).toEqual([{ reason: "small-group", n: 1 }]);
    expect(r.limitations).toContain("format-skew");
  });

  it("a stale snapshot is disclosed on every resonance reading", () => {
    const s = snap([...filler(6), job("a"), job("b"), job("c")]);
    expect(lane(evidenceOf(s), "H1").contentResonance.limitations).not.toContain("stale-snapshot");
    for (const e of evidenceOf(s, {}, true)) expect(e.contentResonance.limitations).toContain("stale-snapshot");
  });
});

describe("AC4 · H1-only vs H4-only comparison is descriptive, absolute and never a product lean", () => {
  /** Synthetic analysis with chosen indices: only the comparison arithmetic is under test here. */
  function withIndices(h1: number[], h4: number[], both: number[] = []): HypothesisEvidence[] {
    const mk = (id: string, caption: string, idx: number): PostAnalysis => ({ ...analyze(snap([{ id, caption }])).posts[0]!, excluded: null, contentActionIndex: idx });
    const posts = [
      ...h1.map((v, i) => mk(`a${i}`, "UGC jobs for creators", v)),
      ...h4.map((v, i) => mk(`b${i}`, "My checklist template", v)),
      ...both.map((v, i) => mk(`c${i}`, "Remote jobs plus checklist template", v)),
    ];
    const analysis: Analysis = { observedAt: OBSERVED, groups: [], posts };
    return hypothesisEvidence(analysis, ruleFit());
  }

  it("needs MIN_PATTERN_GROUP_N disjoint posts on each side; overlap is excluded and counted once", () => {
    expect(engagementComparison(withIndices(Array(7).fill(1.5), Array(8).fill(1), [2, 2]))).toEqual({ state: "INSUFFICIENT_EVIDENCE", nH1Only: 7, nH4Only: 8, nBoth: 2, medianH1Only: null, medianH4Only: null, difference: null });
  });

  it("1.30 vs 1.00 → difference 0.30 index points: absolute, not 30 %, and no lean although the legacy 0.25 threshold is crossed", () => {
    const c = engagementComparison(withIndices(Array(8).fill(1.3), Array(8).fill(1)));
    expect(c.state).toBe("DESCRIPTIVE");
    expect(c.medianH1Only).toBeCloseTo(1.3, 10);
    expect(c.medianH4Only).toBeCloseTo(1, 10);
    expect(c.difference).toBeCloseTo(0.3, 10);
    expect(Object.keys(c)).not.toContain("lean");
  });

  it("0.50 vs 0.70 → −0.20 index points, although the relative change is about −29 %", () => {
    const c = engagementComparison(withIndices(Array(8).fill(0.5), Array(8).fill(0.7)));
    expect(c.difference).toBeCloseTo(-0.2, 10);
    expect(c.difference).not.toBeCloseTo((0.5 - 0.7) / 0.7, 2);
  });
});
