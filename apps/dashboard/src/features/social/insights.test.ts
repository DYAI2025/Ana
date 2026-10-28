// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../../e2e/fake-social/core.mjs";
import { normalizeSnapshot } from "@/server/social/normalize";
import { analyze, heroReading, hiddenWinner, mapGroups, MATURE_AGE_DAYS, median, MIN_GROUP_N, practicalValueFamily, reuseCandidate, type ThemeOf } from "./insights";
import { COMMERCIAL_SIGNALS, HYPOTHESES, hypothesisSignals, nextTest, themeSignals, type FamilyOf } from "./offers";
import { assignTheme, deriveThemes } from "./themes";
import type { Observation, SocialSnapshot } from "./types";

const snapshot = normalizeSnapshot(buildSnapshot());
const analysis = analyze(snapshot);
const themesOf: ThemeOf = (post) => deriveThemes(post.caption).themes;
const familiesOf: FamilyOf = (post) => deriveThemes(post.caption).families;
const byId = (id: string) => analysis.posts.find((p) => p.post.media_id === id)!;
const ids = (ps: { post: { media_id: string } }[]) => ps.map((p) => p.post.media_id);

/** Marks every observation of `metric` UNAVAILABLE on the posts matched by `which`. */
function withoutMetric(s: SocialSnapshot, metric: Observation["metric_name"], which: (id: string) => boolean): SocialSnapshot {
  return {
    ...s,
    posts: s.posts.map((p) =>
      which(p.media_id) ? { ...p, observations: p.observations.map((o) => (o.metric_name === metric ? { ...o, value: null, availability_state: "UNAVAILABLE" as const } : o)) } : p,
    ),
  };
}

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("analyze — transparent rates, same-format groups, age disclosure", () => {
  it("computes rates per reached account only from VERIFIED inputs", () => {
    const p = byId("syn004"); // reach 2100, saved 88, shares 52, comments 7
    expect(p.rates.saves_per_reach).toBeCloseTo(88 / 2100, 10);
    expect(p.rates.shares_per_reach).toBeCloseTo(52 / 2100, 10);
    expect(p.rates.comments_per_reach).toBeCloseTo(7 / 2100, 10);
    expect(p.rates.high_intent_rate).toBeCloseTo(140 / 2100, 10);
  });

  it("excludes posts without insights, younger than the maturity age, and never divides by zero", () => {
    expect(byId("syn025").excluded).toBe("no-insights");
    expect(byId("syn000").excluded).toBe("too-young"); // 2 days old
    expect(byId("syn001").excluded).toBe("too-young"); // 5 days old
    expect(MATURE_AGE_DAYS).toBe(7);
    const zero: SocialSnapshot = { ...snapshot, posts: [{ ...snapshot.posts[2]!, observations: snapshot.posts[2]!.observations.map((o) => (o.metric_name === "reach" ? { ...o, value: 0 } : o)) }] };
    const z = analyze(zero).posts[0]!;
    expect(z.excluded).toBe("zero-reach");
    expect(z.rates.high_intent_rate).toBeNull();
    expect(z.reachIndex).toBeNull();
  });

  it("never mixes formats: each format has its own group, small groups get no index", () => {
    const reel = analysis.groups.find((g) => g.format === "reel")!;
    expect(reel).toMatchObject({ n: 18, nHighIntent: 18, nSaves: 18, medianReach: 3250 });
    expect(analysis.groups.find((g) => g.format === "image")!.n).toBeLessThan(MIN_GROUP_N);
    expect(byId("syn023").excluded).toBe("small-group");
    expect(byId("syn023").reachIndex).toBeNull();
    expect(byId("syn002").reachIndex).toBeCloseTo(5200 / 3250, 10);
  });

  it("a VIDEO without product type is unknown and never compared (Reels and feed videos cannot be told apart)", () => {
    const s: SocialSnapshot = { ...snapshot, posts: snapshot.posts.map((p) => (p.media_id === "syn002" ? { ...p, format: "unknown" as const } : p)) };
    const a = analyze(s);
    expect(a.posts.find((p) => p.post.media_id === "syn002")!.excluded).toBe("unknown-format");
    expect(a.groups.some((g) => g.format === "unknown")).toBe(false);
  });

  it("the high-intent index needs its own population of MIN_GROUP_N posts with verified saves and shares", () => {
    // 18 reels keep verified reach, but only 4 keep verified saves
    const keep = new Set(["syn002", "syn003", "syn004", "syn005"]);
    const a = analyze(withoutMetric(snapshot, "saves", (id) => !keep.has(id)));
    const reel = a.groups.find((g) => g.format === "reel")!;
    expect(reel.n).toBe(18);
    expect(reel.nHighIntent).toBe(4);
    expect(a.posts.every((p) => p.highIntentIndex === null)).toBe(true);
    expect(a.posts.find((p) => p.post.media_id === "syn002")!.reachIndex).not.toBeNull(); // reach baseline unaffected
  });

  it("the map only offers formats with a baseline on both axes (never an empty CONNECTED map)", () => {
    expect(mapGroups(analysis).map((g) => g.format)).toEqual(["reel"]);
    const keep = new Set(["syn002", "syn003", "syn004", "syn005"]);
    expect(mapGroups(analyze(withoutMetric(snapshot, "saves", (id) => !keep.has(id))))).toEqual([]);
  });

  it("hero = newest mature post with a same-format baseline", () => {
    const hero = heroReading(analysis)!;
    expect(hero.post.post.media_id).toBe("syn002"); // syn000/syn001 are too young
    expect(hero.group).toMatchObject({ format: "reel", n: 18 });
  });
});

