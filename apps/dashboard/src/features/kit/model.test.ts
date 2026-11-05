import { describe, expect, it } from "vitest";
import type { Observation, SocialPost } from "@/features/social/types";
import { series, N, world as baseWorld } from "@/features/world/worldFixture";
import type { WorldPayload } from "@/features/world/types";
import { EMPTY_KIT_CONFIG, parseKitConfig } from "./config";
import { landDots, MAP_SOUTH, project, type KitGeo } from "./map";
import { buildKit, type KitSection } from "./model";

const o = (media: string | null, metric: Observation["metric_name"], value: number | null, state: Observation["availability_state"] = "VERIFIED"): Observation => ({
  account_id: "acc", media_id: media, provider: "instagram", provider_api_version: "v26.0", metric_name: metric, native_metric_name: metric, value: state === "VERIFIED" ? value : null,
  unit: metric === "avg_watch_time" ? "ms" : "count", period: media ? "lifetime" : "28d", availability_state: state, availability_reason: state === "VERIFIED" ? null : "meta-100",
  observed_at: "2026-11-03T09:00:00.000Z", baseline_definition: null, source_reference: "test",
});
const reel = (id: string, views: number | null, extra: Partial<SocialPost> = {}, watchMs: number | null = 15_000): SocialPost => ({
  media_id: id, media_type: "VIDEO", media_product_type: "REELS", format: "reel", caption: `SECRET caption ${id}`,
  permalink: `https://www.instagram.com/reel/${id}/`, thumbnail_url: `https://scontent.cdninstagram.com/${id}.jpg`, published_at: "2026-10-20T10:00:00.000Z", insights_state: "ok",
  observations: [o(id, "views", views, views === null ? "UNAVAILABLE" : "VERIFIED"), o(id, "reach", 900), o(id, "avg_watch_time", watchMs, watchMs === null ? "NOT_FETCHED" : "VERIFIED")],
  ...extra,
});

function world(mut: (w: WorldPayload) => void = () => undefined): WorldPayload {
  const w = baseWorld();
  if (w.instagram.ok) {
    w.instagram.snapshot.account = [o(null, "reach", 48_200), o(null, "views", 131_000), o(null, "accounts_engaged", null, "UNAVAILABLE"), o(null, "total_interactions", 3_900), o(null, "followers", 4_900)];
    w.instagram.snapshot.posts = [
      reel("r1", 5_000),
      reel("r2", 90_000),
      reel("r3", null),
      { ...reel("c1", 999_999), format: "carousel", media_product_type: "FEED" },
      reel("r4", 12_000, { permalink: "https://evil.example/reel/r4", thumbnail_url: "http://insecure.example/r4.jpg" }, null),
    ];
  }
  w.audience.engaged_country = series([["DE", 40], ["IN", 25], ["TH", 15], ["US", 12], ["GB", 8]]);
  w.audience.follower_country = series([["US", 30], ["DE", 50], ["GB", 20]]);
  w.audience.who.engaged_month = { age: series([["35-44", 20], ["18-24", 30], ["25-34", 50], ["unknown", 9]]), gender: series([["M", 30], ["F", 65], ["U", 5], ["X", 3]]), age_gender: N };
  w.audience.who.follower = { age: series([["25-34", 100]]), gender: series([["F", 80], ["M", 20]]), age_gender: N };
  mut(w);
  return w;
}

const geo: KitGeo = {
  land: { width: 720, height: 296, full: 360, path: "M3 3h0" },
  centroids: new Map([
    ["DE", { lat: 51, lon: 10 }],
    ["IN", { lat: 22, lon: 79 }],
    ["TH", { lat: 15, lon: 101 }],
    ["US", { lat: 39, lon: -98 }],
  ]),
};
const sectionOf = <T extends KitSection["id"]>(m: ReturnType<typeof buildKit>, id: T) => m.sections.find((s) => s.id === id) as Extract<KitSection, { id: T }> | undefined;

