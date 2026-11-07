import { describe, expect, it } from "vitest";
import type { WorldPost } from "./model";
import type { PostTags } from "./postTags";
import { captionKey, clearSignals, LAB_MIN_AGE_DAYS, pairState, pairSummary, reelPairs, strangerSignals, type StrangerRow } from "./trialLab";

const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const ago = (days: number, minutes = 0) => new Date(NOW - days * 86_400_000 - minutes * 60_000).toISOString();

const reel = (id: string, trial: boolean | null, published: string, caption: string | null, reach: number | null, er: number | null): WorldPost => ({
  id, format: "reel", caption, permalink: null, published_at: published, reach, views: null, saves: null, shares: null, interactions: null,
  likes: null, comments: null, counters_at: null, er, ssr: null, fresh: false, trial,
});
const tag = (theme: PostTags["theme"], hook: PostTags["hook"], confidence = 0.9): PostTags => ({ theme, ana: "face", shot: "selfie", hook, cta: "none", mood: "funny", country: null, brand: false, confidence });

describe("trial lab — pairs", () => {
  it("matches captions on their start, without case, accents, emoji or punctuation", () => {
    expect(captionKey("It’s time 🤓")).toBe(captionKey("its TIME!!"));
    expect(captionKey("This is how I go about finding accommodation abroad")).toBe("this is how i go about f");
    expect(captionKey("🤓🤓")).toBeNull();
    expect(captionKey(null)).toBeNull();
  });

  it("pairs a trial with the feed Reel posted minutes after it with the same caption start; newest pair first", () => {
    const posts = [
      reel("f1", false, ago(5), "Someone dmed me saying okay Ana we get it", 20_000, 0.05),
      reel("t1", true, ago(5, 7), "Someone dmed me saying okay Ana we get it!", 4_000, 0.02),
      reel("f2", false, ago(1), "It's time 🤓", 23_000, 0.04),
      reel("t2", true, ago(1, 5), "its time", 3_000, 0.012),
      // same caption, but the feed Reel came first: no pair
      reel("t3", true, ago(10), "Beach day explore", 2_000, 0.02),
      reel("f3", false, ago(10, 30), "Beach day explore", 9_000, 0.04),
      // more than a day apart: no pair
      reel("t4", true, ago(20), "Holiday packing routine", 2_000, 0.02),
      reel("f4", false, ago(18), "Holiday packing routine", 9_000, 0.04),
    ];
    const pairs = reelPairs(posts, NOW);
    expect(pairs.map((p) => [p.trial.id, p.feed.id])).toEqual([["t2", "f2"], ["t1", "f1"]]);
    expect(pairs[1]).toMatchObject({ leadMinutes: 7, settled: true });
    expect(pairs[1]!.reachX).toBeCloseTo(5);
    expect(pairs[1]!.erShare).toBeCloseTo(0.4);
    // a pair younger than the minimum age is shown but not yet compared
    expect(pairs[0]!.settled).toBe(1 >= LAB_MIN_AGE_DAYS);
  });

  it("a pair is young while either Reel is under 3 days old, and missing when an old pair has no Instagram numbers", () => {
    const posts = [
      reel("t1", true, ago(1, 5), "young pair caption", 1_000, 0.01), reel("f1", false, ago(1), "young pair caption", 9_000, 0.05),
      reel("t2", true, ago(6, 5), "old pair without numbers", null, null), reel("f2", false, ago(6), "old pair without numbers", 9_000, 0.05),
      reel("t3", true, ago(7, 5), "old pair with numbers", 2_000, 0.02), reel("f3", false, ago(7), "old pair with numbers", 9_000, 0.05),
    ];
    expect(reelPairs(posts, NOW).map((p) => [p.trial.id, pairState(p)])).toEqual([["t1", "young"], ["t2", "missing"], ["t3", "ready"]]);
  });

  it("each Reel is in at most one pair: the closest in time wins", () => {
    const posts = [reel("t1", true, ago(5, 30), "Same caption here", 1, 0.01), reel("t2", true, ago(5, 5), "Same caption here", 1, 0.01), reel("f1", false, ago(5), "Same caption here", 1, 0.01)];
    expect(reelPairs(posts, NOW).map((p) => p.trial.id)).toEqual(["t2"]);
  });

  it("summarises only settled pairs with both numbers", () => {
    const posts = [
      reel("t1", true, ago(5, 5), "first video caption", 2_000, 0.02), reel("f1", false, ago(5), "first video caption", 10_000, 0.05),
      reel("t2", true, ago(6, 5), "second video caption", 4_000, 0.03), reel("f2", false, ago(6), "second video caption", 12_000, 0.05),
      reel("t3", true, ago(1, 5), "young video caption", 1_000, 0.01), reel("f3", false, ago(1), "young video caption", 9_000, 0.05),
    ];
    const s = pairSummary(reelPairs(posts, NOW));
    expect(s.n).toBe(2);
    expect(s.reachX).toBeCloseTo((5 + 3) / 2);
    expect(s.erShare).toBeCloseTo((0.4 + 0.6) / 2);
  });
});