describe("pattern observations — evidence-bound or INSUFFICIENT_EVIDENCE", () => {
  it("names the hidden winner with sample, window, formula, comparator, counterexamples and limits", () => {
    const r = hiddenWinner(analysis);
    expect(r.state).toBe("OBSERVED");
    if (r.state !== "OBSERVED") return;
    expect(r.evidence.subject).toEqual({ type: "post", mediaId: "syn004" });
    expect(r.evidence.sampleN).toBe(18);
    expect(r.evidence.comparator).toEqual({ kind: "format-median", n: 18, format: "reel" });
    expect(r.evidence.formula).toBe("high-intent-index");
    expect(r.evidence.index).toBeGreaterThanOrEqual(1.5);
    expect(r.evidence.counterexamples.length).toBeGreaterThan(0);
    expect(r.evidence.limitations).toContain("no-causality");
    expect(new Date(r.evidence.window.from) < new Date(r.evidence.window.to)).toBe(true);
  });

  it("the hidden-winner sample is the posts compared on both axes, not every post with reach", () => {
    // 18 reels with reach, but saves/shares verified on only 6 of them: below MIN_PATTERN_GROUP_N
    const keep = new Set(["syn002", "syn003", "syn004", "syn005", "syn006", "syn007"]);
    expect(hiddenWinner(analyze(withoutMetric(snapshot, "shares", (id) => !keep.has(id))))).toEqual({ state: "INSUFFICIENT_EVIDENCE", kind: "hidden-winner", reason: "no-large-group" });
  });

  it("does not manufacture findings from a thin sample", () => {
    const thin = analyze(normalizeSnapshot(buildSnapshot({ count: 6 })));
    expect(hiddenWinner(thin)).toMatchObject({ state: "INSUFFICIENT_EVIDENCE" });
    expect(practicalValueFamily(thin, themesOf)).toMatchObject({ state: "INSUFFICIENT_EVIDENCE" });
    expect(reuseCandidate(thin, themesOf)).toMatchObject({ state: "INSUFFICIENT_EVIDENCE" });
  });

  it("practical-value family uses within-format saves indices (format mix cannot create it) and is pinned for the fixture", () => {
    const r = practicalValueFamily(analysis, themesOf);
    expect(r.state).toBe("OBSERVED");
    if (r.state !== "OBSERVED") return;
    expect(r.evidence.subject).toEqual({ type: "theme", theme: "money" });
    expect(r.evidence.formula).toBe("theme-saves-index");
    expect(r.evidence.comparator).toEqual({ kind: "within-format-medians", n: 5 });
    expect(r.evidence.index).toBeCloseTo(2.398, 3);
    expect(r.evidence.limitations).toContain("derived-themes");
    // every source post was compared against its own format's median
    expect(r.evidence.sourcePosts.every((id) => byId(id).savesIndex !== null)).toBe(true);
  });

  it("reuse candidate is pinned for the fixture", () => {
    const r = reuseCandidate(analysis, themesOf);
    expect(r.state).toBe("OBSERVED");
    if (r.state === "OBSERVED") {
      expect(r.evidence.subject).toEqual({ type: "theme", theme: "opportunities" });
      expect(r.evidence.index).toBeCloseTo(1.2615, 3);
    }
  });
});

