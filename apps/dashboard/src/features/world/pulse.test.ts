import { describe, expect, it } from "vitest";
import { berlinDayOf, digestHasSignal, digestText, pulseDigest } from "./pulse";
import { N, NOW, post, world } from "./worldFixture";
import { instagramView } from "./model";

describe("Was läuft — the digest", () => {
  it("finds rising and falling countries, the posts of the week and who engaged", () => {
    const d = pulseDigest(world(), NOW);
    expect(d.day).toBe("2026-11-03");
    expect(d.rising.map((c) => c.key)).toEqual(["TH"]);
    expect(d.rising[0]?.delta).toBe(15);
    expect(d.falling.map((c) => c.key)).toEqual(["DE", "ES"]);
    expect(d.leading[0]?.key).toBe("TH");
    expect(d.fresh.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(d.fresh[0]?.vsMedian).toBeCloseTo(0.12 / 0.06);
    expect(d.fresh[0]?.ssr).toBeCloseTo(0.03);
    expect(d.topAge).toEqual({ band: "25-34", share: 0.5 });
    expect(d.gender?.f).toBeCloseTo(0.7);
    // themes need 3 confident posts: food has only one confident reading
    expect(d.themesEr.map((r) => r.value)).toEqual(["beach"]);
    expect(d.brand).toMatchObject({ n: 2, otherN: 2 });
    expect(d.tagged).toBe(4);
    expect(digestHasSignal(d)).toBe(true);
  });

  it("writes measured numbers only: no captions, and below 2000 characters", () => {
    const text = digestText(pulseDigest(world(), NOW));
    expect(text).not.toContain("SECRET");
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain("Steigend: TH +15.0 Pkt");
    expect(text).toContain("Save+Share");
    expect(text).toContain("Nur Korrelation");
  });

  it("an empty world has no signal; the Berlin day turns at midnight Berlin time", () => {
    const w = world();
    if (w.instagram.ok) w.instagram.snapshot.posts = [];
    w.audience.engaged_country_week = N;
    expect(digestHasSignal(pulseDigest(w, NOW))).toBe(false);
    expect(berlinDayOf(Date.parse("2026-11-03T23:30:00Z"))).toBe("2026-11-04");
  });
});

describe("Was läuft — feed and trial Reels", () => {
  const flagged = () => {
    const w = world();
    if (w.instagram.ok) {
      const feed = (id: string, d: number, i: number) => ({ ...post(id, d, 1000, i, 5, 5), shared_to_feed: true });
      const trial = (id: string, d: number, i: number) => ({ ...post(id, d, 1000, i, 1, 1), shared_to_feed: false });
      w.instagram.snapshot.posts = [feed("f1", 1, 120), trial("t1", 2, 30), feed("f2", 10, 60), feed("f3", 12, 50), feed("f4", 20, 80), trial("t2", 8, 20), trial("t3", 9, 10), trial("t4", 15, 30)];
    }
    return w;
  };

  it("a Reel knows whether it is a trial; posts that are not Reels or carry no flag stay unknown", () => {
    const posts = instagramView(flagged()).posts;
    expect(posts.find((p) => p.id === "t1")?.trial).toBe(true);
    expect(posts.find((p) => p.id === "f1")?.trial).toBe(false);
    const w = world();
    if (w.instagram.ok) w.instagram.snapshot.posts = [{ ...post("c1", 3, 1000, 10, 1, 1), format: "carousel", media_product_type: "FEED", shared_to_feed: true }, post("r1", 3, 1000, 10, 1, 1)];
    expect(instagramView(w).posts.map((p) => p.trial)).toEqual([null, null]);
  });

  it("a new trial Reel is compared with trial Reels, a new feed Reel with feed Reels", () => {
    const d = pulseDigest(flagged(), NOW);
    const f1 = d.fresh.find((p) => p.id === "f1")!;
    const t1 = d.fresh.find((p) => p.id === "t1")!;
    expect(f1.trial).toBe(false);
    expect(t1.trial).toBe(true);
    // feed engagement 0.12, 0.06, 0.05, 0.08 -> median 0.07; trial 0.03, 0.02, 0.01, 0.03 -> median 0.025
    expect(f1.vsMedian).toBeCloseTo(0.12 / 0.07);
    expect(t1.vsMedian).toBeCloseTo(0.03 / 0.025);
  });

  it("feed and trial Reels side by side: medians over Reels at least 7 days old", () => {
    const d = pulseDigest(flagged(), NOW);
    expect(d.reels?.feed).toMatchObject({ n: 3, reach: 1000 });
    expect(d.reels?.feed.er).toBeCloseTo(0.06);
    expect(d.reels?.trial).toMatchObject({ n: 3 });
    expect(d.reels?.trial.er).toBeCloseTo(0.02);
  });

  it("without any flag from the worker there is no comparison and every post keeps the plain median", () => {
    const d = pulseDigest(world(), NOW);
    expect(d.reels).toBeNull();
    expect(d.fresh.every((p) => p.trial === null)).toBe(true);
    expect(d.fresh[0]?.vsMedian).toBeCloseTo(0.12 / 0.06);
  });
});
