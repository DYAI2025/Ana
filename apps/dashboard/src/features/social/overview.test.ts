// @vitest-environment node
/**
 * ANA-60 — Reel rates overview. Expected values are computed by hand from e2e/fake-social/core.mjs (synthetic only):
 * likes = round(reach × 0.05) + (index mod 5) × 9; categories from e2e/fake-social/tags.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../../e2e/fake-social/core.mjs";
import { normalizeSnapshot } from "@/server/social/normalize";
import { parseTags } from "@/features/world/postTags";
import { analyze, MATURE_AGE_DAYS, patternObservations, type ThemeOf } from "./insights";
import { hypothesisSignals, nextTest, themeSignals, type FamilyOf } from "./offers";
import { categoryOf, categoryOptions, distributionOf, filterRows, MIN_CATEGORY_N, NO_FILTERS, perHundred, sortRows, summarize } from "./overview";
import { assignTheme } from "./themes";
import type { Observation, SocialCategories, SocialSnapshot } from "./types";

const snapshot = normalizeSnapshot(buildSnapshot());
const analysis = analyze(snapshot);
const byId = (id: string) => analysis.posts.find((p) => p.post.media_id === id)!;
const ids = (ps: { post: { media_id: string } }[]) => ps.map((p) => p.post.media_id);

/** the stored synthetic categories, read through the same check as the real store (parseTags) */
const stored = JSON.parse(readFileSync(path.join(__dirname, "../../../e2e/fake-social/tags.json"), "utf8")) as { tags: Record<string, unknown> };
const categories: SocialCategories = {
  state: "on",
  tags: Object.fromEntries(
    Object.entries(stored.tags).flatMap(([id, raw]) => {
      const t = parseTags(raw);
      return t ? [[id, { theme: t.theme, confidence: t.confidence }]] : [];
    }),
  ),
};
const OFF: SocialCategories = { state: "off", tags: {} };

function withMetric(s: SocialSnapshot, id: string, metric: Observation["metric_name"], patch: Partial<Observation>): SocialSnapshot {
  return { ...s, posts: s.posts.map((p) => (p.media_id === id ? { ...p, observations: p.observations.map((o) => (o.metric_name === metric ? { ...o, ...patch } : o)) } : p)) };
}

describe("AC-1 · the four rates of a row", () => {
  it("are counter ÷ reach from VERIFIED inputs, exactly", () => {
    const p = byId("syn004"); // reach 2100, likes 105 + 36, shares 52, saved 88, comments 7
    expect(p.rates.likes_per_reach).toBe(141 / 2100);
    expect(p.rates.shares_per_reach).toBe(52 / 2100);
    expect(p.rates.saves_per_reach).toBe(88 / 2100);
    expect(p.rates.comments_per_reach).toBe(7 / 2100);
    const q = byId("syn024"); // image: reach 1100, likes 55 + 36
    expect(q.rates.likes_per_reach).toBe(91 / 1100);
  });

  it("a missing counter or a missing reach gives no rate (null), never 0", () => {
    const noLikes = analyze(withMetric(snapshot, "syn004", "likes", { value: null, availability_state: "UNAVAILABLE" }));
    const p = noLikes.posts.find((x) => x.post.media_id === "syn004")!;
    expect(p.rates.likes_per_reach).toBeNull();
    expect(p.rates.shares_per_reach).toBe(52 / 2100);
    const noReach = analyze(withMetric(snapshot, "syn004", "reach", { value: null, availability_state: "ERROR" })).posts.find((x) => x.post.media_id === "syn004")!;
    for (const r of ["likes_per_reach", "shares_per_reach", "saves_per_reach", "comments_per_reach"] as const) expect(noReach.rates[r]).toBeNull();
    // not fetched by the worker (budget): no rate at all
    expect(byId("syn025").rates.likes_per_reach).toBeNull();
  });

  it("reach 0 gives no rate (zero denominator), never 0 or Infinity", () => {
    const zero = analyze(withMetric(snapshot, "syn004", "reach", { value: 0 })).posts.find((x) => x.post.media_id === "syn004")!;
    for (const r of ["likes_per_reach", "shares_per_reach", "saves_per_reach", "comments_per_reach"] as const) expect(zero.rates[r]).toBeNull();
  });

  it("plain words: x of 100 with one decimal", () => {
    expect(perHundred(141 / 2100)).toBe(6.7);
    expect(perHundred(52 / 2100)).toBe(2.5);
    expect(perHundred(0.05)).toBe(5);
  });
});