describe("themes — derived suggestions with provenance, overridable per session", () => {
  it("matches generic keywords on word boundaries, separates opportunity from practical-file vocabulary", () => {
    expect(deriveThemes("UGC rates template: step by step guide for creators")).toEqual({
      themes: ["creator", "money", "opportunities"],
      families: ["creator", "money", "practical"],
      source: "derived-keyword",
      matched: ["ugc", "rates", "template", "guide", "step by step"],
    });
    expect(deriveThemes("Remote job opportunities: apply now").families).toEqual(["opportunity"]);
    expect(deriveThemes("brandnew")).toEqual({ themes: [], families: [], source: "unclassified", matched: [] });
    expect(deriveThemes(null).source).toBe("unclassified");
  });

  it("a save call to action is not a theme keyword (it moves the saves numerator itself)", () => {
    expect(deriveThemes("save this").source).toBe("unclassified");
  });

  it("a manual session override replaces the derived suggestion and says so", () => {
    const post = snapshot.posts[4]!;
    expect(assignTheme(post, { [post.media_id]: ["personal"] })).toEqual({ themes: ["personal"], families: ["personal"], source: "manual-session", matched: [] });
    expect(assignTheme(post, { [post.media_id]: ["opportunities"] }).families).toEqual(["opportunity", "practical"]);
    expect(assignTheme(post, {}).source).toBe("derived-keyword");
  });
});

describe("Substack offer signals — hypotheses stay hypotheses", () => {
  const signals = hypothesisSignals(analysis, familiesOf);
  const h1 = signals.find((s) => s.hypothesis.id === "H1")!;
  const h4 = signals.find((s) => s.hypothesis.id === "H4")!;

  it("H1 and H4 are candidates on disjoint keyword families; H2 and H3 parked", () => {
    expect(HYPOTHESES.map((h) => [h.id, h.status])).toEqual([["H1", "candidate"], ["H2", "parked"], ["H3", "parked"], ["H4", "candidate"]]);
    expect(h1.hypothesis.families.filter((f) => h4.hypothesis.families.includes(f))).toEqual([]);
  });

  it("splits mapped posts into supporting (index > 1) and contradicting (< 1) — exact for the fixture", () => {
    expect(ids(h1.supporting)).toEqual(["syn002", "syn008", "syn003", "syn005"]);
    expect(ids(h1.contradicting)).toEqual(["syn019", "syn017", "syn009", "syn011", "syn014"]);
    expect(h4.supporting).toHaveLength(6);
    expect(ids(h4.contradicting)).toEqual(["syn009", "syn014", "syn006"]);
    for (const s of signals) {
      expect(s.supporting.every((p) => p.highIntentIndex! > 1)).toBe(true);
      expect(s.contradicting.every((p) => p.highIntentIndex! < 1)).toBe(true);
    }
  });

  it("a post exactly at the median supports nothing", () => {
    const at1 = { ...analysis, posts: analysis.posts.map((p) => (p.post.media_id === "syn002" ? { ...p, highIntentIndex: 1 } : p)) };
    const s = hypothesisSignals(at1, familiesOf).find((x) => x.hypothesis.id === "H1")!;
    expect(ids(s.supporting)).not.toContain("syn002");
    expect(ids(s.contradicting)).not.toContain("syn002");
  });

  it("the lean uses disjoint posts only and needs MIN_PATTERN_GROUP_N on each side", () => {
    // 9 mapped each, 3 shared → 6 disjoint each: no lean
    expect(nextTest(signals)).toEqual({ lean: null, state: "INSUFFICIENT_EVIDENCE", nH1: 6, nH4: 6 });
  });

  it("theme signals: within-format indices, and no value below MIN_THEME_N", () => {
    const t = themeSignals(analysis, themesOf);
    expect(t.map((x) => x.theme)).toEqual(["travel", "creator", "money", "personal", "opportunities"]);
    expect(t.find((x) => x.theme === "money")).toMatchObject({ n: 5, state: "SIGNAL" });
    const thin = themeSignals(analyze(normalizeSnapshot(buildSnapshot({ count: 8 }))), themesOf);
    for (const x of thin.filter((y) => y.n < 3)) expect(x).toMatchObject({ state: "INSUFFICIENT_EVIDENCE", medianSavesIndex: null, medianSharesIndex: null, medianHighIntentIndex: null });
  });

  it("commercial outcomes are named so the UI can show them as NOT_CONNECTED", () => {
    expect(COMMERCIAL_SIGNALS).toEqual(["substack-registrations", "paid-subscribers", "link-clicks", "sales"]);
  });
});
