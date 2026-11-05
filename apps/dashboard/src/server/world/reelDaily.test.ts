// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Observation, SocialPost } from "@/features/social/types";
import { createReelDaily, reelMedians, REEL_DAYS_MAX } from "./reelDaily";

const obs = (id: string, metric: Observation["metric_name"], value: number | null, state: Observation["availability_state"] = value === null ? "NOT_FETCHED" : "VERIFIED"): Observation => ({
  account_id: "acc",
  media_id: id,
  provider: "instagram",
  provider_api_version: "v26.0",
  metric_name: metric,
  native_metric_name: metric,
  value,
  unit: metric === "avg_watch_time" ? "ms" : "percent",
  period: "lifetime",
  availability_state: state,
  availability_reason: null,
  observed_at: "2026-11-05T10:00:00.000Z",
  baseline_definition: null,
  source_reference: "test",
});
const reel = (id: string, watch: number | null, skip: number | null, format: SocialPost["format"] = "reel"): SocialPost => ({
  media_id: id,
  media_type: "VIDEO",
  media_product_type: format === "reel" ? "REELS" : "FEED",
  format,
  caption: null,
  permalink: null,
  thumbnail_url: null,
  published_at: "2026-11-01T10:00:00.000Z",
  insights_state: "ok",
  observations: [obs(id, "avg_watch_time", watch), obs(id, "skip_rate", skip)],
});
const DAY1 = Date.parse("2026-11-05T10:00:00.000Z");
const DAY2 = Date.parse("2026-11-06T10:00:00.000Z");

describe("reelMedians", () => {
  it("takes the median of the measured Reels only, each value on its own", () => {
    const m = reelMedians([reel("a", 10_000, 30), reel("b", 20_000, null), reel("c", 40_000, 50), reel("d", null, 40), reel("e", 99_000, 99, "carousel")]);
    expect(m).toEqual({ reels: 3, watch_ms: 20_000, skip_pct: 40 });
  });
  it("an even count averages the two middle values; nothing measured is null, never 0", () => {
    expect(reelMedians([reel("a", 10_000, 20), reel("b", 30_000, 40)])).toEqual({ reels: 2, watch_ms: 20_000, skip_pct: 30 });
    expect(reelMedians([reel("a", null, null)])).toEqual({ reels: 0, watch_ms: null, skip_pct: null });
  });
});

describe("createReelDaily — one value per Berlin day, compared with the day before", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "reel-daily-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("has no comparison on the first day, then compares with the stored day before", async () => {
    let t = DAY1;
    const file = path.join(dir, "reel.json");
    const d = createReelDaily({ file, now: () => t });
    const first = await d.update([reel("a", 20_000, 30)]);
    expect(first).toEqual({ state: "on", reels: 1, watch_ms: 20_000, skip_pct: 30, previous: null, store_error: false });
    t = DAY2;
    const second = await d.update([reel("a", 22_000, 28)]);
    expect(second.previous).toEqual({ day: "2026-11-05", watch_ms: 20_000, skip_pct: 30 });
    expect(second.watch_ms).toBe(22_000);
    // a new process reads the stored days
    const again = await createReelDaily({ file, now: () => DAY2 }).update([reel("a", 23_000, 27)]);
    expect(again.previous).toEqual({ day: "2026-11-05", watch_ms: 20_000, skip_pct: 30 });
  });

  it("the latest read of a day is that day's value, and an unchanged value is not written again", async () => {
    let t = DAY1;
    const file = path.join(dir, "reel.json");
    let writes = 0;
    const d = createReelDaily({ file, now: () => t, onWrite: () => writes++ });
    await d.update([reel("a", 20_000, 30)]);
    await d.update([reel("a", 20_000, 30)]);
    expect(writes).toBe(1);
    t = DAY1 + 3_600_000;
    await d.update([reel("a", 21_000, 31)]);
    expect(writes).toBe(2);
    const stored = JSON.parse(await readFile(file, "utf8"));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ day: "2026-11-05", watch_ms: 21_000, skip_pct: 31 });
    t = DAY2;
    expect((await d.update([reel("a", 25_000, 30)])).previous).toEqual({ day: "2026-11-05", watch_ms: 21_000, skip_pct: 31 });
  });

  it("without Instagram today has no value, the day before is still shown, and nothing is written", async () => {
    let t = DAY1;
    const file = path.join(dir, "reel.json");
    let writes = 0;
    const d = createReelDaily({ file, now: () => t, onWrite: () => writes++ });
    await d.update([reel("a", 20_000, 30)]);
    t = DAY2;
    const r = await d.update(null);
    expect(r).toMatchObject({ reels: 0, watch_ms: null, skip_pct: null, previous: { day: "2026-11-05", watch_ms: 20_000, skip_pct: 30 } });
    expect(writes).toBe(1);
  });

  it("keeps at most REEL_DAYS_MAX days; a broken file starts over, a failed write is reported", async () => {
    const file = path.join(dir, "reel.json");
    const old = Array.from({ length: REEL_DAYS_MAX + 5 }, (_, i) => ({ day: `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, "0")}`, watch_ms: 1000 + i, skip_pct: 10, reels: 3, at: "2026-01-01T00:00:00.000Z" }));
    await writeFile(file, JSON.stringify(old));
    await createReelDaily({ file, now: () => DAY1 }).update([reel("a", 20_000, 30)]);
    const kept = JSON.parse(await readFile(file, "utf8"));
    expect(kept).toHaveLength(REEL_DAYS_MAX);
    expect(kept.at(-1).day).toBe("2026-11-05");

    await writeFile(file, "{not json");
    const fresh = await createReelDaily({ file, now: () => DAY1 }).update([reel("a", 20_000, 30)]);
    expect(fresh).toMatchObject({ previous: null, store_error: false });

    const blocked = await createReelDaily({ file: path.join(dir, "missing-dir", "x", "reel.json"), now: () => DAY1, mkdir: false }).update([reel("a", 20_000, 30)]);
    expect(blocked).toMatchObject({ watch_ms: 20_000, store_error: true });
  });

  it("a stored day with a bad shape is ignored, never compared", async () => {
    const file = path.join(dir, "reel.json");
    await writeFile(file, JSON.stringify([{ day: "2026-11-04", watch_ms: "x" }, { day: "2026-11-03", watch_ms: 9000, skip_pct: 20, reels: 2, at: "2026-11-03T10:00:00.000Z" }]));
    const r = await createReelDaily({ file, now: () => DAY1 }).update([reel("a", 20_000, 30)]);
    expect(r.previous).toEqual({ day: "2026-11-03", watch_ms: 9000, skip_pct: 20 });
  });
});
