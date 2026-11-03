import { describe, expect, it } from "vitest";
import type { Observation, SocialPost } from "@/features/social/types";
import { resolveLook } from "./looks";
import type { PostTags } from "./postTags";
import { berlinDayOf, digestHasSignal, digestText, pulseDigest } from "./pulse";
import type { AudienceSeries, WorldPayload } from "./types";

const NOW = Date.parse("2026-11-03T10:00:00.000Z");
const obs = (media: string | null, metric: Observation["metric_name"], value: number): Observation => ({
  account_id: "acc", media_id: media, provider: "instagram", provider_api_version: "v26.0", metric_name: metric, native_metric_name: metric, value, unit: "count",
  period: "lifetime", availability_state: "VERIFIED", availability_reason: null, observed_at: "2026-11-03T09:00:00.000Z", baseline_definition: null, source_reference: "test",
});
const post = (id: string, daysAgo: number, reach: number, interactions: number, saves: number, shares: number): SocialPost => ({
  media_id: id, media_type: "VIDEO", media_product_type: "REELS", format: "reel", caption: `SECRET caption ${id}`, permalink: null, thumbnail_url: null,
  published_at: new Date(NOW - daysAgo * 86_400_000).toISOString(), insights_state: "ok",
  observations: [obs(id, "reach", reach), obs(id, "total_interactions", interactions), obs(id, "saves", saves), obs(id, "shares", shares)],
});
const series = (rows: Array<[string, number]>): AudienceSeries => ({ state: "ok", reason: null, results: rows.map(([key, value]) => ({ key, value })) });
const N = { state: "not_fetched" as const, reason: null, results: [] };
const tag = (theme: PostTags["theme"], brand = false, confidence = 0.9): PostTags => ({ theme, ana: "face", shot: "selfie", hook: "place", cta: "none", mood: "calm", country: "TH", brand, confidence });

function world(): WorldPayload {
  return {
    version: 1,
    generated_at: new Date(NOW).toISOString(),
    instagram: {
      ok: true,
      stale: false,
      snapshot: {
        provider: "instagram", provider_api_version: "v26.0", account_id: "acc", handle: "ana", observed_at: "2026-11-03T09:00:00.000Z", served_at: "2026-11-03T09:00:00.000Z",
        coverage: { requested: 5, retrieved: 5, total_available: 5, has_more: false, pages_fetched: 1, posts_with_insights: 5, posts_without_insights: 0, budget_used: 1, budget_limit: 45, insights_priority: "mature-first", halted: null, optional_fields: "ACCEPTED" },
        account: [obs(null, "followers", 5000), obs(null, "reach", 40000)],
        posts: [post("p1", 1, 1000, 120, 20, 10), post("p2", 3, 1000, 40, 2, 1), post("p3", 10, 1000, 60, 5, 5), post("p4", 12, 1000, 50, 4, 2), post("p5", 20, 1000, 80, 9, 6)],
      },
    },
    pulse: { state: "ok", reason: null, fetched_at: new Date(NOW).toISOString(), followers: 5010, media_count: 5, items: [] },
    audience: {
      state: "ok", reason: null, fetched_at: new Date(NOW).toISOString(), timeframe: "this_month",
      engaged_country: series([["DE", 50], ["TH", 30], ["ES", 20]]),
      engaged_country_week: series([["DE", 40], ["TH", 45], ["ES", 15]]),
      engaged_city: N, engaged_city_week: N, follower_country: N, follower_city: N,
      who: { engaged_week: { age: series([["18-24", 30], ["25-34", 50], ["35-44", 20]]), gender: series([["F", 70], ["M", 30]]), age_gender: N }, engaged_month: { age: N, gender: N, age_gender: N }, follower: { age: N, gender: N, age_gender: N } },
      history: { days: 3, since: "2026-11-01" },
    },
    work: { state: "not-configured", reason: "not-configured", fetched_at: null, issues: [] },
    places: { ana: null },
    ana_look: resolveLook(null, null),
    release: { sha: null, started_at: new Date(NOW).toISOString() },
    post_tags: { state: "on", tags: { p1: tag("beach"), p2: tag("beach", true), p3: tag("beach"), p4: tag("food", true), p5: tag("food", false, 0.2) } },
    brain: { state: "off", last_day: null, note: null, reason: null },
  };
}

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
