import { describe, expect, it } from "vitest";
import type { Observation, SocialPost } from "@/features/social/types";
import { buildGeo, isLand, mainlandCentroid, unwrapRing } from "./geo";
import { CHANNELS, channelStatuses, instagramView, median, ORBIT_MAX, orbitCount, pulseEvents, shares } from "./model";
import { resolveLook } from "./looks";
import type { WorldPayload } from "./types";
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
    audience: { state: "ok", reason: null, fetched_at: pulseAt, timeframe: "this_month", engaged_country: { state: "ok", reason: null, results: [{ key: "DE", value: 30 }, { key: "ES", value: 10 }] }, engaged_city: { state: "unavailable", reason: "meta-100", results: [] }, follower_country: { state: "unavailable", reason: null, results: [] }, follower_city: { state: "unavailable", reason: null, results: [] } },
    work: { state: "not-configured", reason: "not-configured", fetched_at: null, issues: [] },
    places: { ana: null },
    ana_look: resolveLook(null, null),
    release: { sha: null, started_at: pulseAt },
  };
}

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