describe("AC-2 · the category is the Haiku theme from confidence 0.5 on", () => {
  it("a confident reading is the category; exactly 0.5 counts", () => {
    expect(categoryOf("syn004", categories)).toEqual({ kind: "theme", theme: "lifestyle" });
    expect(categoryOf("syn020", categories)).toEqual({ kind: "theme", theme: "lifestyle" }); // confidence 0.5
  });

  it("below 0.5, an invalid record or no reading is 'not categorised'", () => {
    expect(categoryOf("syn008", categories)).toEqual({ kind: "uncategorised" }); // 0.3
    expect(categoryOf("syn013", categories)).toEqual({ kind: "uncategorised" }); // theme off the list: dropped by parseTags
    expect(categoryOf("syn001", categories)).toEqual({ kind: "uncategorised" }); // never read
    expect(categoryOf("syn004", { state: "on", tags: { syn004: { theme: "beach", confidence: 0.49 } } })).toEqual({ kind: "uncategorised" });
  });

  it("tagger off, or no categories from the server, is 'category not available' for every post", () => {
    expect(categoryOf("syn004", OFF)).toEqual({ kind: "unavailable" });
    expect(categoryOf("syn004", null)).toEqual({ kind: "unavailable" });
    expect(categoryOptions(analysis.posts, OFF)).toEqual([]);
    expect(summarize(analysis.posts, OFF)).toEqual([]);
  });

  it("filter options are only themes that occur, in catalogue order, then 'not categorised'", () => {
    expect(categoryOptions(analysis.posts, categories)).toEqual(["beach", "city", "stay", "transport", "friends", "lifestyle", "uncategorised"]);
  });
});

describe("AC-3 · sorting and filters", () => {
  it("default is date, newest first", () => {
    const sorted = sortRows(analysis.posts, "date", "desc");
    expect(ids(sorted).slice(0, 3)).toEqual(["syn000", "syn001", "syn002"]);
    expect(ids(sorted).at(-1)).toBe("syn027");
  });

  it("by a rate: highest first, and the posts without that rate always last (both directions)", () => {
    const desc = sortRows(analysis.posts, "likes_per_reach", "desc");
    expect(ids(desc).slice(0, 4)).toEqual(["syn024", "syn023", "syn004", "syn019"]);
    expect(ids(desc).slice(-3)).toEqual(["syn025", "syn026", "syn027"]);
    const asc = sortRows(analysis.posts, "likes_per_reach", "asc");
    // equal rates (5.00%) keep newest first
    expect(ids(asc).slice(0, 4)).toEqual(["syn000", "syn020", "syn005", "syn010"]);
    expect(ids(asc).slice(-3)).toEqual(["syn025", "syn026", "syn027"]);
    expect(ids(sortRows(analysis.posts, "shares_per_reach", "desc")).slice(0, 3)).toEqual(["syn004", "syn010", "syn018"]);
    expect(ids(sortRows(analysis.posts, "reach", "desc")).slice(0, 2)).toEqual(["syn005", "syn011"]);
    expect(ids(sortRows(analysis.posts, "reach", "asc")).slice(-3)).toEqual(["syn025", "syn026", "syn027"]);
  });

  it("category, format and feed/trial filters combine", () => {
    const reelsLifestyle = filterRows(analysis.posts, { ...NO_FILTERS, category: "lifestyle", format: "reel" }, categories);
    expect(ids(reelsLifestyle)).toEqual(["syn000", "syn002", "syn004", "syn006", "syn010", "syn016", "syn018"]);
    expect(ids(filterRows(analysis.posts, { ...NO_FILTERS, distribution: "trial" }, categories))).toEqual(["syn001"]);
    expect(ids(filterRows(analysis.posts, { ...NO_FILTERS, distribution: "trial", category: "uncategorised" }, categories))).toEqual(["syn001"]);
    expect(filterRows(analysis.posts, { ...NO_FILTERS, distribution: "trial", category: "lifestyle" }, categories)).toHaveLength(0);
    // photos and carousels are feed posts; Reels without Meta's flag are "unknown"
    expect(ids(filterRows(analysis.posts, { ...NO_FILTERS, distribution: "feed" }, categories))).toEqual(["syn020", "syn021", "syn022", "syn023", "syn024"]);
    expect(distributionOf(byId("syn002"))).toBe("unknown");
    expect(filterRows(analysis.posts, { ...NO_FILTERS, category: "uncategorised" }, categories)).toHaveLength(10);
  });
});

