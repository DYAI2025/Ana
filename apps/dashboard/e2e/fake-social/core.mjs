/**
 * Synthetic Instagram worker snapshots for tests (ANA-38). Everything here is invented: no real account, post, caption,
 * thumbnail or metric. Shape = worker snapshot_version 1 (workers/instagram-oauth/README.md).
 */

export const FAKE_ACCOUNT_ID = "17841400000000999";
export const FAKE_HANDLE = "synthetic_creator";
export const FAKE_OBSERVED_AT = "2026-10-10T12:00:00.000Z";
const METRICS = ["reach", "views", "saved", "shares", "likes", "comments", "total_interactions"];

// [format, daysAgo, reach, saved, shares, comments, caption] — captions use generic theme keywords only
const POSTS = [
  ["REELS", 2, 4100, 60, 20, 9, "Fresh reel: travel day, airport tips"],
  ["REELS", 5, 2600, 40, 10, 5, "Brand collab behind the scenes"],
  ["REELS", 8, 5200, 95, 41, 12, "Remote job opportunities this week: how to apply"],
  ["REELS", 10, 3000, 30, 8, 6, "My honest story about moving abroad"],
  ["REELS", 12, 2100, 88, 52, 7, "UGC rates template: step by step guide for creators"],
  ["REELS", 14, 6100, 52, 25, 15, "Island trip vlog part 1"],
  ["REELS", 16, 3900, 33, 12, 4, "Client invoice mistake I learned from"],
  ["REELS", 18, 2800, 21, 9, 3, "Family weekend story"],
  ["REELS", 20, 4500, 74, 30, 10, "Creator opportunities: apply before Friday"],
  ["REELS", 22, 3300, 26, 7, 5, "Hotel review on a budget"],
  ["REELS", 24, 2400, 51, 26, 8, "Freelance money: what I earn from UGC"],
  ["REELS", 26, 5600, 40, 18, 11, "Beach day explore"],
  ["REELS", 28, 3100, 19, 6, 2, "Feel good friday with friends"],
  ["REELS", 30, 2900, 47, 22, 6, "Brand deal checklist resource, save this"],
  ["REELS", 32, 3700, 28, 11, 7, "Passport and visa tips for nomad life"],
  ["REELS", 34, 2200, 15, 4, 3, "Parents visiting story"],
  ["REELS", 36, 4800, 66, 29, 9, "How to pitch brands as a creator"],
  ["REELS", 38, 3500, 24, 10, 4, "Weekend trip to the city"],
  ["REELS", 40, 2700, 55, 24, 5, "Budget breakdown of my business month"],
  ["REELS", 42, 3200, 22, 9, 6, "Holiday packing routine"],
  ["CAROUSEL_ALBUM", 9, 1800, 70, 15, 4, "Template: creator media kit guide"],
  ["CAROUSEL_ALBUM", 19, 1500, 40, 9, 3, "Travel budget breakdown"],
  ["CAROUSEL_ALBUM", 29, 1700, 55, 12, 2, "Opportunities list: remote work"],
  ["IMAGE", 15, 900, 6, 1, 2, "A quiet morning"],
  ["IMAGE", 33, 1100, 9, 2, 1, "Sunset at the beach"],
  // insights not fetched (worker budget) and one partial
  ["REELS", 44, 0, 0, 0, 0, "Old reel about collab life"],
  ["REELS", 46, 0, 0, 0, 0, "Old travel reel"],
  ["REELS", 48, 0, 0, 0, 0, "Old money tips reel"],
];
const PARTIAL_INDEX = 7; // views unavailable on this post

const iso = (daysAgo) => new Date(Date.parse(FAKE_OBSERVED_AT) - daysAgo * 86_400_000).toISOString().replace(".000Z", "+0000");