describe("buildKit — numbers", () => {
  it("shows only VERIFIED numbers: an unavailable one is left out, never 0 — even when it carries a value", () => {
    const m = buildKit({
      world: world((w) => {
        if (w.instagram.ok) w.instagram.snapshot.account.unshift({ ...o(null, "accounts_engaged", 1), value: 777, availability_state: "ERROR" });
      }),
      config: EMPTY_KIT_CONFIG,
      presetId: "asia",
    });
    const tiles = sectionOf(m, "numbers")!.tiles;
    const ids = tiles.map((t) => t.id);
    expect(ids).not.toContain("engaged");
    expect(ids).toEqual(["reach", "views", "engagement", "watch", "hold", "followers"]);
    expect(tiles.every((t) => Number.isFinite(t.value))).toBe(true);
  });

  it("followers come from the live pulse first; engagement is interactions per account reached; hold is 100 − skip", () => {
    const m = buildKit({ world: world(), config: EMPTY_KIT_CONFIG });
    const t = Object.fromEntries(sectionOf(m, "numbers")!.tiles.map((x) => [x.id, x]));
    expect(t.followers!.value).toBe(5010);
    expect(t.engagement!.value).toBeCloseTo((3900 / 48_200) * 100, 6);
    expect(t.watch).toMatchObject({ value: 28.13, kind: "seconds" });
    expect(t.hold).toMatchObject({ value: 65.5, kind: "percent" });
    expect(m.hero.tiles.map((x) => x.id)).toEqual(["followers", "reach", "views"]);
    // the hero says the period: 28-day totals never read as all-time; the rate says it is by reach
    expect(m.hero.tiles.map((x) => x.short)).toEqual([null, "Last 28 days", "Last 28 days"]);
    expect(t.engagement).toMatchObject({ label: "Engagement rate (by reach)", short: "Interactions ÷ reach, 28 days" });
  });

  it("without a pulse the snapshot's followers count; without reach there is no engagement rate", () => {
    const m = buildKit({
      world: world((w) => {
        w.pulse = { ...w.pulse, state: "error", followers: null };
        if (w.instagram.ok) w.instagram.snapshot.account = [o(null, "reach", null, "ERROR"), o(null, "total_interactions", 3900), o(null, "followers", 4900)];
        w.reel_viewing = { ...w.reel_viewing, watch_ms: null, skip_pct: null };
      }),
      config: EMPTY_KIT_CONFIG,
    });
    expect(sectionOf(m, "numbers")!.tiles.map((t) => [t.id, t.value])).toEqual([["followers", 4900]]);
  });

  it("without Instagram there are no numbers and no Reels, and the preview says why", () => {
    const m = buildKit({ world: world((w) => { w.instagram = { ok: false, failure: { state: "ERROR", code: "upstream" } }; w.pulse = { ...w.pulse, state: "error", followers: null }; w.reel_viewing = { ...w.reel_viewing, state: "off" }; }), config: EMPTY_KIT_CONFIG });
    expect(sectionOf(m, "numbers")).toBeUndefined();
    expect(sectionOf(m, "reels")).toBeUndefined();
    expect(m.as_of).toBeNull();
    expect(m.hidden.join("\n")).toMatch(/Instagram is not reachable/);
  });
});

