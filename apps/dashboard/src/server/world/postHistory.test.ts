// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPostHistory, measuredIds, HISTORY_EVERY_MS, INSIGHTS_BATCH, INSIGHTS_GAP_MS, INSIGHTS_TRIES, parseHistory, parseInsights } from "./postHistory";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const DAY = 86_400_000;
const config = { workerOrigin: "https://worker.invalid", key: "k".repeat(40), timeoutMs: 5_000, maxPosts: 50, cacheMs: 0, minRefreshMs: 0 };

/** n posts, one a day, newest first; the first `reels` are Reels */
function list(n: number) {
  return {
    media: {
      items: Array.from({ length: n }, (_, i) => ({
        id: String(1000 + i),
        media_type: i % 5 === 4 ? "IMAGE" : "VIDEO",
        media_product_type: i % 5 === 4 ? "FEED" : "REELS",
        timestamp: new Date(NOW - i * DAY).toISOString().replace(".000Z", "+0000"),
        thumbnail_url: `https://scontent.cdninstagram.com/t/${i}.jpg`,
        caption: `SECRET caption ${i}`,
      })),
      // a complete list: all she has (fewer than 200) or 200 of more
      has_more: n >= 200,
      stopped: null,
    },
  };
}
const metric = (name: string, value: number) => ({ name, value, state: "ok", period: "lifetime" });
function insightsFor(ids: string[]) {
  return { items: ids.map((id) => ({ id, insights: { state: "ok", metrics: [metric("reach", 1000), metric("saved", Number(id) % 10), metric("shares", 1), metric("views", 5)] } })) };
}

function fakeWorker(opts: { history?: () => unknown | number; insights?: (ids: string[]) => unknown | number } = {}) {
  const calls: string[] = [];
  const auth: Array<string | null> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push(u.pathname + u.search);
    auth.push(new Headers(init?.headers).get("authorization"));
    const r = u.pathname === "/internal/media-history" ? (opts.history ?? (() => list(200)))() : (opts.insights ?? insightsFor)((u.searchParams.get("ids") ?? "").split(","));
    if (typeof r === "number") return new Response(JSON.stringify({ error: "x" }), { status: r });
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls, auth };
}
const idsOf = (call: string | undefined) => new URL(`https://x${call ?? ""}`).searchParams.get("ids")?.split(",") ?? [];

describe("Ana's last 200 posts — parsing", () => {
  it("keeps id, time, format, cover and caption; skips items without id or time", () => {
    const parsed = parseHistory({ media: { items: [...list(2).media.items, { id: "x" }, { id: "5", timestamp: "never" }, { ...list(1).media.items[0], id: "6", thumbnail_url: "http://plain.invalid/t.jpg" }], has_more: false, stopped: null } });
    expect(parsed?.full).toBe(true);
    expect(parsed?.items.find((i) => i.id === "6")?.cover).toBeNull();
    expect(parsed?.items.slice(0, 2)).toEqual([
      { id: "1000", published_at: new Date(NOW).toISOString(), format: "reel", cover: "https://scontent.cdninstagram.com/t/0.jpg", caption: "SECRET caption 0" },
      { id: "1001", published_at: new Date(NOW - DAY).toISOString(), format: "reel", cover: "https://scontent.cdninstagram.com/t/1.jpg", caption: "SECRET caption 1" },
    ]);
    expect(parseHistory({ nope: 1 })).toBeNull();
    // a list the worker stopped early, or shorter than asked while more exist, is not complete
    expect(parseHistory({ media: { items: list(30).media.items, has_more: true, stopped: "subrequest-budget" } })?.full).toBe(false);
    expect(parseHistory({ media: { items: list(30).media.items, has_more: true, stopped: null } })?.full).toBe(false);
    expect(parseHistory({ media: { items: list(200).media.items, has_more: true, stopped: null } })?.full).toBe(true);
  });

  it("reads reach, saves and shares; an answer is final only when each of the three is measured or does not apply", () => {
    const got = parseInsights({
      items: [
        { id: "1", insights: { state: "ok", metrics: [metric("reach", 100), metric("saved", 3), metric("shares", 2)] } },
        { id: "2", insights: { state: "partial", metrics: [metric("reach", 50), { name: "saved", value: null, state: "unavailable" }, { name: "shares", value: null, state: "unavailable" }] } },
        { id: "3", insights: { state: "partial", metrics: [metric("reach", 50), metric("saved", 1), { name: "shares", value: null, state: "not_fetched" }] } },
        { id: "4", insights: { state: "unavailable", metrics: [] } },
        { id: "5", insights: { state: "not_fetched", metrics: [] } },
        { id: "6", insights: { state: "error", metrics: [] } },
      ],
    });
    expect([...got.entries()]).toEqual([
      ["1", { reach: 100, saves: 3, shares: 2, final: true }],
      ["2", { reach: 50, saves: null, shares: null, final: true }],
      ["3", { reach: 50, saves: 1, shares: null, final: false }],
      ["4", { reach: null, saves: null, shares: null, final: true }],
    ]);
  });
});

