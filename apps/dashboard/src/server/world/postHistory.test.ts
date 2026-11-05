// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPostHistory, HISTORY_EVERY_MS, INSIGHTS_BATCH, INSIGHTS_GAP_MS, parseHistory, parseInsights } from "./postHistory";

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
    },
  };
}
const metric = (name: string, value: number) => ({ name, value, state: "ok", period: "lifetime" });
function insightsFor(ids: string[]) {
  return { items: ids.map((id) => ({ id, insights: { state: "ok", metrics: [metric("reach", 1000), metric("saved", Number(id) % 10), metric("shares", 1), metric("views", 5)] } })) };
}

function fakeWorker(opts: { history?: () => unknown | number; insights?: (ids: string[]) => unknown | number } = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push(u.pathname + u.search);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${config.key}`);
    const r = u.pathname === "/internal/media-history" ? (opts.history ?? (() => list(200)))() : (opts.insights ?? insightsFor)((u.searchParams.get("ids") ?? "").split(","));
    if (typeof r === "number") return new Response(JSON.stringify({ error: "x" }), { status: r });
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("Ana's last 200 posts — parsing", () => {
  it("keeps id, time, format, cover and caption; skips items without id or time", () => {
    const items = parseHistory({ media: { items: [...list(2).media.items, { id: "x" }, { id: "5", timestamp: "never" }] } });
    expect(items).toEqual([
      { id: "1000", published_at: new Date(NOW).toISOString(), format: "reel", cover: "https://scontent.cdninstagram.com/t/0.jpg", caption: "SECRET caption 0" },
      { id: "1001", published_at: new Date(NOW - DAY).toISOString(), format: "reel", cover: "https://scontent.cdninstagram.com/t/1.jpg", caption: "SECRET caption 1" },
    ]);
    expect(parseHistory({ nope: 1 })).toBeNull();
  });

  it("reads reach, saves and shares of ok and partial posts only; missing metrics are null", () => {
    const got = parseInsights({
      items: [
        { id: "1", insights: { state: "ok", metrics: [metric("reach", 100), metric("saved", 3), metric("shares", 2)] } },
        { id: "2", insights: { state: "partial", metrics: [metric("reach", 50), { name: "saved", value: null, state: "unavailable" }] } },
        { id: "3", insights: { state: "not_fetched", metrics: [] } },
        { id: "4", insights: { state: "error", metrics: [] } },
      ],
    });
    expect([...got.entries()]).toEqual([
      ["1", { reach: 100, saves: 3, shares: 2 }],
      ["2", { reach: 50, saves: null, shares: null }],
    ]);
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
    const ids = new URL(`https://x${w.calls[1]}`).searchParams.get("ids")?.split(",") ?? [];
    expect(ids).toHaveLength(INSIGHTS_BATCH);
    // newest posts outside the snapshot first
    expect(ids[0]).toBe("1050");
    let cur = h.current();
    expect(cur.posts).toHaveLength(200);
    expect(cur.waiting).toBe(150 - 40);
    expect(cur.posts.find((p) => p.id === "1050")).toMatchObject({ reach: 1000, saves: 0, shares: 1, ssr: 0.001, format: "reel", cover: "https://scontent.cdninstagram.com/t/50.jpg" });
    // the snapshot's posts are never asked here: their numbers are live there
    expect(cur.posts.find((p) => p.id === "1010")).toMatchObject({ reach: null, ssr: null });
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
    const asked = new URL(`https://x${w.calls[1]}`).searchParams.get("ids")?.split(",");
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
    expect(h.current()).toMatchObject({ posts: [], failing: "http-502" });
    up = true;
    now += 30 * 60_000;
    h.schedule([]);
    await h.idle();
    expect(w.calls).toHaveLength(1);
    now += 31 * 60_000;
    h.schedule([]);
    await h.idle();
    expect(h.current()).toMatchObject({ failing: null, waiting: 3 });
    expect(h.current().posts.every((p) => p.reach === null)).toBe(true);
  });

  it("only her last 200 posts stay; a store it cannot read is never overwritten", async () => {
    const w = fakeWorker({ history: () => list(5) });
    const h = createPostHistory(config, file, w.impl, () => now);
    h.schedule([]);
    await h.idle();
    now = NOW + 2 * DAY;
    const shifted = fakeWorker({ history: () => ({ media: { items: list(3).media.items.map((m, i) => ({ ...m, id: String(2000 + i) })) } }) });
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