describe("buildKit — sections and Ana's content", () => {
  it("an empty config hides case studies, packages, add-ons, the line and the button, and names them for the preview", () => {
    const m = buildKit({ world: world(), config: EMPTY_KIT_CONFIG });
    expect(m.sections.map((s) => s.id)).toEqual(["numbers", "audience", "reels"]);
    expect(m.tagline).toBeNull();
    expect(m.contact).toBeNull();
    expect(m.hidden).toEqual(expect.arrayContaining([expect.stringMatching(/^Case studies/), expect.stringMatching(/^Packages/), expect.stringMatching(/^Add-ons/), expect.stringMatching(/line under her name/), expect.stringMatching(/button/)]));
  });

  it("with content: the preset's order, the button with its subject, add-ons alone still show the packages section", () => {
    const config = parseKitConfig({ tagline: "Ana's words", contact: { email: "hi@example.com", subject: "Collab & more" }, cases: [{ brand: "B" }], addons: [{ name: "Exclusivity" }] });
    const m = buildKit({ world: world(), config, presetId: "west" });
    expect(m.sections.map((s) => s.id)).toEqual(["audience", "numbers", "proof", "reels", "packages"]);
    expect(sectionOf(m, "packages")).toMatchObject({ packages: [], addons: [{ name: "Exclusivity" }] });
    expect(m.contact).toEqual({ href: "mailto:hi@example.com?subject=Collab%20%26%20more", label: "Work with Ana" });
    expect(m.tagline).toBe("Ana's words");
    expect(m.hidden.some((h) => h.startsWith("Add-ons"))).toBe(false);
  });

  it("a section the preset leaves out is not shown; the preview offers every preset", () => {
    const config = parseKitConfig({ presets: { lean: { sections: ["reels"], label: "Lean" } } });
    const m = buildKit({ world: world(), config, presetId: "lean" });
    expect(m.sections.map((s) => s.id)).toEqual(["reels"]);
    expect(m.preset).toEqual({ id: "lean", label: "Lean" });
    expect(m.presets.map((p) => p.id)).toEqual(["default", "asia", "west", "lean"]);
  });

  it("never carries captions or other world data to the page", () => {
    const json = JSON.stringify(buildKit({ world: world(), config: EMPTY_KIT_CONFIG, geo }));
    expect(json).not.toMatch(/SECRET|caption|travelcreatorgigs|issues/);
  });
});

describe("buildKit — audience per preset", () => {
  it("asia: the engaged audience, the brand's markets first by share, their sum, highlighted markers", () => {
    const a = sectionOf(buildKit({ world: world(), config: EMPTY_KIT_CONFIG, presetId: "asia", geo }), "audience")!.audience;
    expect(a.basis).toBe("engaged");
    expect(a.countries.map((c) => [c.code, c.focus])).toEqual([["IN", true], ["TH", true], ["DE", false], ["US", false], ["GB", false]]);
    expect(a.focus!.label).toBe("Asia-Pacific & India");
    expect(a.focus!.share).toBeCloseTo(0.4, 9);
    expect(a.countries[0]!.name).toBe("India");
    const markers = Object.fromEntries(a.map!.markers.map((m) => [m.code, m]));
    expect(markers.IN!.focus).toBe(true);
    expect(markers.DE!.focus).toBe(false);
    // the largest country has the largest marker; a country without a centroid has none
    expect(markers.DE!.r).toBeGreaterThan(markers.US!.r);
    expect(markers.GB).toBeUndefined();
  });

  it("west leads with the followers and their ages; without follower countries it falls back to the engaged, and says so", () => {
    const west = sectionOf(buildKit({ world: world(), config: EMPTY_KIT_CONFIG, presetId: "west" }), "audience")!.audience;
    expect(west).toMatchObject({ basis: "followers", basis_label: "Followers", who_label: "Followers" });
    expect(west.countries.map((c) => c.code)).toEqual(["DE", "US", "GB"]);
    expect(west.focus!.share).toBeCloseTo(1, 6);
    const fallback = sectionOf(buildKit({ world: world((w) => { w.audience.follower_country = N; }), config: EMPTY_KIT_CONFIG, presetId: "west" }), "audience")!.audience;
    expect(fallback.basis).toBe("engaged");
    expect(fallback.basis_label).toBe("Engaged accounts · last 30 days");
  });

  it("each country group is capped on its own: the biggest market elsewhere never drops out", () => {
    const rows: Array<[string, number]> = [["DE", 30], ["IN", 9], ["TH", 8], ["ID", 7], ["VN", 6], ["PH", 5], ["MY", 4], ["SG", 3], ["JP", 2], ["US", 20], ["GB", 6]];
    const a = sectionOf(buildKit({ world: world((w) => { w.audience.engaged_country = series(rows); }), config: EMPTY_KIT_CONFIG, presetId: "asia" }), "audience")!.audience;
    expect(a.countries.filter((c) => c.focus).map((c) => c.code)).toEqual(["IN", "TH", "ID", "VN", "PH", "MY"]);
    expect(a.countries.filter((c) => !c.focus).map((c) => c.code)).toEqual(["DE", "US"]);
    // the focus share counts every listed market, not only the ones shown
    expect(a.focus!.share).toBeCloseTo(44 / 100, 9);
  });

  it("the default has no focus; ages in band order, genders labelled, unknown keys dropped", () => {
    const a = sectionOf(buildKit({ world: world(), config: EMPTY_KIT_CONFIG }), "audience")!.audience;
    expect(a.focus).toBeNull();
    expect(a.countries.every((c) => !c.focus)).toBe(true);
    expect(a.age.map((x) => x.key)).toEqual(["18-24", "25-34", "35-44"]);
    expect(a.gender.map((g) => g.label)).toEqual(["Women", "Men", "Not stated"]);
    expect(a.map).toBeNull();
  });

  it("no audience from Meta: no audience section", () => {
    const m = buildKit({ world: world((w) => { w.audience = { ...w.audience, state: "error" }; }), config: EMPTY_KIT_CONFIG });
    expect(sectionOf(m, "audience")).toBeUndefined();
    expect(m.hidden.some((h) => h.startsWith("Audience"))).toBe(true);
  });
});