export function buildSnapshot({ count = POSTS.length, observedAt = FAKE_OBSERVED_AT } = {}) {
  const items = POSTS.slice(0, count).map(([type, daysAgo, reach, saved, shares, comments, caption], i) => {
    const notFetched = reach === 0;
    const values = { reach, views: reach * 2 + 100, saved, shares, likes: Math.round(reach * 0.05), comments, total_interactions: saved + shares + comments + Math.round(reach * 0.05) };
    // Reels also carry watch time (ms) and skip rate (percent 0-100), as the worker reads them (ANA-51)
    const extras = type === "REELS" ? { ig_reels_avg_watch_time: 12000 + i * 1500, reels_skip_rate: 20 + (i % 5) * 4.5 } : {};
    const metrics = [...METRICS, ...Object.keys(extras)].map((name) => {
      if (notFetched) return { name, value: null, state: "not_fetched", period: null };
      if (i === PARTIAL_INDEX && name === "views") return { name, value: null, state: "unavailable", period: null, error_class: "meta-100" };
      return { name, value: values[name] ?? extras[name], state: "ok", period: "lifetime" };
    });
    return {
      id: `syn${String(i).padStart(3, "0")}`,
      media_type: type === "REELS" ? "VIDEO" : type,
      media_product_type: type === "REELS" ? "REELS" : "FEED",
      permalink: `https://example.invalid/p/syn${i}`,
      timestamp: iso(daysAgo),
      // no real images: tests render the format glyph fallback
      thumbnail_url: null,
      caption,
      like_count: values.likes,
      comments_count: comments,
      insights: notFetched
        ? { state: "not_fetched", reason: "subrequest-budget", metrics }
        : { state: i === PARTIAL_INDEX ? "partial" : "ok", metrics },
    };
  });
  const until = Math.floor(Date.parse(observedAt) / 1000);
  const accountMetric = (name, value) => ({ name, period: "day", metric_type: "total_value", window_days: 28, since: until - 28 * 86400, until, value, state: "ok" });
  return {
    snapshot_version: 1,
    fetched_at: observedAt,
    provider: "instagram",
    api_version: "v26.0",
    account: {
      id: FAKE_ACCOUNT_ID,
      username: FAKE_HANDLE,
      followers_count: { value: 12400, state: "ok" },
      media_count: { value: 212, state: "ok" },
      metrics: [accountMetric("reach", 48200), accountMetric("views", 131000), { ...accountMetric("accounts_engaged", null), state: "unavailable", error_class: "meta-100" }, accountMetric("total_interactions", 3900)],
    },
    media: { requested_max: 50, returned: items.length, pages_fetched: 2, has_more: true, optional_fields_state: "ACCEPTED", items },
    insights: { requested_metrics: METRICS, extra_metrics: { REELS: ["ig_reels_avg_watch_time", "reels_skip_rate"] }, priority: "mature-first", mature_days: 7, halted: null, posts_with_insights: items.filter((x) => x.insights.state !== "not_fetched").length, budget: { limit: 45, used: 45 } },
  };
}

/** Synthetic pulse (pulse_version 1): the newest posts' public counters, `likeBump` added to every like count. */
export function buildPulse({ likeBump = 0, fetchedAt = new Date().toISOString() } = {}) {
  const snapshot = buildSnapshot();
  const items = [...snapshot.media.items]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 12)
    .map((m) => ({ id: m.id, timestamp: m.timestamp, media_product_type: m.media_product_type, like_count: m.like_count + likeBump, comments_count: m.comments_count }));
  return { pulse_version: 1, fetched_at: fetchedAt, provider: "instagram", api_version: "v26.0", account: { followers_count: 12400 + likeBump, media_count: 212 }, items };
}

/** Synthetic audience (audience_version 1). Invented shares only. */
export function buildAudience({ unavailable = false } = {}) {
  const series = (name, breakdown, rows, timeframe = "this_month") =>
    unavailable
      ? { name, breakdown, timeframe, state: "unavailable", error_class: "meta-100", results: [] }
      : { name, breakdown, timeframe, state: "ok", results: rows.map(([key, value]) => ({ key, value })) };
  return {
    audience_version: 1,
    fetched_at: new Date().toISOString(),
    provider: "instagram",
    api_version: "v26.0",
    metrics: [
      series("engaged_audience_demographics", "country", [["DE", 410], ["ES", 220], ["US", 160], ["IT", 90], ["BR", 40]]),
      series("engaged_audience_demographics", "city", [["Synthetic City A", 120], ["Synthetic City B", 60]]),
      series("follower_demographics", "country", [["DE", 5200], ["US", 2100], ["ES", 900]]),
      series("follower_demographics", "city", [["Synthetic City A", 900]]),
      // the last 7 days: Spain's share rises against the 30 days, the others fall
      series("engaged_audience_demographics", "country", [["ES", 150], ["DE", 120], ["US", 40], ["IT", 20]], "this_week"),
      series("engaged_audience_demographics", "city", [["Synthetic City B", 70]], "this_week"),
      series("engaged_audience_demographics", "age", [["18-24", 90], ["25-34", 160], ["35-44", 60], ["45-54", 20]], "this_week"),
      series("engaged_audience_demographics", "gender", [["F", 210], ["M", 110], ["U", 10]], "this_week"),
      series("engaged_audience_demographics", "age", [["25-34", 400], ["18-24", 300]]),
      series("engaged_audience_demographics", "gender", [["F", 500], ["M", 200]]),
      series("engaged_audience_demographics", "age,gender", [["18-24|F", 200], ["18-24|M", 100], ["25-34|F", 300], ["25-34|M", 100]]),
      series("follower_demographics", "age", [["25-34", 4000]]),
      series("follower_demographics", "gender", [["F", 3000], ["M", 2000]]),
    ],
  };
}

