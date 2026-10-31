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

  it("negative (falsification round 2): 'remote' + bare 'opportunity' or the author's own job is not an H1 opportunity", () => {
    for (const caption of ["Remote opportunity to travel this summer", "I quit my remote job last year", "I left my old UGC job", "Mein Remote Job ist vorbei"]) {
      expect(fitOf(caption, "H1"), caption).toEqual([]);
    }
    // remote WORK still qualifies, and a possessive in another clause does not block a real opportunity
    // (round 4: a possessive earlier in the SAME clause abstains, even when the author may be listing others' jobs)
    expect(fitOf("Remote work opportunities for editors, apply by Friday", "H1")).toEqual(["opportunities", "remote work"]);
    expect(fitOf("Opportunities list: remote work", "H1")).toEqual(["opportunities", "remote work"]);
    expect(fitOf("Remote opportunity for UGC creators: apply now", "H1")).toEqual(["opportunity", "ugc"]);
    expect(fitOf("My picks. Top 5 UGC jobs this week, apply via the link", "H1")).toEqual(["jobs", "ugc"]);
    expect(fitOf("My top 5 UGC jobs this week", "H1")).toEqual([]);
    expect(fitOf("Our brand is hiring", "H1")).toEqual(["hiring", "brand"]);
  });

  it("negative (falsification round 2): a personal routine called 'workflow' is not a reusable file", () => {
    expect(fitOf("My morning workout workflow", "H4")).toEqual([]);
    expect(fitOf("My morning workout workflow", "H1")).toEqual([]);
    // a workflow counts only with a reusable-file cue
    expect(fitOf("My content workflow as a Notion file", "H4")).toEqual(["workflow", "file"]);
  });

  it("negative (review round 3): idioms, distant own jobs, negations and sentence breaks are not an H1 opportunity", () => {
    for (const caption of [
      "A brand new opportunity to travel the world",
      "Started a brand-new job in Lisbon",
      "Great job creators! See you at the meetup",
      "Good job, remote team!",
      "Creator job well done",
      "Collab with a hotel brand. Job of the day: relax by the pool",
      "I quit my UGC side gig",
      "I left my remote side job",
      "Mein Job als Creator ist vorbei",
      "I love my job for creators",
      "Not a UGC job, not a brand deal, just a beach trip",
      "No jobs for creators here",
    ]) {
      expect(fitOf(caption, "H1"), caption).toEqual([]);
    }
  });

  it("negative (review round 3): a 'workflow' file cue counts only next to the workflow; negated artifacts do not count", () => {
    for (const caption of [
      "My morning workout workflow, then I file my taxes",
      "My editing workflow for raw travel video files",
      "My morning workflow before I download my emails",
      "No template, no checklist, just vibes",
    ]) {
      expect(fitOf(caption, "H4"), caption).toEqual([]);
    }
    expect(fitOf("Downloadable workflow for brand pitches", "H4")).toEqual(["workflow", "downloadable"]);
    expect(fitOf("My editing workflow as a PDF", "H4")).toEqual(["workflow", "pdf"]);
  });

  it("negative (review round 4): commentary, advice, labels and the author's own jobs are not an H1 opportunity", () => {
    for (const caption of [
      "Reels are a huge opportunity for brands",
      "This is a great opportunity for creators to grow",
      "I quit my full-time remote job",
      "We left our remote jobs",
      "meinen gut bezahlten Remote-Job habe ich gekündigt",
      "Just booked another UGC gig",
      "Landed a new brand gig!",
      "Just wrapped another brand job",
      "Stop hiring influencers",
      "Thinking about hiring a UGC creator? Here's how",
      "Dream job: UGC creator",
      "Today's job: brand shoot",
      "The influencer gig economy is broken",
      "This isn't a UGC job",
      "I never got a UGC job",
      "Great UGC job on this one!",
    ]) {
      expect(fitOf(caption, "H1"), caption).toEqual([]);
    }
    expect(fitOf("Now hiring UGC creators", "H1")).toEqual(["hiring", "ugc", "creators"]);
    expect(fitOf("We're hiring creators", "H1")).toEqual(["hiring", "creators"]);
  });

  it("negative (review round 4): negated artifacts, cues a routine acts on and figurative files are not an H4 file", () => {
    for (const caption of [
      "I don't use templates",
      "No need for a template",
      "Never needed a template",
      "You don't need a template",
      "A workflow with no download needed",
      "My editing workflow for video files",
      "My workflow to file taxes",
      "My morning workflow: download emails",
      "I left my spreadsheet job to travel the world",
      "My emotional toolkit for anxiety while traveling",
    ]) {
      expect(fitOf(caption, "H4"), caption).toEqual([]);
    }
    expect(fitOf("Budget spreadsheet as a Google Sheet", "H4")).toEqual(["spreadsheet", "google sheet"]);
    expect(fitOf("Downloadable creator toolkit", "H4")).toEqual(["toolkit", "downloadable"]);
  });

  // AC2 contract repair (PO 2026-10-31) reverts the review-round-5 offer-signal gate and advice-frame abstention: a specific
  // creator/UGC/remote job or opportunity TOPIC is enough, as how-to, list or commentary.
  it("positive (AC2 repair of review round 5): job/opportunity topics count without an offer signal and under a how-to frame", () => {
    for (const [caption, matched] of [
      ["How to get UGC jobs with no followers", ["jobs", "ugc"]],
      ["How to find remote jobs in 2025", ["jobs", "remote"]],
      ["Where to find brand jobs as a small creator", ["jobs", "brand"]],
      ["5 remote jobs you can do from anywhere", ["jobs", "remote"]],
      ["How to apply for UGC jobs", ["jobs", "ugc"]],
      ["Remote jobs are overrated", ["jobs", "remote"]],
      ["UGC jobs aren't what you think", ["jobs", "ugc"]],
      ["Stop chasing brand jobs", ["jobs", "brand"]],
      ["The truth about UGC jobs", ["jobs", "ugc"]],
      ["Why UGC jobs pay so little", ["jobs", "ugc"]],
      ["Remote jobs for creators", ["jobs", "creators", "remote"]],
    ] as const) {
      expect(fitOf(caption, "H1"), caption).toEqual(matched);
    }
    expect(fitOf("Remote jobs for creators, apply now", "H1")).toEqual(["jobs", "creators", "remote"]);
    expect(fitOf("New this week #ugcjobs", "H1")).toEqual(["ugcjobs"]);
  });

  it("uncertain (AC2 repair, residual): own-job and lifestyle mentions without a guard cue stay a DERIVED, correctable suggestion", () => {
    // Only the reverted offer-signal gate kept these out. No guard cue (possessive, own-job verb, negator, praise) is in the
    // clause, so the rule cannot tell them from a topic post. They are a suggestion an analyst excludes per session, never
    // confirmed demand (residual documented in docs/evidence/ANA-39/CHECKLIST.md).
    for (const caption of [
      "Just shot a UGC job for a skincare brand",
      "This UGC gig paid me $500",
      "BTS of today's UGC job",
      "Day in the life with a remote job in Bali",
      "POV: you have a remote job and live in Bali",
      // generic opportunity commentary without a copula: no guard cue either
      "Huge brand opportunity in AI right now",
    ]) {
      expect(topicalFit(post({ id: "r", caption }), "H1", {}), caption).toMatchObject({ eligible: true, source: "derived-keyword" });
      expect(topicalFit(post({ id: "r", caption }), "H1", { r: { H1: false } }), caption).toMatchObject({ eligible: false, source: "manual-session" });
    }
  });

  // AC2 finding on 0b80d41 (2026-10-31): "<subject> is/are a <adj> brand/creator opportunity" is generic business-opportunity
  // commentary, not a specific creator/UGC/remote-work job or opportunity topic. The connector form already abstained under
  // a copula ("Reels are a huge opportunity for brands"); the adjacent form did not.
  it("negative (AC2 finding): copula commentary on a generic brand/creator 'opportunity' is not H1", () => {
    for (const caption of [
      "AI is a massive brand opportunity",
      "Reels are a huge creator opportunity",
      "AI tools are massive creator opportunities right now",
      "TikTok Shop is the biggest brand opportunity of the year",
    ]) {
      expect(fitOf(caption, "H1"), caption).toEqual([]);
      expect(topicalFit(post({ id: "g", caption }), "H1", {}), caption).toEqual({ hypothesis: "H1", eligible: false, source: "unclassified", matched: [] });
      // an analyst can still include it for this session
      expect(topicalFit(post({ id: "g", caption }), "H1", { g: { H1: true } }), caption).toMatchObject({ eligible: true, source: "manual-session" });
    }
    // conservative recall miss, same rule as the connector form: a generic "opportunity" announced with a copula abstains
    expect(fitOf("Here are 5 creator opportunities this week", "H1")).toEqual([]);
    // preserved: job-specific terms under a copula, generic "opportunity" without one, and own-sponsorship residuals
    for (const [caption, matched] of [
      ["Remote jobs are overrated", ["jobs", "remote"]],
      ["UGC jobs aren't what you think", ["jobs", "ugc"]],
      ["Our brand is hiring", ["hiring", "brand"]],
      ["Creator opportunities: casting call for UGC", ["opportunities", "casting call", "ugc", "creator"]],
      ["Remote work opportunities for editors, apply by Friday", ["opportunities", "remote work"]],
      ["Remote opportunity for UGC creators: apply now", ["opportunity", "ugc"]],
      ["Grateful for this brand opportunity with @glow! Bucket list moment", ["opportunity", "brand"]],
    ] as const) {
      expect(fitOf(caption, "H1"), caption).toEqual(matched);
    }
  });

  it("outcome delta (AC2 finding): generic opportunity commentary leaves H1 without touching metrics or the other lanes", () => {
    // the generic posts get the strongest engagement, so a false positive would also have topped H1's resonance reading
    const s = snap([
      ...filler(6),
      { id: "g1", caption: "AI is a massive brand opportunity", saves: 400, shares: 200 },
      { id: "g2", caption: "Reels are a huge creator opportunity", saves: 300, shares: 150 },
      { id: "job", caption: "How to land your first UGC job" },
      { id: "file", caption: "My media kit template and rate card for pitching" },
    ]);
    const ev = evidenceOf(s);
    // what the analyst previously had to exclude by hand is what the rule now returns
    const byHand = evidenceOf(s, { g1: { H1: false }, g2: { H1: false } });
    const h1 = lane(ev, "H1");
    expect(eligibleIds(h1)).toEqual(["job"]);
    expect(h1.topicalFit).toMatchObject({ state: "DERIVED", nDerived: 1, nManual: 0, sessionExcluded: [] });
    expect(h1.contentResonance).toEqual(lane(byHand, "H1").contentResonance);
    for (const id of ["g1", "g2"]) expect(h1.contentResonance.aboveMedian.map((x) => x.p.post.media_id)).not.toContain(id);
    // H4 and the not-connected lanes are unchanged
    expect(lane(ev, "H4")).toEqual(lane(byHand, "H4"));
    expect(eligibleIds(lane(ev, "H4"))).toEqual(["file"]);
    for (const e of ev) {
      expect(e.audienceNeed).toEqual({ state: "NOT_CONNECTED", signals: AUDIENCE_SIGNALS });
      expect(e.commercialOutcome).toEqual({ state: "NOT_CONNECTED", signals: COMMERCIAL_SIGNALS });
    }
    // source metrics are the plain analysis of the snapshot, unchanged by any topic decision
    const analysis = analyze(s);
    for (const id of ["g1", "g2"]) {
      const p = analysis.posts.find((x) => x.post.media_id === id)!;
      expect(p.post.observations).toEqual(s.posts.find((x) => x.media_id === id)!.observations);
    }
    for (const x of [...h1.topicalFit.eligible, ...lane(ev, "H4").topicalFit.eligible]) expect(x.p).toEqual(analysis.posts.find((p) => p.post.media_id === x.p.post.media_id));
  });

  it("negative (review round 5): an app name or a distant cue does not make a routine an H4 file", () => {
    for (const caption of ["Notion changed my workflow", "I use Notion for my workflow", "Notion workflow tour: how I plan my week", "Notion vs spreadsheets", "Organizing files is my whole workflow"]) {
      expect(fitOf(caption, "H4"), caption).toEqual([]);
    }
    expect(fitOf("My Notion template for content planning", "H4")).toEqual(["template"]);
  });

  it("AC2 repair of review round 6: with no offer gate, job-market commentary is a topic; own brand opportunities stay uncertain", () => {
    for (const [caption, matched] of [
      ["Remote jobs are the future. Here's my packing list for Bali", ["jobs", "remote"]],
      ["Influencer gigs pay more than you think. Save this to your list", ["gigs", "influencer"]],
      ["Remote work opportunities changed everything for me. Vision board manifesting", ["opportunities", "remote work"]],
      ["2025 vision board: land a remote job", ["job", "remote"]],
      ["Why brands are hiring UGC creators instead of influencers in 2025", ["hiring", "brands"]],
      ["Is anyone else noticing that brands are hiring influencers less?", ["hiring", "brands"]],
      ["Brands hiring influencers without contracts is a red flag", ["hiring", "brands"]],
    ] as const) {
      expect(fitOf(caption, "H1"), caption).toEqual(matched);
    }
    // residual, as above: the author's own sponsorship or job, with no possessive/verb cue on a job noun → DERIVED, correctable
    for (const caption of [
      "Grateful for this brand opportunity with @glow! Bucket list moment",
      "Thank you @nike for this brand opportunity, finally on board with the team",
      "My first brand opportunity! Always wanted this",
      "Always wanted a remote job and now I have one",
    ]) {
      expect(topicalFit(post({ id: "r", caption }), "H1", {}), caption).toMatchObject({ eligible: true, source: "derived-keyword" });
    }
    // unchanged hiring-announcement guard: a generic subject with a later copula abstains (conservative recall miss)
    expect(fitOf("Everyone is hiring UGC creators right now and here is why", "H1")).toEqual([]);
    expect(fitOf("Opportunities list: remote work", "H1")).toEqual(["opportunities", "remote work"]);
    expect(fitOf("UGC jobs this week: 5 brands hiring creators", "H1")).toEqual(["jobs", "hiring", "ugc", "creators", "brands"]);
    expect(fitOf("Our brand is hiring", "H1")).toEqual(["hiring", "brand"]);
  });

  it("negative (review round 6): a Reels/CapCut 'template' is an edit preset, not a working file", () => {
    for (const caption of ["Tap 'Use template' to try this trend", "Use this template for your next reel", "CapCut template in bio", "Reel template", "Trend template, use the audio", "#capcut #template"]) {
      expect(fitOf(caption, "H4"), caption).toEqual([]);
    }
    expect(fitOf("My media kit template and rate card for pitching", "H4")).toEqual(["template", "media kit", "rate card"]);
  });

  it("positive (falsification round 2): real H1/H4 captions stay DERIVED candidates", () => {
    expect(fitOf("UGC jobs for creators, apply now", "H1")).toEqual(["jobs", "ugc", "creators"]);
    expect(fitOf("Brands hiring UGC creators", "H1")).toEqual(["hiring", "ugc", "creators", "brands"]);
    expect(fitOf("UGC rate card template", "H4")).toEqual(["template", "rate card"]);
    expect(fitOf("UGC rate card template", "H1")).toEqual([]);
  });

  it("negative (review round 1): Italian 'modello' (model) is not a reusable file", () => {
    expect(fitOf("Il modello di business dei creator", "H4")).toEqual([]);
    expect(fitOf("Shot on my iPhone, modello Pro", "H4")).toEqual([]);
  });

  it("positive: compact hashtags and German/Italian job wording", () => {
    expect(fitOf("New this week #ugcjobs #remotework", "H1")).toEqual(["ugcjobs"]);
    expect(fitOf("Stellenangebote für Creator: jetzt bewerben", "H1")).toEqual(["stellenangebote", "creator"]);
    expect(fitOf("Opportunità di lavoro per creator UGC, candidature entro venerdì", "H1")).toEqual(["opportunità di lavoro", "creator"]);
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
    const s = snap([...filler(6), { id: "travel", caption: "Island trip vlog" }, { id: "job", caption: "Remote jobs for creators, apply now" }]);
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

/**
 * AC2 contract repair (PO decision 2026-10-31, Confluence 108920834 v3): H1 covers specific creator/UGC/remote-work job and
 * opportunity TOPICS. A live job posting, an explicit offer signal ("apply", "deadline", …) or the absence of a how-to frame
 * is not required. A topic match is DERIVED editorial relevance only — never audience need, demand or a commercial outcome.
 */
describe("AC2 repair · H1 TOPICAL_FIT is a specific job/opportunity topic, not a live job offer", () => {
  const H1_TOPICS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["UGC jobs for creators", ["jobs", "ugc", "creators"]],
    ["How to land your first UGC job", ["job", "ugc"]],
    ["Where to find remote jobs as a creator", ["jobs", "remote"]],
    ["Brands hiring UGC creators — apply now", ["hiring", "ugc", "creators", "brands"]],
  ];

  it("positive: specific creator/UGC/remote job topics are DERIVED H1 candidates without an offer signal, also as how-to", () => {
    for (const [caption, matched] of H1_TOPICS) {
      expect(fitOf(caption, "H1"), caption).toEqual(matched);
      expect(topicalFit(post({ id: "t", caption }), "H1", {}), caption).toEqual({ hypothesis: "H1", eligible: true, source: "derived-keyword", matched });
      // an H1 topic never qualifies H4
      expect(topicalFit(post({ id: "t", caption }), "H4", {}).eligible, caption).toBe(false);
    }
  });

  it("an H1 topic moves TOPICAL_FIT only: audience need and commercial outcome stay NOT_CONNECTED, no demand field appears", () => {
    const s = snap([...filler(6), ...H1_TOPICS.map(([caption], i): Spec => ({ id: `t${i}`, caption }))]);
    const ev = evidenceOf(s);
    const h1 = lane(ev, "H1");
    expect(eligibleIds(h1)).toEqual(["t0", "t1", "t2", "t3"]);
    expect(h1.topicalFit).toMatchObject({ state: "DERIVED", nDerived: 4, nManual: 0, durableReview: "NOT_AVAILABLE" });
    expect(eligibleIds(lane(ev, "H4"))).toEqual([]);
    for (const e of ev) {
      expect(e.audienceNeed).toEqual({ state: "NOT_CONNECTED", signals: AUDIENCE_SIGNALS });
      expect(e.commercialOutcome).toEqual({ state: "NOT_CONNECTED", signals: COMMERCIAL_SIGNALS });
      for (const key of ["supporting", "contradicting", "state", "score", "demand", "lean"]) expect(Object.keys(e)).not.toContain(key);
    }
    // the resonance reading of a topic post is the plain engagement analysis, unchanged by the topic match
    const analysis = analyze(s);
    for (const x of h1.topicalFit.eligible) expect(x.p).toEqual(analysis.posts.find((p) => p.post.media_id === x.p.post.media_id));
  });

  it("negative: generic creator/travel, praise, the author's own former job, a travel 'opportunity' and a negation are not H1", () => {
    for (const caption of ["Day in the life of a UGC creator", "Sunset in Bali", "Great job creators!", "I quit my remote job", "Remote opportunity to travel", "Not a UGC job, just a holiday"]) {
      expect(fitOf(caption, "H1"), caption).toEqual([]);
      expect(topicalFit(post({ id: "n", caption }), "H1", {}), caption).toMatchObject({ eligible: false, source: "unclassified" });
    }
  });

  it("ambiguous: missing or unclear captions stay UNCLASSIFIED; an uncertain DERIVED topic stays visibly correctable per session", () => {
    expect(topicalFit(post({ id: "m", caption: null }), "H1", {})).toEqual({ hypothesis: "H1", eligible: false, source: "unclassified", matched: [] });
    expect(topicalFit(post({ id: "u", caption: "Big news soon 👀" }), "H1", {})).toEqual({ hypothesis: "H1", eligible: false, source: "unclassified", matched: [] });
    const howTo = post({ id: "h", caption: "How to land your first UGC job" });
    expect(topicalFit(howTo, "H1", { h: { H1: false } })).toEqual({ hypothesis: "H1", eligible: false, source: "manual-session", matched: ["job", "ugc"] });
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
  const job = (id: string, extra: Partial<Spec> = {}): Spec => ({ id, caption: "Remote jobs for creators, apply now", ...extra });

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

describe("AC4 · review round 3: format skew is read on the posts the median comes from", () => {
  it("a mixed eligible set whose indexed posts are 6 Reels and 1 Feed post discloses format-skew", () => {
    const specs: Spec[] = [
      ...filler(6),
      ...filler(6, "image", "feedfill"),
      ...Array.from({ length: 6 }, (_, i): Spec => ({ id: `rt${i}`, caption: "Checklist template for pitches" })),
      ...Array.from({ length: 6 }, (_, i): Spec => ({ id: `ft${i}`, caption: "Checklist template for pitches", format: "image", saves: i === 0 ? 30 : null })),
    ];
    const h4 = lane(evidenceOf(snap(specs)), "H4");
    expect(h4.contentResonance.nEligible).toBe(12);
    expect(h4.contentResonance.nIndexed).toBe(7);
    expect(h4.contentResonance.limitations).toContain("format-skew");
  });

  it("review round 4: indexed posts that are all one format, in a mixed eligible set, still disclose format-skew", () => {
    const specs: Spec[] = [
      ...filler(6),
      ...filler(6, "image", "feedfill"),
      ...Array.from({ length: 6 }, (_, i): Spec => ({ id: `rt${i}`, caption: "Checklist template for pitches" })),
      ...Array.from({ length: 6 }, (_, i): Spec => ({ id: `ft${i}`, caption: "Checklist template for pitches", format: "image", days: 3 })),
    ];
    const h4 = lane(evidenceOf(snap(specs)), "H4");
    expect(h4.contentResonance.nIndexed).toBe(6);
    expect(h4.contentResonance.limitations).toContain("format-skew");
  });
});

describe("AC4 · H1-only vs H4-only comparison is descriptive, absolute and never a product lean", () => {
  /** Synthetic analysis with chosen indices: only the comparison arithmetic is under test here. */
  function withIndices(h1: number[], h4: number[], both: number[] = []): HypothesisEvidence[] {
    const mk = (id: string, caption: string, idx: number): PostAnalysis => ({ ...analyze(snap([{ id, caption }])).posts[0]!, excluded: null, contentActionIndex: idx });
    const posts = [
      ...h1.map((v, i) => mk(`a${i}`, "UGC jobs for creators, apply now", v)),
      ...h4.map((v, i) => mk(`b${i}`, "My checklist template", v)),
      ...both.map((v, i) => mk(`c${i}`, "Remote jobs plus checklist template, apply now", v)),
    ];
    const analysis: Analysis = { observedAt: OBSERVED, groups: [], posts };
    return hypothesisEvidence(analysis, ruleFit());
  }

  it("needs MIN_PATTERN_GROUP_N disjoint posts on each side; overlap is excluded and counted once", () => {
    expect(engagementComparison(withIndices(Array(7).fill(1.5), Array(8).fill(1), [2, 2]))).toEqual({ state: "INSUFFICIENT_EVIDENCE", nH1Only: 7, nH4Only: 8, nBoth: 2, medianH1Only: null, medianH4Only: null, difference: null, limitations: ["lifetime-accrual", "single-snapshot", "maturity-not-age-matched", "no-causality"] });
  });

  it("review round 3: the comparison discloses format skew and unequal ages between the two disjoint groups", () => {
    const mk = (id: string, caption: string, format: PostFormat, days: number, idx: number): PostAnalysis => ({ ...analyze(snap([{ id, caption, format, days }])).posts[0]!, excluded: null, contentActionIndex: idx });
    const posts = [
      ...Array.from({ length: 8 }, (_, i) => mk(`r${i}`, "UGC jobs for creators, apply now", "reel", 8 + (i % 3), 1.3)),
      ...Array.from({ length: 8 }, (_, i) => mk(`f${i}`, "My checklist template", "image", 150 + i * 20, 1)),
    ];
    const c = engagementComparison(hypothesisEvidence({ observedAt: OBSERVED, groups: [], posts }, ruleFit()));
    expect(c.state).toBe("DESCRIPTIVE");
    expect(c.limitations).toEqual(expect.arrayContaining(["format-mix", "unequal-ages"]));
    const stale = engagementComparison(hypothesisEvidence({ observedAt: OBSERVED, groups: [], posts }, ruleFit(), { stale: true }));
    expect(stale.limitations).toContain("stale-snapshot");
  });

  it("review round 4: format-mix does not depend on post order", () => {
    const mk = (id: string, caption: string, format: PostFormat, idx: number): PostAnalysis => ({ ...analyze(snap([{ id, caption, format }])).posts[0]!, excluded: null, contentActionIndex: idx });
    const h1 = Array.from({ length: 8 }, (_, i) => mk(`a${i}`, "UGC jobs for creators, apply now", i % 2 ? "image" : "reel", 1.2));
    const h4 = Array.from({ length: 8 }, (_, i) => mk(`b${i}`, "My checklist template", "reel", 1));
    for (const posts of [[...h1, ...h4], [...[...h1].reverse(), ...h4]]) {
      expect(engagementComparison(hypothesisEvidence({ observedAt: OBSERVED, groups: [], posts }, ruleFit())).limitations).toContain("format-mix");
    }
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
