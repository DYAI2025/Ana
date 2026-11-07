// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SocialConfig } from "@/server/social/config";
import type { SnapshotService } from "@/server/social/service";
import { GET } from "@/app/api/world/route";
import { normalizeAudience, normalizePulse } from "./normalize";
import { readAnaPlace, readRelease } from "./presence";
import { AUDIENCE_PATH, createWorldService, PULSE_PATH } from "./service";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TAG_VERSION } from "@/features/world/postTags";
import { createPostTagger } from "./tagger";
import type { ReelDaily, ReelInput } from "./reelDaily";
import { REEL_VIEWING_OFF } from "@/features/world/types";
import { normalizeSnapshot } from "@/server/social/normalize";
import { buildSnapshot } from "../../../e2e/fake-social/core.mjs";

const KEY = "unit-test-social-key-0123456789";
const config: SocialConfig = { workerOrigin: "https://worker.example.invalid", key: KEY, timeoutMs: 50, maxPosts: 50, cacheMs: 600_000, minRefreshMs: 60_000 };
const social: SnapshotService = { read: async () => ({ ok: false, failure: { state: "ERROR", code: "unavailable" } }), reset: () => {} };

const pulseBody = (likes: number, at = "2026-10-31T20:00:00.000Z") => ({
  pulse_version: 1,
  fetched_at: at,
  provider: "instagram",
  account: { followers_count: 1200, media_count: 80 },
  items: [{ id: "m1", timestamp: "2026-10-31T10:00:00+0000", media_product_type: "REELS", like_count: likes, comments_count: 4 }],
});
const audienceBody = {
  audience_version: 1,
  fetched_at: "2026-10-31T20:00:00.000Z",
  metrics: [
    { name: "engaged_audience_demographics", breakdown: "country", timeframe: "this_month", state: "ok", results: [{ key: "ES", value: 40 }, { key: "DE", value: 120 }, { key: "Germany", value: 9 }] },
    { name: "engaged_audience_demographics", breakdown: "city", timeframe: "this_month", state: "ok", results: [{ key: "Berlin, Berlin", value: 30 }] },
    { name: "follower_demographics", breakdown: "country", timeframe: "this_month", state: "unavailable", error_class: "meta-100", results: [] },
  ],
};

