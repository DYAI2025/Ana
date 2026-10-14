// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../../e2e/fake-social/core.mjs";
import { normalizeSnapshot } from "@/server/social/normalize";
import { analyze, heroReading, hiddenWinner, MATURE_AGE_DAYS, median, MIN_GROUP_N, practicalValueFamily, reuseCandidate, type ThemeOf } from "./insights";
import { COMMERCIAL_SIGNALS, HYPOTHESES, hypothesisSignals, nextTest, themeSignals } from "./offers";
import { assignTheme, deriveThemes } from "./themes";
import type { SocialSnapshot } from "./types";

const snapshot = normalizeSnapshot(buildSnapshot());
const analysis = analyze(snapshot);
const derived: ThemeOf = (post) => deriveThemes(post.caption).themes;
const byId = (id: string) => analysis.posts.find((p) => p.post.media_id === id)!;

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
    expect(reel.n).toBe(18); // 20 reels with insights − 2 too young
    expect(reel.medianReach).toBe(3250);
    const image = analysis.groups.find((g) => g.format === "image")!;
    expect(image.n).toBeLessThan(MIN_GROUP_N);
    expect(byId("syn023").excluded).toBe("small-group");
    expect(byId("syn023").reachIndex).toBeNull();
    expect(byId("syn002").reachIndex).toBeCloseTo(5200 / 3250, 10);
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
    expect(r.evidence.comparator).toBe("median of 18 mature reel posts");
    expect(r.evidence.formula).toBe("(saves + shares) ÷ reach ÷ median");
    expect(r.evidence.index).toBeGreaterThanOrEqual(1.5);
    expect(r.evidence.counterexamples.length).toBeGreaterThan(0);
    expect(r.evidence.limitations).toContain("no-causality");
    expect(new Date(r.evidence.window.from) < new Date(r.evidence.window.to)).toBe(true);
  });

  it("does not manufacture findings from a thin sample", () => {
    const thin = analyze(normalizeSnapshot(buildSnapshot({ count: 6 })));
    expect(hiddenWinner(thin)).toMatchObject({ state: "INSUFFICIENT_EVIDENCE" });
    expect(practicalValueFamily(thin, derived)).toMatchObject({ state: "INSUFFICIENT_EVIDENCE" });
    expect(reuseCandidate(thin, derived)).toMatchObject({ state: "INSUFFICIENT_EVIDENCE" });
  });

  it("practical-value family is labelled as resting on derived themes", () => {
    const r = practicalValueFamily(analysis, derived);
    if (r.state === "OBSERVED") expect(r.evidence.limitations).toContain("derived-themes");
    else expect(["few-themes", "below-threshold"]).toContain(r.reason);
  });
});

describe("themes — derived suggestions with provenance, overridable per session", () => {
  it("matches generic keywords on word boundaries and reports what matched", () => {
    expect(deriveThemes("UGC rates template: step by step guide for creators")).toEqual({
      themes: ["creator", "money", "opportunities"],
      source: "derived-keyword",
      matched: ["ugc", "rates", "template", "guide", "step by step"],
    });
    expect(deriveThemes("brandnew")).toEqual({ themes: [], source: "unclassified", matched: [] });
    expect(deriveThemes(null).source).toBe("unclassified");
  });

  it("a manual session override replaces the derived suggestion and says so", () => {
    const post = snapshot.posts[4]!;
    expect(assignTheme(post, { [post.media_id]: ["personal"] })).toEqual({ themes: ["personal"], source: "manual-session", matched: [] });
    expect(assignTheme(post, {}).source).toBe("derived-keyword");
  });
});

describe("Substack offer signals — hypotheses stay hypotheses", () => {
  it("H1 and H4 are candidates, H2 and H3 parked", () => {
    expect(HYPOTHESES.map((h) => [h.id, h.status])).toEqual([["H1", "candidate"], ["H2", "parked"], ["H3", "parked"], ["H4", "candidate"]]);
  });

  it("splits mapped posts into supporting (index ≥ 1) and contradicting (< 1)", () => {
    const signals = hypothesisSignals(analysis, derived);
    expect(signals.map((s) => s.hypothesis.id)).toEqual(["H1", "H4"]);
    for (const s of signals) {
      expect(s.supporting.every((p) => p.highIntentIndex! >= 1)).toBe(true);
      expect(s.contradicting.every((p) => p.highIntentIndex! < 1)).toBe(true);
      expect(s.supporting.length + s.contradicting.length).toBe(s.mapped.length);
    }
  });

  it("theme signals carry n and medians per theme", () => {
    const t = themeSignals(analysis, derived);
    expect(t.map((x) => x.theme)).toEqual(["travel", "creator", "money", "personal", "opportunities"]);
    expect(t.every((x) => x.n === 0 ? x.medianSavesPerReach === null : x.medianSavesPerReach !== null)).toBe(true);
  });

  it("the next test is INSUFFICIENT_EVIDENCE without signals on both hypotheses", () => {
    const thin = analyze(normalizeSnapshot(buildSnapshot({ count: 4 })));
    expect(nextTest(hypothesisSignals(thin, derived))).toEqual({ lean: null, state: "INSUFFICIENT_EVIDENCE" });
    expect(nextTest(hypothesisSignals(analysis, derived)).state).toBe("READY");
  });

  it("commercial outcomes are named so the UI can show them as NOT_CONNECTED", () => {
    expect(COMMERCIAL_SIGNALS).toEqual(["substack-registrations", "paid-subscribers", "link-clicks", "sales"]);
  });
});