describe("trial lab — what does better with strangers", () => {
  const world = () => {
    const posts: WorldPost[] = [];
    const tags: Record<string, PostTags> = {};
    const add = (id: string, trial: boolean, er: number, t: PostTags) => {
      posts.push(reel(id, trial, ago(10), null, 1_000, er));
      tags[id] = t;
    };
    // trials: median 0.02; "transport" does twice as well as a typical trial
    add("t1", true, 0.04, tag("transport", "humor"));
    add("t2", true, 0.04, tag("transport", "humor"));
    add("t3", true, 0.04, tag("transport", "story"));
    add("t4", true, 0.02, tag("stay", "story"));
    add("t5", true, 0.01, tag("stay", "story"));
    add("t6", true, 0.01, tag("stay", "humor"));
    add("t7", true, 0.02, tag("stay", "story"));
    // feed: median 0.05; "transport" is only typical there
    add("f1", false, 0.05, tag("transport", "humor"));
    add("f2", false, 0.05, tag("transport", "humor"));
    add("f3", false, 0.05, tag("transport", "story"));
    add("f4", false, 0.08, tag("stay", "story"));
    add("f5", false, 0.06, tag("stay", "story"));
    add("f6", false, 0.04, tag("stay", "humor"));
    return { posts, tags };
  };

  it("compares each kind with its own median: a value strangers like more than the community comes first", () => {
    const { posts, tags } = world();
    const rows = strangerSignals(posts, tags, NOW);
    const transport = rows.find((r) => r.field === "theme" && r.value === "transport")!;
    expect(transport.trial).toEqual({ n: 3, index: 2 });
    expect(transport.feed.n).toBe(3);
    expect(transport.feed.index).toBeCloseTo(0.05 / 0.05);
    expect(transport.diff).toBeCloseTo(1);
    expect(rows[0]).toBe(transport);
    expect(rows.at(-1)!.diff).toBeLessThan(0);
  });

  it("leaves out values with fewer than 3 Reels on a side, unsure categories, young Reels and unflagged Reels", () => {
    const { posts, tags } = world();
    tags.t3 = { ...tags.t3!, confidence: 0.3 };
    posts.push(reel("young", true, ago(1), null, 1_000, 0.9), reel("unknown", null, ago(10), null, 1_000, 0.9));
    tags.young = tag("transport", "humor");
    tags.unknown = tag("transport", "humor");
    const rows = strangerSignals(posts, tags, NOW);
    expect(rows.find((r) => r.field === "theme" && r.value === "transport")).toBeUndefined();
  });

  it("only clear gaps count: at least 15 % of the usual engagement either way, largest first", () => {
    const row = (value: string, diff: number): StrangerRow => ({ field: "theme", value, trial: { n: 3, index: 1 + diff }, feed: { n: 3, index: 1 }, diff });
    const rows = [row("a", 0.5), row("b", 0.2), row("c", 0.14), row("d", 0.01), row("e", -0.1), row("f", -0.3), row("g", -0.6)];
    const { better, worse } = clearSignals(rows);
    expect(better.map((r) => r.value)).toEqual(["a", "b"]);
    expect(worse.map((r) => r.value)).toEqual(["g", "f"]);
  });

  it("without enough trials or feed Reels there is nothing to compare", () => {
    const { posts, tags } = world();
    expect(strangerSignals(posts.filter((p) => p.trial === false), tags, NOW)).toEqual([]);
  });
});