describe("buildKit — Reels", () => {
  it("the Reels with the most views, Reels only; links only to Instagram, covers only over https", () => {
    const r = sectionOf(buildKit({ world: world(), config: EMPTY_KIT_CONFIG }), "reels")!.reels;
    expect(r.map((x) => x.id)).toEqual(["r2", "r4", "r1", "r3"]);
    expect(r[0]).toMatchObject({ link: "https://www.instagram.com/reel/r2/", cover: "https://scontent.cdninstagram.com/r2.jpg", views: 90_000, watch_s: 15 });
    expect(r[1]).toMatchObject({ link: null, cover: null, watch_s: null });
    // a Reel without views comes after every Reel with views, however large its reach
    expect(r[3]).toMatchObject({ views: null, reach: 900 });
  });

  it("Reels with measured views always rank before Reels with only a reach", () => {
    const big = reel("big", null);
    big.observations = big.observations.map((x) => (x.metric_name === "reach" ? { ...x, value: 5_000_000 } : x));
    const r = sectionOf(buildKit({ world: world((w) => { if (w.instagram.ok) w.instagram.snapshot.posts.push(big); }), config: EMPTY_KIT_CONFIG }), "reels")!.reels;
    expect(r.map((x) => x.id)).toEqual(["r2", "r4", "r1", "big", "r3"]);
  });

  it("a preset's Reels in its order; ids not in the snapshot are skipped", () => {
    const config = parseKitConfig({ presets: { b: { reels: ["r1", "gone", "r3"] } } });
    const m = buildKit({ world: world(), config, presetId: "b" });
    expect(sectionOf(m, "reels")!.reels.map((x) => x.id)).toEqual(["r1", "r3"]);
    expect(m.hero.covers).toEqual([
      { id: "r1", src: "https://scontent.cdninstagram.com/r1.jpg" },
      { id: "r3", src: "https://scontent.cdninstagram.com/r3.jpg" },
    ]);
  });
});

describe("map", () => {
  it("dots on the step grid, nothing south of the cut; projection matches the raster", () => {
    const width = 36;
    const height = 18;
    const land = new Uint8Array(width * height).fill(1);
    const dots = landDots({ width, height, land }, 6);
    expect(dots.height).toBe(Math.floor(((90 - MAP_SOUTH) / 180) * height));
    expect(dots.path.split("M").filter(Boolean)).toEqual(["3 3h0", "9 3h0", "15 3h0", "21 3h0", "27 3h0", "33 3h0", "3 9h0", "9 9h0", "15 9h0", "21 9h0", "27 9h0", "33 9h0"]);
    expect(landDots({ width, height, land: new Uint8Array(width * height) }).path).toBe("");
    expect(project({ lat: 0, lon: 0 }, { width: 720, full: 360 })).toEqual({ x: 360, y: 180 });
    expect(project({ lat: 90, lon: -180 }, { width: 720, full: 360 })).toEqual({ x: 0, y: 0 });
  });
});