function fakeWorker(handlers: Record<string, () => Response>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const h = handlers[url.pathname];
    return h ? h() : new Response(JSON.stringify({ error: "not-found" }), { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("normalizePulse / normalizeAudience — worker answers are checked, never guessed", () => {
  it("keeps counters, turns bad counters into null and rejects unknown versions", () => {
    const p = normalizePulse({ ...pulseBody(5), items: [{ id: "a", like_count: 3, comments_count: -1 }, { id: "", like_count: 1 }, "x"] });
    expect(p.items).toEqual([{ id: "a", published_at: null, like_count: 3, comments_count: null }]);
    expect(p.followers).toBe(1200);
    expect(() => normalizePulse({ ...pulseBody(5), pulse_version: 2 })).toThrow();
    expect(() => normalizePulse({ ...pulseBody(5), fetched_at: "nope" })).toThrow();
  });

  it("sorts country shares, drops non-ISO country keys and keeps unavailable series honest", () => {
    const a = normalizeAudience(audienceBody);
    expect(a.timeframe).toBe("this_month");
    expect(a.engaged_country.results).toEqual([{ key: "DE", value: 120 }, { key: "ES", value: 40 }]);
    expect(a.engaged_city.results).toEqual([{ key: "Berlin, Berlin", value: 30 }]);
    expect(a.follower_country).toEqual({ state: "unavailable", reason: "meta-100", results: [] });
    expect(a.follower_city.state).toBe("not_fetched");
    expect(() => normalizeAudience({ ...audienceBody, audience_version: 9 })).toThrow();
  });

  it("reads the 7-day, age, gender and combined series by timeframe and drops keys of the wrong shape", () => {
    const row = (breakdown: string, timeframe: string, results: Array<[string, number]>) => ({ name: "engaged_audience_demographics", breakdown, timeframe, state: "ok", results: results.map(([key, value]) => ({ key, value })) });
    const a = normalizeAudience({
      ...audienceBody,
      metrics: [
        ...audienceBody.metrics,
        row("country", "this_week", [["ES", 70], ["DE", 30]]),
        row("age", "this_week", [["25-34", 50], ["65+", 4], ["young", 9]]),
        row("gender", "this_week", [["F", 60], ["M", 30], ["X", 5]]),
        row("age,gender", "this_month", [["25-34|F", 40], ["18-24|M", 10], ["25-34", 3]]),
        { name: "follower_demographics", breakdown: "age", timeframe: "this_month", state: "unavailable", error_class: "meta-100", results: [] },
      ],
    });
    // the week series never shadows the month series of the same breakdown
    expect(a.engaged_country.results[0]).toEqual({ key: "DE", value: 120 });
    expect(a.engaged_country_week.results).toEqual([{ key: "ES", value: 70 }, { key: "DE", value: 30 }]);
    expect(a.engaged_city_week.state).toBe("not_fetched");
    expect(a.who.engaged_week.age.results).toEqual([{ key: "25-34", value: 50 }, { key: "65+", value: 4 }]);
    expect(a.who.engaged_week.gender.results.map((r) => r.key)).toEqual(["F", "M"]);
    expect(a.who.engaged_month.age_gender.results).toEqual([{ key: "25-34|F", value: 40 }, { key: "18-24|M", value: 10 }]);
    expect(a.who.follower.age).toEqual({ state: "unavailable", reason: "meta-100", results: [] });
    expect(a.who.engaged_week.age_gender.state).toBe("not_fetched");
  });

  it("an older worker answer without age, gender or the last 7 days leaves them not_fetched, never empty-but-ok", () => {
    const a = normalizeAudience(audienceBody);
    expect([a.engaged_country_week.state, a.who.engaged_week.age.state, a.who.follower.gender.state]).toEqual(["not_fetched", "not_fetched", "not_fetched"]);
  });
});

describe("normalizeAudience · follows and unfollows of the last 24 hours (ANA-52)", () => {
  const withFollows = (follows: unknown) => ({ ...audienceBody, follows });
  const ok = (results: Array<{ key: string; value: number }>) => ({ name: "follows_and_unfollows", breakdown: "follow_type", period: "day", since: 1793840000, until: 1793926400, state: "ok", results });

  it("FOLLOWER is gained, NON_FOLLOWER is lost, with the window Meta was asked for", () => {
    const f = normalizeAudience(withFollows(ok([{ key: "FOLLOWER", value: 120 }, { key: "NON_FOLLOWER", value: 50 }]))).follows;
    expect(f).toEqual({ state: "ok", reason: null, since: "2026-11-05T00:53:20.000Z", until: "2026-11-06T00:53:20.000Z", gained: 120, lost: 50 });
  });

  it("a side Meta did not return is unknown (null), never 0; neither side known is unavailable", () => {
    expect(normalizeAudience(withFollows(ok([{ key: "FOLLOWER", value: 7 }]))).follows).toMatchObject({ state: "ok", gained: 7, lost: null });
    expect(normalizeAudience(withFollows(ok([{ key: "SOMETHING_ELSE", value: 7 }]))).follows).toMatchObject({ state: "unavailable", reason: "unknown-follow-types", gained: null, lost: null });
  });

  it("an older worker without follows, a refusal or a bad answer stays a state", () => {
    expect(normalizeAudience(audienceBody).follows).toMatchObject({ state: "not_fetched", reason: "not-returned", gained: null, lost: null });
    expect(normalizeAudience(withFollows({ ...ok([]), state: "unavailable", error_class: "meta-100" })).follows).toMatchObject({ state: "unavailable", reason: "meta-100", gained: null, lost: null });
    expect(normalizeAudience(withFollows({ ...ok([{ key: "FOLLOWER", value: -3 }]) })).follows).toMatchObject({ state: "unavailable", gained: null });
    expect(normalizeAudience(withFollows("nonsense")).follows.state).toBe("not_fetched");
  });
});

describe("normalizeAudience · account signals and online followers (ANA-56)", () => {
  const reach = (over: Record<string, unknown> = {}) => ({ name: "reach", breakdown: "follow_type", period: "day", since: 1791936000, until: 1794355200, state: "ok", total: 1075011, results: [{ key: "FOLLOWER", value: 32302 }, { key: "NON_FOLLOWER", value: 1051492 }], ...over });
  const taps = (over: Record<string, unknown> = {}) => ({ name: "profile_links_taps", breakdown: "contact_button_type", period: "day", state: "ok", total: 0, results: [], ...over });
  const day = (end: string, f: (h: number) => unknown) => ({ end_time: end, hours: Array.from({ length: 24 }, (_, h) => f(h)) });
  const online = (days: unknown[], over: Record<string, unknown> = {}) => ({ name: "online_followers", period: "lifetime", state: "ok", hours_timezone: "unverified", days, ...over });
  const body = (extra: Record<string, unknown>) => normalizeAudience({ ...audienceBody, ...extra });

  it("reach by follow type keeps both groups as Meta reports them; the window is the one Meta was asked for", () => {
    const a = body({ signals: [reach(), taps()] });
    expect(a.reach_split).toEqual({ state: "ok", reason: null, since: "2026-10-14T00:00:00.000Z", until: "2026-11-11T00:00:00.000Z", followers: 32302, non_followers: 1051492 });
    expect(a.contact_taps).toEqual({ state: "ok", reason: null, total: 0 });
  });

  it("an older worker, a refusal, a missing group or a bad total stay a state, never 0", () => {
    const old = normalizeAudience(audienceBody);
    expect([old.reach_split.state, old.contact_taps.state, old.online.state]).toEqual(["not_fetched", "not_fetched", "not_fetched"]);
    expect(old.online.utc_hours).toHaveLength(24);
    expect(body({ signals: [reach({ state: "unavailable", error_class: "meta-100", results: [] })] }).reach_split).toMatchObject({ state: "unavailable", reason: "meta-100", followers: null, non_followers: null });
    expect(body({ signals: [reach({ results: [{ key: "FOLLOWER", value: 5 }] })] }).reach_split).toMatchObject({ state: "unavailable", reason: "missing-follow-type", followers: null });
    expect(body({ signals: [reach({ breakdown: "media_product_type" })] }).reach_split.state).toBe("not_fetched");
    expect(body({ signals: [taps({ total: -1 })] }).contact_taps).toEqual({ state: "unavailable", reason: "no-total", total: null });
    expect(body({ signals: "nonsense" }).contact_taps.state).toBe("not_fetched");
  });

  it("online followers: Meta's Pacific hours land on their UTC hour (PDT: hour 7 → 14 UTC; PST: hour 7 → 15 UTC)", () => {
    const peak7 = (h: number) => (h === 7 ? 33000 : 18000);
    const pdt = body({ online_followers: online([day("2026-10-10T07:00:00+0000", peak7)]) }).online;
    expect(pdt.state).toBe("ok");
    expect(pdt.days).toBe(1);
    expect(pdt.utc_hours[14]).toBe(33000);
    expect(pdt.utc_hours.filter((v) => v === 33000)).toHaveLength(1);
    const pst = body({ online_followers: online([day("2026-11-04T08:00:00+0000", peak7)]) }).online;
    expect(pst.utc_hours[15]).toBe(33000);
  });

  it("the day daylight saving time ends is 25 h long: its start is end_time minus 25 h", () => {
    // ends 2 Nov 08:00 UTC = midnight PST; started 1 Nov 07:00 UTC = midnight PDT, so hour 0 is 07 UTC
    const a = body({ online_followers: online([day("2026-11-02T08:00:00+0000", (h) => (h === 0 ? 999 : 1))]) }).online;
    expect(a.utc_hours[7]).toBe(999);
  });

  it("online followers: the mean per UTC hour over the days; broken days and values are left out, not counted as 0", () => {
    const a = body({
      online_followers: online([
        day("2026-10-10T07:00:00+0000", () => 100),
        day("2026-10-11T07:00:00+0000", (h) => (h === 0 ? null : 200)),
        { end_time: "not a time", hours: Array(24).fill(5000) },
        { end_time: "2026-10-12T07:00:00+0000", hours: [1, 2, 3] },
      ]),
    }).online;
    expect(a.days).toBe(2);
    expect(a.utc_hours[7]).toBe(100); // hour 0 Pacific: only the first day had a value
    expect(a.utc_hours[8]).toBe(150);
  });

  it("online followers refused by Meta or with no usable day are a state", () => {
    expect(body({ online_followers: online([], { state: "unavailable", error_class: "meta-100" }) }).online).toMatchObject({ state: "unavailable", reason: "meta-100", days: 0 });
    expect(body({ online_followers: online([{ end_time: null, hours: Array(24).fill(1) }]) }).online).toMatchObject({ state: "unavailable", reason: "no-usable-day", days: 0 });
  });
});

describe("readAnaPlace / readRelease", () => {
  it("accepts a region label with coordinates and refuses anything else", () => {
    expect(readAnaPlace({ WORLD_ANA_PLACE: "Regionstest;-1.29;36.82" })).toEqual({ label: "Regionstest", lat: -1.29, lon: 36.82, tz: null });
    for (const bad of ["", "Regionstest", "x;100;0", "x;0;181", "<b>;1;1", "a;1.123456;2", "a;1;2;Europe/Berlin;x"]) expect(readAnaPlace({ WORLD_ANA_PLACE: bad })).toBeNull();
    expect(readAnaPlace({})).toBeNull();
  });

  it("takes an optional IANA time zone and drops an unknown one", () => {
    expect(readAnaPlace({ WORLD_ANA_PLACE: "Regionstest;-1.29;36.82;Africa/Nairobi" })?.tz).toBe("Africa/Nairobi");
    expect(readAnaPlace({ WORLD_ANA_PLACE: "Regionstest;-1.29;36.82;Mars/Olympus" })).toEqual({ label: "Regionstest", lat: -1.29, lon: 36.82, tz: null });
    expect(readAnaPlace({ WORLD_ANA_PLACE: "Regionstest;-1.29;36.82;3" })?.tz).toBeNull();
    expect(readAnaPlace({})).toBeNull();
  });

  it("reads the release sha only from a real release directory", () => {
    const sha = "a".repeat(40);
    expect(readRelease(`/srv/dyai/runtime/ana-dashboard/releases/${sha}`, 10, Date.parse("2026-10-31T20:00:10Z"))).toEqual({ sha, started_at: "2026-10-31T20:00:00.000Z" });
    expect(readRelease("/Users/dev/Ana/apps/dashboard", 0).sha).toBeNull();
  });
});

describe("createWorldService — caches, back-off and honest states", () => {
  it("serves pulse within 60 s from memory and reads again after it", async () => {
    let t = 0;
    let likes = 10;
    const w = fakeWorker({ [PULSE_PATH]: () => Response.json(pulseBody(likes)), [AUDIENCE_PATH]: () => Response.json(audienceBody) });
    const service = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, now: () => t, env: { WORLD_ANA_PLACE: "Regionstest;-1.29;36.82" } });
    const first = await service.read();
    expect(first.pulse.state).toBe("ok");
    expect(first.pulse.items[0]?.like_count).toBe(10);
    expect(first.audience.engaged_country.results[0]).toEqual({ key: "DE", value: 120 });
    expect(first.places.ana?.label).toBe("Regionstest");
    expect(first.work).toMatchObject({ state: "not-configured", issues: [] });
    likes = 13;
    t = 30_000;
    expect((await service.read()).pulse.items[0]?.like_count).toBe(10);
    t = 61_000;
    expect((await service.read()).pulse.items[0]?.like_count).toBe(13);
    expect(w.calls.filter((c) => c.startsWith(PULSE_PATH))).toEqual([`${PULSE_PATH}?max=12`, `${PULSE_PATH}?max=12`]);
    expect(w.calls.filter((c) => c === AUDIENCE_PATH)).toHaveLength(1);
  });

  it("passes the follows of the last 24 h and the Reel medians into the payload; without the store the tiles are off", async () => {
    const follows = { name: "follows_and_unfollows", breakdown: "follow_type", period: "day", since: 1793840000, until: 1793926400, state: "ok", results: [{ key: "FOLLOWER", value: 9 }, { key: "NON_FOLLOWER", value: 4 }] };
    const w = fakeWorker({ [PULSE_PATH]: () => Response.json(pulseBody(10)), [AUDIENCE_PATH]: () => Response.json({ ...audienceBody, follows }) });
    const seen: Array<ReelInput | null> = [];
    const reelDaily: ReelDaily = { update: async (input) => (seen.push(input), { state: "on", reels: 1, skip_reels: 1, watch_ms: 20_000, skip_pct: 30, previous: null, store_error: false }) };
    const on = await createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, now: () => 0, reelDaily }).read();
    expect(on.audience.follows).toMatchObject({ state: "ok", gained: 9, lost: 4 });
    expect(on.reel_viewing).toMatchObject({ state: "on", watch_ms: 20_000 });
    expect(seen).toEqual([null]); // Instagram is down in this fake: the store gets nothing, so it stores nothing
    const off = await createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, now: () => 0 }).read();
    expect(off.reel_viewing.state).toBe("off");
  });

  it("gives the store the snapshot's posts and measuring time, marked stale when the snapshot is a fallback", async () => {
    const w = fakeWorker({ [PULSE_PATH]: () => Response.json(pulseBody(10)), [AUDIENCE_PATH]: () => Response.json(audienceBody) });
    const snapshot = normalizeSnapshot(buildSnapshot());
    for (const stale of [false, true]) {
      const seen: Array<ReelInput | null> = [];
      const reelDaily: ReelDaily = { update: async (input) => (seen.push(input), REEL_VIEWING_OFF) };
      const fresh: SnapshotService = { read: async () => (stale ? { ok: true, stale: true, snapshot, failure: { state: "STALE", code: "upstream" } } : { ok: true, stale: false, snapshot }), reset: () => {} };
      await createWorldService({ social: fresh, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, now: () => 0, reelDaily }).read();
      expect(seen[0]?.posts.length).toBe(snapshot.posts.length);
      expect(seen[0]?.observedAt).toBe(snapshot.observed_at);
      expect(seen[0]?.fresh).toBe(!stale);
    }
  });

  it("the Brain digest waits until the stored post categories are read (an append cannot be taken back)", async () => {
    const w = fakeWorker({ [PULSE_PATH]: () => Response.json(pulseBody(10)), [AUDIENCE_PATH]: () => Response.json(audienceBody) });
    let ready = false;
    const scheduled: string[] = [];
    const tagger = { current: () => ({}), schedule: () => undefined, idle: () => Promise.resolve(), ready: () => ready, loaded: () => Promise.resolve() };
    const brain = { schedule: (p: { generated_at: string }) => void scheduled.push(p.generated_at), status: () => ({ state: "on" as const, last_day: null, note: null, reason: null }), idle: () => Promise.resolve() };
    const service = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, tagger, brain });
    expect((await service.read()).brain.state).toBe("on");
    expect(scheduled).toHaveLength(0);
    ready = true;
    await service.read();
    expect(scheduled).toHaveLength(1);
    // without a tagger there is nothing to wait for (the variant with the real tagger and file: brainGate below)
    const plain = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, brain });
    await plain.read();
    expect(scheduled).toHaveLength(2);
  });

  it("brainGate · with the real tagger and a slow history read, no digest reaches the Brain with the categories missing — also while Instagram is down", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gate-"));
    try {
      const file = path.join(dir, "world-post-tags.json");
      const stored = { theme: "beach", ana: "face", shot: "selfie", hook: "place", cta: "none", mood: "calm", country: null, brand: false, confidence: 0.9, model: "m", at: "2026-11-01T00:00:00Z" };
      await writeFile(file, JSON.stringify({ version: TAG_VERSION, tags: { p1: stored } }));
      const tagger = createPostTagger({ key: "k".repeat(30), model: "m", timeoutMs: 100 }, file, (async () => new Response("no", { status: 500 })) as typeof fetch);
      const handed: number[] = [];
      const brain = { schedule: (p: { post_tags: { tags: Record<string, unknown> } }) => void handed.push(Object.keys(p.post_tags.tags).length), status: () => ({ state: "on" as const, last_day: null, note: null, reason: null }), idle: () => Promise.resolve() };
      // the history read is a real await in the middle of read(): the tags file can finish loading during it
      const history = { read: () => new Promise<never[]>((r) => setTimeout(() => r([]), 30)), record: async () => [] };
      const w = fakeWorker({ [PULSE_PATH]: () => Response.json(pulseBody(10)), [AUDIENCE_PATH]: () => Response.json(audienceBody) });
      const service = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, tagger, brain, history });
      await service.read();
      await service.read();
      // Instagram is down in this fixture: the stored categories are still read, so the digest is not held back forever
      expect(handed.length).toBeGreaterThan(0);
      expect(handed.every((n) => n === 1)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("an old worker without the new routes is 'unavailable', a refused key is an error, never data", async () => {
    const missing = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: fakeWorker({}).impl });
    const r = await missing.read();
    expect(r.pulse).toMatchObject({ state: "unavailable", reason: "worker-route-missing", items: [], followers: null });
    expect(r.audience).toMatchObject({ state: "unavailable", engaged_country: { results: [] } });
    const refused = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: fakeWorker({ [PULSE_PATH]: () => Response.json({ error: "unauthorized" }, { status: 401 }) }).impl });
    expect((await refused.read()).pulse).toMatchObject({ state: "error", reason: "auth" });
    const reauth = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: fakeWorker({ [PULSE_PATH]: () => Response.json({ error: "reauth-required" }, { status: 409 }) }).impl });
    expect((await reauth.read()).pulse.state).toBe("permission-required");
  });

  it("keeps the last good pulse after a failure but reports the failure", async () => {
    let t = 0;
    let fail = false;
    const w = fakeWorker({ [PULSE_PATH]: () => (fail ? new Response("x", { status: 502 }) : Response.json(pulseBody(7))) });
    const service = createWorldService({ social, socialConfig: config, readWork: null, workKeys: [], fetchImpl: w.impl, now: () => t });
    await service.read();
    fail = true;
    t = 70_000;
    const r = await service.read();
    expect(r.pulse.items[0]?.like_count).toBe(7);
    expect(r.pulse.state).toBe("error");
  });

  it("without a worker configuration nothing is called and every source says not-configured", async () => {
    const service = createWorldService({ social: null, socialConfig: null, readWork: null, workKeys: [] });
    const r = await service.read();
    expect(r.instagram.ok).toBe(false);
    expect([r.pulse.state, r.audience.state, r.work.state]).toEqual(["not-configured", "not-configured", "not-configured"]);
  });

  it("keeps Jira issues of the registry and in-progress work only", async () => {
    const issue = (key: string, category: "new" | "indeterminate" | "done") => ({ id: key, key, summary: `S ${key}`, status: { id: "1", name: category, category }, assignee: { accountId: "a", displayName: "Ben" }, issueType: "Story", isIdea: false, url: `https://jira.example/${key}` });
    const service = createWorldService({
      social: null,
      socialConfig: null,
      workKeys: ["ANA-47"],
      readWork: async () => ({ ok: true, snapshot: { source: { boardId: 1, boardName: "b", filterId: "f", projectKey: "ANA", site: "s" }, fetchedAt: "x", columns: [], issues: [issue("ANA-47", "new"), issue("ANA-1", "done"), issue("ANA-9", "indeterminate")], unmapped: [], truncated: false } }),
    });
    const r = await service.read();
    expect(r.work.state).toBe("ok");
    expect(r.work.issues.map((i) => i.key)).toEqual(["ANA-47", "ANA-9"]);
  });
});

