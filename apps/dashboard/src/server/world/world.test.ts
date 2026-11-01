// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SocialConfig } from "@/server/social/config";
import type { SnapshotService } from "@/server/social/service";
import { GET } from "@/app/api/world/route";
import { normalizeAudience, normalizePulse } from "./normalize";
import { readAnaPlace, readRelease } from "./presence";
import { AUDIENCE_PATH, createWorldService, PULSE_PATH } from "./service";

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
});

describe("readAnaPlace / readRelease", () => {
  it("accepts a region label with coordinates and refuses anything else", () => {
    expect(readAnaPlace({ WORLD_ANA_PLACE: "Regionstest;-1.29;36.82" })).toEqual({ label: "Regionstest", lat: -1.29, lon: 36.82 });
    for (const bad of ["", "Regionstest", "x;100;0", "x;0;181", "<b>;1;1", "a;1.123456;2", "a;1;2;3"]) expect(readAnaPlace({ WORLD_ANA_PLACE: bad })).toBeNull();
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
