import { describe, expect, it } from "vitest";
import type { Observation, SocialPost } from "@/features/social/types";
import { buildGeo, isLand, mainlandCentroid, unwrapRing } from "./geo";
import { CHANNELS, channelStatuses, instagramView, median, ORBIT_MAX, orbitCount, pulseEvents, shares, trends, whoView } from "./model";
import { resolveLook } from "./looks";
import { parseTags, postsWith, topPosts, whatWorks } from "./postTags";
import type { WorldPayload } from "./types";
import { NEWSLETTERS_OFF } from "./newsletters";
import topology from "world-atlas/countries-110m.json";
import codes from "i18n-iso-countries/codes.json";
import type { Topology } from "topojson-specification";

const obs = (media: string | null, metric: Observation["metric_name"], value: number | null): Observation => ({
  account_id: "acc",
  media_id: media,
  provider: "instagram",
  provider_api_version: "v26.0",
  metric_name: metric,
  native_metric_name: metric,
  value,
  unit: "count",
  period: "lifetime",
  availability_state: value === null ? "UNAVAILABLE" : "VERIFIED",
  availability_reason: null,
  observed_at: "2026-10-31T19:00:00.000Z",
  baseline_definition: null,
  source_reference: "test",
});
const post = (id: string, published: string, reach: number | null, interactions: number | null, likes: number): SocialPost => ({
  media_id: id,
  media_type: "VIDEO",
  media_product_type: "REELS",
  format: "reel",
  caption: `caption ${id}`,
  permalink: null,
  thumbnail_url: null,
  published_at: published,
  insights_state: "ok",
  observations: [obs(id, "reach", reach), obs(id, "total_interactions", interactions), obs(id, "like_count_field", likes)],
});

function world(pulseLikes: number, pulseAt = "2026-10-31T20:00:00.000Z", extraPulse: WorldPayload["pulse"]["items"] = []): WorldPayload {
  return {
    version: 1,
    generated_at: pulseAt,
    instagram: {
      ok: true,
      stale: false,
      snapshot: {
        provider: "instagram",
        provider_api_version: "v26.0",
        account_id: "acc",
        handle: "anasavu",
        observed_at: "2026-10-31T19:00:00.000Z",
        served_at: "2026-10-31T19:00:00.000Z",
        coverage: { requested: 3, retrieved: 3, total_available: 3, has_more: false, pages_fetched: 1, posts_with_insights: 3, posts_without_insights: 0, budget_used: 1, budget_limit: 45, insights_priority: "mature-first", halted: null, optional_fields: "ACCEPTED" },
        account: [obs(null, "followers", 1000)],
        posts: [post("a", "2026-10-30T10:00:00.000Z", 1000, 100, 50), post("b", "2026-10-29T10:00:00.000Z", 2000, 100, 60), post("c", "2026-10-28T10:00:00.000Z", null, 10, 5)],
      },
    },
    pulse: { state: "ok", reason: null, fetched_at: pulseAt, followers: 1010, media_count: 3, items: [{ id: "a", published_at: "2026-10-30T10:00:00.000Z", like_count: pulseLikes, comments_count: 4 }, ...extraPulse] },
    audience: { state: "ok", reason: null, fetched_at: pulseAt, timeframe: "this_month", engaged_country: { state: "ok", reason: null, results: [{ key: "DE", value: 30 }, { key: "ES", value: 10 }] }, engaged_city: { state: "unavailable", reason: "meta-100", results: [] }, follower_country: { state: "unavailable", reason: null, results: [] }, follower_city: { state: "unavailable", reason: null, results: [] }, engaged_country_week: N, engaged_city_week: N, who: { engaged_week: W, engaged_month: W, follower: W }, history: { days: 0, since: null } },
    work: { state: "not-configured", reason: "not-configured", fetched_at: null, issues: [] },
    places: { ana: null },
    ana_look: resolveLook(null, null),
    release: { sha: null, started_at: pulseAt },
    post_tags: { state: "off", tags: {} },
    post_topics: { state: "off", version: "t", topics: {}, failing: 0 },
    newsletters: NEWSLETTERS_OFF,
    brain: { state: "off", last_day: null, note: null, reason: null },
    brief: { state: "off", busy: false, latest: {}, weekly: {}, in_brain: false, brain: false, reason: null },
  };
}

const N = { state: "not_fetched" as const, reason: null, results: [] };
const W = { age: N, gender: N, age_gender: N };

