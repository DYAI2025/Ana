import { describe, expect, it } from "vitest";
import { berlinDayOf, digestHasSignal, digestText, pulseDigest } from "./pulse";
import { N, NOW, world } from "./worldFixture";

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
