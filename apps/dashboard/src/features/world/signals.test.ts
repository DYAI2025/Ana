import { describe, expect, it } from "vitest";
import { instagramView } from "./model";
import { signals } from "./signals";
import { NOW, post, tag, world } from "./worldFixture";

describe("Läuft gerade gut / Bremst gerade", () => {
  it("names groups of 3+ posts that are clearly above or below the usual rate, one per category, with example posts", () => {
    const w = world();
    if (w.instagram.ok) w.instagram.snapshot.posts.push(post("p6", 15, 1000, 30, 1, 1));
    // beach p1 12 %, p2 4 %, p3 6 % → 6.0 %; food p4 5 %, p5 8 %, p6 3 % → 5.0 %; all six: 5.5 %
    w.post_tags.tags.p5 = tag("food");
    w.post_tags.tags.p6 = tag("food");
    const posts = instagramView(w).posts;
    const s = signals(posts, w.post_tags.tags);
    expect(s.overall).toBeCloseTo(0.055);
    // neither beach (1.09×) nor food (0.91×) is a clear difference: nothing is named
    expect(s.good).toEqual([]);
    expect(s.slow).toEqual([]);
    // make food clearly weaker
    if (w.instagram.ok) w.instagram.snapshot.posts.push(post("p7", 16, 1000, 10, 1, 1));
    w.post_tags.tags.p7 = tag("food");
    const s2 = signals(instagramView(w).posts, w.post_tags.tags);
    expect(s2.slow.map((x) => `${x.field}:${x.value}`)).toEqual(["theme:food"]);
    expect(s2.slow[0]?.examples.map((p) => p.id)).toEqual(["p7", "p6", "p4"]);
    expect(s2.good.map((x) => `${x.field}:${x.value}`)).toEqual(["theme:beach"]);
    expect(s2.good[0]?.examples[0]?.id).toBe("p1");
    expect(NOW).toBeGreaterThan(0);
  });

  it("nothing without measured posts", () => {
    expect(signals([], {})).toEqual({ good: [], slow: [], overall: null });
  });
});