/** Synthetic older posts (numeric ids like Meta's): the snapshot's posts are not in it, so all of these are "older". */
export function buildHistory() {
  const items = Array.from({ length: 30 }, (_, i) => ({
    id: String(17900000000000 + i),
    media_type: "VIDEO",
    media_product_type: "REELS",
    timestamp: iso(60 + i),
    thumbnail_url: null,
    caption: `Synthetic older post ${i}`,
  }));
  return { history_version: 1, media: { requested_max: 200, returned: items.length, pages_fetched: 2, has_more: false, stopped: null, items }, budget: { limit: 14, used: 3 } };
}

/** Fake worker state: the next answer can be a fault. */
export function createFakeSocial() {
  let fault = null;
  let calls = 0;
  let world = { likeBump: 0, audienceUnavailable: false, pulseStatus: null };
  return {
    reset() {
      fault = null;
      calls = 0;
      world = { likeBump: 0, audienceUnavailable: false, pulseStatus: null };
    },
    /** e2e control for the ANA World reads */
    setWorld(next) {
      world = { ...world, ...(next ?? {}) };
    },
    setFault(next) {
      fault = next ?? null;
    },
    summary: () => ({ calls, fault }),
    handle(method, url, headers, expectedKey) {
      const u = new URL(url, "http://fake");
      if (method === "GET" && (u.pathname === "/internal/social-pulse" || u.pathname === "/internal/social-audience")) {
        if (headers.authorization !== `Bearer ${expectedKey}`) return { status: 401, body: { error: "unauthorized" } };
        if (u.pathname === "/internal/social-pulse") return world.pulseStatus ? { status: world.pulseStatus, body: { error: "fault" } } : { status: 200, body: buildPulse({ likeBump: world.likeBump }) };
        return { status: 200, body: buildAudience({ unavailable: world.audienceUnavailable }) };
      }
      // Ana's older posts for the office board: 30 synthetic posts 60..89 days old, and their lifetime numbers
      if (method === "GET" && (u.pathname === "/internal/media-history" || u.pathname === "/internal/media-insights")) {
        if (headers.authorization !== `Bearer ${expectedKey}`) return { status: 401, body: { error: "unauthorized" } };
        if (u.pathname === "/internal/media-history") return { status: 200, body: buildHistory() };
        const ids = (u.searchParams.get("ids") ?? "").split(",").filter(Boolean);
        return { status: 200, body: { insights_version: 1, items: ids.map((id, i) => ({ id, insights: { state: "ok", metrics: [["reach", 2000], ["saved", 20 + (i % 7)], ["shares", 5]].map(([name, value]) => ({ name, value, state: "ok", period: "lifetime" })) } })) } };
      }
      if (method !== "GET" || u.pathname !== "/internal/social-snapshot") return { status: 404, body: { error: "not-found" } };
      if (headers.authorization !== `Bearer ${expectedKey}`) return { status: 401, body: { error: "unauthorized" } };
      calls += 1;
      if (fault?.hang) return { hang: true };
      if (fault?.network) return { network: true };
      if (fault?.status) return { status: fault.status, body: { error: fault.error ?? "fault" } };
      if (fault?.invalid) return { status: 200, body: { snapshot_version: 99 } };
      // {empty} answers with no posts; {observedAt} stamps the snapshot (a later stamp models a genuinely newer worker read)
      if (fault?.empty || fault?.observedAt) return { status: 200, body: buildSnapshot({ count: fault.empty ? 0 : undefined, observedAt: fault.observedAt }) };
      return { status: 200, body: buildSnapshot() };
    },
  };
}
