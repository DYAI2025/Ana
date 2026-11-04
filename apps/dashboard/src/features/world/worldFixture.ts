/** A synthetic world for tests (pulse.test.ts, brief.test.ts): five reels, three countries, age and gender. */
import type { Observation, SocialPost } from "@/features/social/types";
import { resolveLook } from "./looks";
import type { PostTags } from "./postTags";
import type { AudienceSeries, WorldPayload } from "./types";

export const NOW = Date.parse("2026-11-03T10:00:00.000Z");
const obs = (media: string | null, metric: Observation["metric_name"], value: number): Observation => ({
  account_id: "acc", media_id: media, provider: "instagram", provider_api_version: "v26.0", metric_name: metric, native_metric_name: metric, value, unit: "count",
  period: "lifetime", availability_state: "VERIFIED", availability_reason: null, observed_at: "2026-11-03T09:00:00.000Z", baseline_definition: null, source_reference: "test",
});
export const post = (id: string, daysAgo: number, reach: number, interactions: number, saves: number, shares: number): SocialPost => ({
  media_id: id, media_type: "VIDEO", media_product_type: "REELS", format: "reel", caption: `SECRET caption ${id}`, permalink: null, thumbnail_url: null,
  published_at: new Date(NOW - daysAgo * 86_400_000).toISOString(), insights_state: "ok",
  observations: [obs(id, "reach", reach), obs(id, "total_interactions", interactions), obs(id, "saves", saves), obs(id, "shares", shares)],
});
export const series = (rows: Array<[string, number]>): AudienceSeries => ({ state: "ok", reason: null, results: rows.map(([key, value]) => ({ key, value })) });
export const N = { state: "not_fetched" as const, reason: null, results: [] };
export const tag = (theme: PostTags["theme"], brand = false, confidence = 0.9): PostTags => ({ theme, ana: "face", shot: "selfie", hook: "place", cta: "none", mood: "calm", country: "TH", brand, confidence });

export function world(): WorldPayload {
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
    post_topics: { state: "on", version: "t", topics: { p1: ["solo-lessons"], p2: ["solo-lessons"], p3: [] }, failing: 0 },
    newsletters: {
      state: "on", read_at: "2026-11-03T23:30:00.000Z", feeds: 6, feeds_read: 6, feeds_failing: 0, since: "2026-10-30",
      posts: 40, checked: 40, failing: 0, unreadable: 0, complete: true,
      check: { core: { feeds: 6, checked: 28, matched: 14 }, control: { feeds: 2, checked: 12, matched: 2 } },
      topics: {
        "ugc-gigs": {
          posts: 12,
          feeds: ["travel-creator-gigs", "life-unscripted"],
          hits: [
            { feed: "travel-creator-gigs", title: "A brand is hiring travel creators", url: "https://travelcreatorgigs.substack.com/p/a-brand", date: "2026-11-02" },
            { feed: "life-unscripted", title: "Hotel shoot callout", url: "https://millieameliacreates.substack.com/p/hotel", date: "2026-11-01" },
          ],
        },
      },
      store_error: false,
    },
    brain: { state: "off", last_day: null, note: null, reason: null },
    brief: { state: "off", busy: false, latest: {}, weekly: {}, in_brain: false, brain: false, reason: null },
  };
}