describe("instagramView", () => {
  it("merges the pulse counters over the snapshot and computes ER only from measured values", () => {
    const v = instagramView(world(77));
    expect(v.status).toBe("live");
    expect(v.followers).toBe(1010);
    expect(v.followers_source).toBe("pulse");
    expect(v.posts.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(v.posts[0]).toMatchObject({ likes: 77, comments: 4, er: 0.1, counters_at: "2026-10-31T20:00:00.000Z" });
    expect(v.posts[1]).toMatchObject({ likes: 60, er: 0.05 });
    expect(v.posts[2]?.er).toBeNull();
    expect(v.erMedian).toBeNull();
  });

  it("save+share rate only when saves, shares and reach are all measured", () => {
    const w = world(77);
    if (!w.instagram.ok) throw new Error("fixture");
    const first = w.instagram.snapshot.posts[0] as SocialPost;
    first.observations.push(obs("a", "saves", 30), obs("a", "shares", 20));
    const second = w.instagram.snapshot.posts[1] as SocialPost;
    second.observations.push(obs("b", "saves", 5));
    const v = instagramView(w);
    expect(v.posts[0]?.ssr).toBe(0.05);
    expect(v.posts[1]?.ssr).toBeNull();
  });

  it("shows a post the pulse knows before the snapshot does as fresh, without invented insights", () => {
    const v = instagramView(world(1, undefined, [{ id: "new", published_at: "2026-10-31T19:59:00.000Z", like_count: 2, comments_count: 0 }]));
    expect(v.posts[0]).toMatchObject({ id: "new", fresh: true, reach: null, likes: 2 });
  });

  it("lists all five channels in picker order with only Instagram connected", () => {
    expect(channelStatuses(world(1)).map((c) => [c.def.id, c.status])).toEqual([["instagram", "live"], ["substack", "not-connected"], ["tiktok", "not-connected"], ["youtube", "not-connected"], ["facebook", "not-connected"]]);
    expect(CHANNELS).toHaveLength(5);
  });
});

describe("pulseEvents", () => {
  it("reports real like and follower deltas between two reads", () => {
    const e = pulseEvents(world(50, "2026-10-31T20:00:00.000Z"), world(53, "2026-10-31T20:01:00.000Z"));
    expect(e).toEqual([{ kind: "likes", postId: "a", delta: 3, at: "2026-10-31T20:01:00.000Z" }]);
  });

  it("reports a new post only when it was published after the previous read", () => {
    const prev = world(50, "2026-10-31T20:00:00.000Z");
    const fresh = world(50, "2026-10-31T20:01:00.000Z", [{ id: "n", published_at: "2026-10-31T20:00:30.000Z", like_count: 0, comments_count: 0 }]);
    const old = world(50, "2026-10-31T20:01:00.000Z", [{ id: "o", published_at: "2026-10-01T00:00:00.000Z", like_count: 0, comments_count: 0 }]);
    expect(pulseEvents(prev, fresh).map((x) => x.kind)).toEqual(["new-post"]);
    expect(pulseEvents(prev, old)).toEqual([]);
  });

  it("never compares when a read is missing, failed or the same", () => {
    expect(pulseEvents(null, world(1))).toEqual([]);
    expect(pulseEvents(world(1), world(9))).toEqual([]);
    const failed = world(9, "2026-10-31T20:05:00.000Z");
    failed.pulse.state = "error";
    expect(pulseEvents(world(1), failed)).toEqual([]);
  });
});

describe("shares and median", () => {
  it("computes shares of Meta's returned top entries", () => {
    expect(shares({ state: "ok", reason: null, results: [{ key: "DE", value: 30 }, { key: "ES", value: 10 }] })).toEqual([{ key: "DE", value: 30, share: 0.75 }, { key: "ES", value: 10, share: 0.25 }]);
    expect(shares({ state: "unavailable", reason: null, results: [] })).toEqual([]);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("geo", () => {
  const geo = buildGeo(topology as unknown as Topology, codes as unknown as string[][]);
  it("puts Berlin and Nairobi on land and the open oceans in water", () => {
    expect(isLand(geo.land, geo.width, geo.height, 52.52, 13.4)).toBe(true);
    expect(isLand(geo.land, geo.width, geo.height, -1.29, 36.82)).toBe(true);
    expect(isLand(geo.land, geo.width, geo.height, 0, -30)).toBe(false);
    expect(isLand(geo.land, geo.width, geo.height, -40, -120)).toBe(false);
    expect(isLand(geo.land, geo.width, geo.height, 65, 100)).toBe(true);
  });

  it("maps ISO alpha-2 codes to mainland centroids", () => {
    const de = geo.centroids.get("DE");
    const es = geo.centroids.get("ES");
    expect(de && Math.abs(de.lat - 51.2) < 2 && Math.abs(de.lon - 10.4) < 2).toBe(true);
    expect(es && Math.abs(es.lat - 40.2) < 3 && Math.abs(es.lon + 3.6) < 3).toBe(true);
    const us = geo.centroids.get("US");
    expect(us && us.lon < -80 && us.lon > -110).toBe(true);
    expect(geo.centroids.size).toBeGreaterThan(150);
  });

  it("unwraps antimeridian jumps", () => {
    expect(unwrapRing([[179, 0], [-179, 1], [-178, 2]])).toEqual([[179, 0], [181, 1], [182, 2]]);
    expect(mainlandCentroid({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } })).toEqual({ lat: 1, lon: 1 });
  });
});

describe("orbitCount", () => {
  it("is the number of cards the orbit draws: all posts up to ORBIT_MAX", () => {
    expect(ORBIT_MAX).toBe(30);
    expect(orbitCount(new Array(50).fill(0))).toBe(30);
    expect(orbitCount(new Array(28).fill(0))).toBe(28);
    expect(orbitCount([])).toBe(0);
  });
});

describe("trends and whoView", () => {
  const ok = (rows: Array<[string, number]>) => ({ state: "ok" as const, reason: null, results: rows.map(([key, value]) => ({ key, value })) });
  it("trend = week share minus month share in points, only where both are known", () => {
    const t = trends(ok([["ES", 60], ["DE", 40], ["BR", 0]]), ok([["DE", 70], ["ES", 30]]));
    expect(t.get("ES")).toBe(30);
    expect(t.get("DE")).toBe(-30);
    expect(t.has("BR")).toBe(false);
    expect(trends(N, ok([["DE", 1]])).size).toBe(0);
  });
  it("a combined age×gender answer becomes a pyramid, oldest band on top", () => {
    const v = whoView({ age: N, gender: N, age_gender: ok([["25-34|F", 50], ["25-34|M", 20], ["18-24|F", 20], ["18-24|U", 10]]) });
    expect(v?.mode).toBe("pyramid");
    if (v?.mode !== "pyramid") return;
    expect(v.rows.map((r) => r.band)).toEqual(["25-34", "18-24"]);
    expect(v.rows[0]).toEqual({ band: "25-34", f: 0.5, m: 0.2, u: 0 });
    expect(v.max).toBe(0.5);
  });
  it("without the combined answer: age bands and a gender split; nothing at all = null", () => {
    const v = whoView({ age: ok([["18-24", 1], ["35-44", 3]]), gender: ok([["F", 3], ["M", 1]]), age_gender: N });
    expect(v).toEqual({ mode: "split", ages: [{ band: "35-44", share: 0.75 }, { band: "18-24", share: 0.25 }], gender: { f: 0.75, m: 0.25, u: 0 } });
    expect(whoView({ age: N, gender: N, age_gender: N })).toBeNull();
  });
});

describe("post categories: parseTags and whatWorks", () => {
  const tags = (theme: string, confidence = 0.9) => ({ theme, ana: "face", shot: "selfie", hook: "none", cta: "none", mood: "calm", country: null, brand: false, confidence });
  it("median engagement per value, highest first; low-confidence posts are not counted; format needs no model", () => {
    const posts = [
      { id: "a", format: "reel", er: 0.1 },
      { id: "b", format: "reel", er: 0.3 },
      { id: "c", format: "image", er: 0.05 },
      { id: "d", format: "image", er: 0.2 },
      { id: "e", format: "image", er: null },
    ];
    const t = { a: tags("food"), b: tags("food"), c: tags("beach"), d: tags("beach", 0.3), e: tags("beach") };
    const parsed = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, parseTags(v)!]));
    const w = whatWorks(posts, parsed);
    expect(w.counted).toBe(3);
    expect(w.fields.theme).toEqual([{ value: "food", n: 2, median: 0.2 }, { value: "beach", n: 1, median: 0.05 }]);
    expect(w.fields.format.map((r) => [r.value, r.n])).toEqual([["reel", 2], ["image", 2]]);
  });
});

describe("posts behind a category value and the top posts", () => {
  const tg = (theme: string, confidence = 0.9) => parseTags({ theme, ana: "face", shot: "selfie", hook: "none", cta: "none", mood: "calm", country: null, brand: false, confidence })!;
  const posts = [
    { id: "a", format: "reel", er: 0.1 },
    { id: "b", format: "reel", er: null },
    { id: "c", format: "image", er: 0.3 },
    { id: "d", format: "reel", er: 0.2 },
  ];
  it("by format from Meta, by category only from confident readings, best rate first, unmeasured last", () => {
    expect(postsWith(posts, {}, "format", "reel").map((p) => p.id)).toEqual(["d", "a", "b"]);
    const tags = { a: tg("food"), b: tg("food"), c: tg("food", 0.2), d: tg("beach") };
    expect(postsWith(posts, tags, "theme", "food").map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("top posts are the measured ones by rate", () => {
    expect(topPosts(posts, 2).map((p) => p.id)).toEqual(["c", "d"]);
  });
  it("ranked by save+share instead: only posts with that rate count, same grouping", () => {
    const rated = [
      { id: "a", format: "reel", er: 0.1, ssr: 0.02 },
      { id: "b", format: "reel", er: 0.2, ssr: null },
      { id: "c", format: "image", er: 0.05, ssr: 0.04 },
    ];
    expect(topPosts(rated, 5, "ssr").map((p) => p.id)).toEqual(["c", "a"]);
    expect(whatWorks(rated, {}, "ssr").fields.format).toEqual([{ value: "image", n: 1, median: 0.04 }, { value: "reel", n: 1, median: 0.02 }]);
    expect(postsWith(rated, {}, "format", "reel", "ssr").map((p) => p.id)).toEqual(["a", "b"]);
  });
});