describe("GET /api/world — same gate as the Instagram route", () => {
  it("refuses cross-site reads", async () => {
    const r = await GET(new Request("http://127.0.0.1:3000/api/world", { headers: { host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" } }));
    expect([401, 403]).toContain(r.status);
  });
});

describe("createWorldService — Ana's look from the newest post's picture", () => {
  const post = (id: string, at: string, extra: Record<string, unknown>) => ({ media_id: id, media_type: "IMAGE", media_product_type: "FEED", format: "image", caption: "a quiet morning", permalink: null, thumbnail_url: null, published_at: at, insights_state: "ok", observations: [], ...extra });
  const withPosts = (posts: unknown[]): SnapshotService => ({ read: async () => ({ ok: true, stale: false, snapshot: { posts } }) as never, reset: () => {} });

  it("reads the picture of a photo post (image_url) and the cover of a video (thumbnail_url)", async () => {
    const seen: Array<string | null> = [];
    const vision = { read: async (_id: string, url: string | null) => (seen.push(url), { look: "scooter" as const, colors: { primary: 0x112233, secondary: 0xffffff }, confidence: 0.9 }) };
    const photo = createWorldService({ social: withPosts([post("p1", "2026-11-01T10:00:00.000Z", { image_url: "https://x.cdninstagram.com/i.jpg" })]), socialConfig: null, readWork: null, workKeys: [], vision });
    const a = (await photo.read()).ana_look;
    expect(seen).toEqual(["https://x.cdninstagram.com/i.jpg"]);
    expect(a).toMatchObject({ look: "scooter", look_source: "image", color_source: "image", image_reader: "on" });
    const video = createWorldService({ social: withPosts([post("v1", "2026-11-01T10:00:00.000Z", { media_type: "VIDEO", thumbnail_url: "https://x.cdninstagram.com/t.jpg", image_url: null })]), socialConfig: null, readWork: null, workKeys: [], vision });
    await video.read();
    expect(seen[1]).toBe("https://x.cdninstagram.com/t.jpg");
  });

  it("says no-cover when the newest post has no picture at all", async () => {
    let calls = 0;
    const vision = { read: async () => (calls++, null) };
    const s = createWorldService({ social: withPosts([post("p2", "2026-11-01T10:00:00.000Z", {})]), socialConfig: null, readWork: null, workKeys: [], vision });
    expect((await s.read()).ana_look.image_reader).toBe("no-cover");
    expect(calls).toBe(0);
  });
});