describe("Ana's last 200 posts — which snapshot posts the snapshot measured", () => {
  it("only posts with verified reach, saves and shares; the rest is read from the history", () => {
    const o = (metric_name: string, value: number | null, availability_state = "VERIFIED") => ({ metric_name, value, availability_state });
    expect(
      measuredIds([
        { media_id: "1", observations: [o("reach", 10), o("saves", 1), o("shares", 0)] },
        { media_id: "2", observations: [o("reach", 10), o("saves", 1)] },
        { media_id: "3", observations: [o("reach", 10), o("saves", 1), o("shares", null, "UNAVAILABLE")] },
        { media_id: "4", observations: [] },
      ]),
    ).toEqual(["1"]);
  });
});

describe("Ana's last 200 posts — reading and storing", () => {
  let dir = "";
  let file = "";
  let now = NOW;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "history-"));
    file = path.join(dir, "world-post-history.json");
    now = NOW;
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the list once a day and numbers for mature posts outside the snapshot, 40 per call, one call per pause", async () => {
    const w = fakeWorker();
    const h = createPostHistory(config, file, w.impl, () => now);
    const snapshot = Array.from({ length: 50 }, (_, i) => String(1000 + i));
    h.schedule(snapshot);
    await h.idle();
    expect(w.calls[0]).toBe("/internal/media-history?max=200");
    expect(w.calls).toHaveLength(2);
    expect(w.auth.every((a) => a === `Bearer ${config.key}`)).toBe(true);
    const ids = idsOf(w.calls[1]);
    expect(ids).toHaveLength(INSIGHTS_BATCH);
    // newest posts outside the snapshot first
    expect(ids[0]).toBe("1050");
    let cur = h.current();
    // the snapshot's measured posts are neither asked nor sent: the board takes them from the snapshot
    expect(cur).toMatchObject({ total: 200, oldest: new Date(NOW - 199 * DAY).toISOString() });
    expect(cur.posts).toHaveLength(150);
    expect(cur.posts.find((p) => p.id === "1010")).toBeUndefined();
    expect(cur.waiting).toBe(150 - 40);
    expect(cur.posts.find((p) => p.id === "1050")).toMatchObject({ reach: 1000, saves: 0, shares: 1, ssr: 0.001, format: "reel", cover: "https://scontent.cdninstagram.com/t/50.jpg" });
    expect(h.tagged()[0]).toEqual({ id: "1000", cover: "https://scontent.cdninstagram.com/t/0.jpg", caption: "SECRET caption 0" });

    // within the pause nothing is asked
    h.schedule(snapshot);
    await h.idle();
    expect(w.calls).toHaveLength(2);
    // after it the next 40, until all are read; the list itself only once a day
    for (let i = 0; i < 3; i += 1) {
      now += INSIGHTS_GAP_MS;
      h.schedule(snapshot);
      await h.idle();
    }
    expect(w.calls.filter((c) => c.startsWith("/internal/media-history"))).toHaveLength(1);
    cur = h.current();
    expect(cur.waiting).toBe(0);
    now += INSIGHTS_GAP_MS;
    h.schedule(snapshot);
    await h.idle();
    expect(w.calls).toHaveLength(5);

    // stored: numbers and days only, never captions or covers
    const stored = await readFile(file, "utf8");
    expect(stored).not.toContain("SECRET");
    expect(stored).not.toContain("cdninstagram");
    expect(JSON.parse(stored).posts["1050"]).toMatchObject({ reach: 1000, saves: 0, shares: 1 });

    now = NOW + HISTORY_EVERY_MS;
    h.schedule(snapshot);
    await h.idle();
    expect(w.calls.filter((c) => c.startsWith("/internal/media-history"))).toHaveLength(2);
  });

  it("posts younger than 7 days wait for their numbers; a restart keeps the numbers already read", async () => {
    const w = fakeWorker({ history: () => list(10) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    const asked = idsOf(w.calls[1]);
    expect(asked).toEqual(["1007", "1008", "1009"]);
    const again = fakeWorker({ history: () => list(10) });
    const h2 = createPostHistory(config, file, again.impl, () => now);
    h2.schedule([]);
    await h2.idle();
    expect(again.calls).toEqual(["/internal/media-history?max=200"]);
    expect(h2.current().posts.find((p) => p.id === "1009")?.ssr).toBeCloseTo(10 / 1000);
  });

  it("a failed list is tried again after an hour and named; failed numbers are asked again later, never stored as zero", async () => {
    let up = false;
    const w = fakeWorker({ history: () => (up ? list(10) : 502), insights: (ids) => ({ items: ids.map((id) => ({ id, insights: { state: "not_fetched", reason: "subrequest-budget", metrics: [] } })) }) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    expect(h.current()).toMatchObject({ posts: [], total: 0, list_failing: "http-502" });
    up = true;
    now += 30 * 60_000;
    h.schedule([]);
    await h.idle();
    expect(w.calls).toHaveLength(1);
    now += 31 * 60_000;
    h.schedule([]);
    await h.idle();
    expect(h.current()).toMatchObject({ list_failing: null, waiting: 3 });
    expect(h.current().posts.every((p) => p.reach === null)).toBe(true);
  });

  it("a list the worker stopped early adds what it has, deletes nothing, and is read again in an hour", async () => {
    let short = false;
    const w = fakeWorker({ history: () => (short ? { media: { items: list(25).media.items, has_more: true, stopped: "subrequest-budget" } } : { media: { ...list(100).media, has_more: false } }) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    for (let i = 0; i < 3; i += 1) {
      now += INSIGHTS_GAP_MS;
      h.schedule([]);
      await h.idle();
    }
    expect(h.current().waiting).toBe(0);
    short = true;
    now = NOW + HISTORY_EVERY_MS;
    const h2 = createPostHistory(config, file, w.impl, () => now);
    h2.schedule([]);
    await h2.idle();
    expect(h2.current()).toMatchObject({ total: 100, list_failing: "incomplete" });
    expect(h2.current().posts.find((p) => p.id === "1090")?.ssr).not.toBeNull();
    const lists = () => w.calls.filter((c) => c.startsWith("/internal/media-history")).length;
    const before = lists();
    now += 30 * 60_000;
    h2.schedule([]);
    await h2.idle();
    expect(lists()).toBe(before);
    now += 31 * 60_000;
    h2.schedule([]);
    await h2.idle();
    expect(lists()).toBe(before + 1);
  });

  it("an answer still missing a number is asked again, keeps what came, and is settled after a few tries; 'does not apply' is final at once", async () => {
    const answers: Record<string, unknown> = {
      "1007": { state: "partial", metrics: [metric("reach", 100), metric("saved", 4), { name: "shares", value: null, state: "not_fetched" }] },
      "1008": { state: "unavailable", metrics: [] },
      "1009": { state: "ok", metrics: [metric("reach", 100), metric("saved", 1), metric("shares", 1)] },
    };
    const w = fakeWorker({ history: () => ({ media: { ...list(10).media, has_more: false } }), insights: (ids) => ({ items: ids.map((id) => ({ id, insights: answers[id] })) }) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    let cur = h.current();
    expect(cur.waiting).toBe(1);
    expect(cur.posts.find((p) => p.id === "1007")).toMatchObject({ reach: 100, saves: 4, shares: null, ssr: null });
    expect(cur.posts.find((p) => p.id === "1008")).toMatchObject({ reach: null, ssr: null });
    // asked again after 6 hours, only the unsettled one, until it is settled after the last try
    for (let i = 1; i < INSIGHTS_TRIES; i += 1) {
      now += 6 * 3_600_000;
      h.schedule([]);
      await h.idle();
      expect(idsOf(w.calls.at(-1))).toEqual(["1007"]);
    }
    cur = h.current();
    expect(cur.waiting).toBe(0);
    // settled posts are never asked again (later calls ask only posts that have grown old enough since)
    const from = w.calls.length;
    now += 48 * 3_600_000;
    h.schedule([]);
    await h.idle();
    const later = w.calls.slice(from).filter((c) => c.startsWith("/internal/media-insights")).flatMap(idsOf);
    expect(later.filter((id) => ["1007", "1008", "1009"].includes(id))).toEqual([]);
  });

  it("a failed numbers call pauses all numbers for an hour, names it apart from the list, and counts against no post", async () => {
    let up = false;
    const w = fakeWorker({ history: () => ({ media: { ...list(10).media, has_more: false } }), insights: (ids) => (up ? insightsFor(ids) : 502) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    expect(h.current()).toMatchObject({ list_failing: null, numbers_failing: "http-502", waiting: 3 });
    up = true;
    for (const step of [INSIGHTS_GAP_MS, 30 * 60_000]) {
      now += step;
      h.schedule([]);
      await h.idle();
    }
    expect(w.calls.filter((c) => c.startsWith("/internal/media-insights"))).toHaveLength(1);
    now += 30 * 60_000;
    h.schedule([]);
    await h.idle();
    expect(h.current()).toMatchObject({ numbers_failing: null, waiting: 0 });
    expect(h.current().posts.find((p) => p.id === "1009")?.ssr).not.toBeNull();
  });

  it("an empty list is not read again on every call", async () => {
    const w = fakeWorker({ history: () => ({ media: { items: [], has_more: false, stopped: null } }) });
    const h = createPostHistory(config, file, w.impl, () => now);
    for (let i = 0; i < 3; i += 1) {
      h.schedule([]);
      await h.idle();
      now += 60_000;
    }
    expect(w.calls).toHaveLength(1);
  });

  it("only her last 200 posts stay; a store it cannot read is never overwritten", async () => {
    const w = fakeWorker({ history: () => list(5) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    now = NOW + 2 * DAY;
    const shifted = fakeWorker({ history: () => ({ media: { items: list(3).media.items.map((m, i) => ({ ...m, id: String(2000 + i) })), has_more: false, stopped: null } }) });
    const h2 = createPostHistory(config, file, shifted.impl, () => now);
    h2.schedule([]);
    await h2.idle();
    expect(Object.keys(JSON.parse(await readFile(file, "utf8")).posts).sort()).toEqual(["2000", "2001", "2002"]);

    for (const broken of ["{ nope", JSON.stringify({ version: 2, posts: {} }), JSON.stringify({ version: 1 })]) {
      await writeFile(file, broken);
      const b = fakeWorker();
      const h3 = createPostHistory(config, file, b.impl, () => now);
      h3.schedule([]);
      await h3.idle();
      expect(await readFile(file, "utf8")).toBe(broken);
      expect(b.calls).toHaveLength(0);
      expect(h3.current().store_error).toBe(true);
    }
  });
});
