// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AudienceSeries } from "@/features/world/types";
import { berlinDay, historyEntry, historyFile, legacyHistoryFile, readHistory, recordHistory, HISTORY_MAX_DAYS, type HistoryEntry } from "./audienceHistory";

const ok = (rows: Array<[string, number]>): AudienceSeries => ({ state: "ok", reason: null, results: rows.map(([key, value]) => ({ key, value })) });
const none: AudienceSeries = { state: "not_fetched", reason: "not-returned", results: [] };
const NOW = Date.parse("2026-11-02T23:30:00Z"); // 00:30 on 3 Nov in Berlin

describe("audience history — daily aggregated snapshots, no captions, no people", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "world-hist-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("a day is the Berlin calendar day", () => {
    expect(berlinDay(NOW)).toBe("2026-11-03");
  });

  it("an entry keeps the 7-day audience and only the posts of those 7 days (id, format, time)", () => {
    const e = historyEntry(NOW, "2026-11-02T20:00:00.000Z", { country: ok([["ES", 7], ["DE", 3]]), age: ok([["25-34", 5]]), gender: none }, [
      { id: "new", format: "reel", published_at: "2026-11-01T10:00:00.000Z" },
      { id: "old", format: "image", published_at: "2026-10-20T10:00:00.000Z" },
      { id: "undated", format: "image", published_at: null },
    ]);
    expect(e).toEqual({
      day: "2026-11-03",
      fetched_at: "2026-11-02T20:00:00.000Z",
      week: { country: [["ES", 7], ["DE", 3]], age: [["25-34", 5]], gender: [] },
      posts: [{ id: "new", format: "reel", published_at: "2026-11-01T10:00:00.000Z" }],
    });
    expect(JSON.stringify(e)).not.toMatch(/caption/);
  });

  it("no entry when the last 7 days are unknown", () => {
    expect(historyEntry(NOW, "2026-11-02T20:00:00.000Z", { country: none, age: none, gender: none }, [])).toBeNull();
  });

  it("one entry per day (the later read wins), sorted, capped, and a broken file reads as empty", async () => {
    const file = path.join(dir, "h.json");
    const entry = (day: string, n: number): HistoryEntry => ({ day, fetched_at: `${day}T10:00:00.000Z`, week: { country: [["DE", n]], age: [], gender: [] }, posts: [] });
    await recordHistory(entry("2026-11-02", 1), file);
    await recordHistory(entry("2026-11-01", 1), file);
    const kept = await recordHistory(entry("2026-11-02", 9), file);
    expect(kept.map((e) => [e.day, e.week.country[0]?.[1]])).toEqual([["2026-11-01", 1], ["2026-11-02", 9]]);
    expect((await readHistory(file)).length).toBe(2);
    const many = Array.from({ length: HISTORY_MAX_DAYS + 5 }, (_, i) => entry(new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), i));
    for (const e of many.slice(-HISTORY_MAX_DAYS - 2)) await recordHistory(e, file);
    expect((await readHistory(file)).length).toBe(HISTORY_MAX_DAYS);
    await (await import("node:fs/promises")).writeFile(file, "not json");
    expect(await readHistory(file)).toEqual([]);
    expect((await readFile(file, "utf8")).length).toBeGreaterThan(0);
  });

  it("lives in the StateDirectory on the VPS, not in the cache; a missing state file is seeded from the old cache file", async () => {
    const env = { STATE_DIRECTORY: path.join(dir, "state"), CACHE_DIRECTORY: path.join(dir, "cache") };
    expect(historyFile(env)).toBe(path.join(dir, "state", "world-audience-history.json"));
    expect(historyFile({ ...env, WORLD_STATE_DIR: "/e2e" })).toBe(path.join("/e2e", "world-audience-history.json"));
    expect(historyFile({ CACHE_DIRECTORY: env.CACHE_DIRECTORY })).toBe(path.join(dir, "cache", "world-audience-history.json"));
    const legacy = legacyHistoryFile(env);
    expect(legacy).toBe(path.join(dir, "cache", "world-audience-history.json"));
    expect(legacyHistoryFile({ CACHE_DIRECTORY: env.CACHE_DIRECTORY })).toBeNull();
    const e: HistoryEntry = { day: "2026-11-02", fetched_at: "2026-11-02T10:00:00.000Z", week: { country: [["DE", 1]], age: [], gender: [] }, posts: [] };
    await recordHistory(e, legacy as string);
    const own = historyFile(env);
    expect(await readHistory(own, legacy)).toEqual([e]);
    const next = { ...e, day: "2026-11-03" };
    // the first write to the state file carries the cached days over; from then on the state file alone counts
    expect((await recordHistory(next, own, legacy)).map((x) => x.day)).toEqual(["2026-11-02", "2026-11-03"]);
    await recordHistory({ ...e, day: "2026-10-30" }, legacy as string);
    expect((await readHistory(own, legacy)).map((x) => x.day)).toEqual(["2026-11-02", "2026-11-03"]);
  });
});