describe("AC-4 · category summary over the filtered rows", () => {
  const summary = summarize(analysis.posts, categories);
  const of = (k: string) => summary.find((s) => s.key === k)!;

  it("n and the median of each rate per category, largest category first", () => {
    expect(summary.map((s) => [s.key, s.n])).toEqual([
      ["uncategorised", 10],
      ["lifestyle", 8],
      ["beach", 3],
      ["friends", 3],
      ["city", 2],
      ["stay", 1],
      ["transport", 1],
    ]);
    // beach: syn005 (6100: likes 305 + 0), syn011 (5600: 280 + 9), syn024 (1100: 55 + 36)
    expect(of("beach").rates.likes_per_reach).toEqual({ n: 3, median: 289 / 5600 });
    expect(of("beach").rates.shares_per_reach).toEqual({ n: 3, median: 18 / 5600 });
    expect(of("beach").rates.saves_per_reach).toEqual({ n: 3, median: 9 / 1100 });
    expect(of("beach").rates.comments_per_reach).toEqual({ n: 3, median: 11 / 5600 });
    // lifestyle has an even n = 8: the mean of the two middle values
    expect(of("lifestyle").rates.comments_per_reach.n).toBe(8);
    // uncategorised: 10 posts, 3 of them without insights, so each rate rests on 7
    expect(of("uncategorised").rates.likes_per_reach.n).toBe(7);
  });

  it("below n = 3 no median: the UI says 'too few posts'", () => {
    expect(MIN_CATEGORY_N).toBe(3);
    expect(of("city").rates.likes_per_reach).toEqual({ n: 2, median: null });
    expect(of("stay").rates.saves_per_reach).toEqual({ n: 1, median: null });
  });

  it("names the formats of every population (never mixed silently)", () => {
    expect(of("beach").formats).toEqual([
      { format: "reel", n: 2 },
      { format: "image", n: 1 },
    ]);
    expect(of("friends").formats).toEqual([{ format: "reel", n: 3 }]);
  });

  it("follows the filters: only the rows shown are summarised", () => {
    const reels = summarize(filterRows(analysis.posts, { ...NO_FILTERS, format: "reel" }, categories), categories);
    expect(reels.find((s) => s.key === "beach")).toMatchObject({ n: 2, rates: { likes_per_reach: { n: 2, median: null } } });
    expect(reels.find((s) => s.key === "lifestyle")?.formats).toEqual([{ format: "reel", n: 7 }]);
  });
});

describe("AC-5 · posts younger than 7 days are 'still growing'", () => {
  it("marks exactly the young posts and counts them in the summary", () => {
    expect(MATURE_AGE_DAYS).toBe(7);
    expect(ids(analysis.posts.filter((p) => p.ageDays !== null && !p.mature))).toEqual(["syn000", "syn001"]);
    const summary = summarize(analysis.posts, categories);
    expect(summary.find((s) => s.key === "lifestyle")?.young).toBe(1);
    expect(summary.find((s) => s.key === "beach")?.young).toBe(0);
  });
});

describe("AC-6 · Patterns and Offer Signals are unchanged on the identical fixture", () => {
  it("match the baseline recorded on main before this change (52f33ef)", () => {
    const themeOf: ThemeOf = (p) => assignTheme(p, {}).themes;
    const familyOf: FamilyOf = (p) => assignTheme(p, {}).families;
    const now = { patterns: patternObservations(analysis, themeOf), themes: themeSignals(analysis, themeOf), hypotheses: hypothesisSignals(analysis, familyOf), next: nextTest(hypothesisSignals(analysis, familyOf)) };
    const compact = JSON.parse(JSON.stringify(now, (_k, v) => (v && typeof v === "object" && v.post && typeof v.post.media_id === "string" ? v.post.media_id : v)));
    const baseline = JSON.parse(readFileSync(path.join(__dirname, "__fixtures__/patterns-baseline.json"), "utf8"));
    expect(compact).toEqual(baseline);
  });
});
