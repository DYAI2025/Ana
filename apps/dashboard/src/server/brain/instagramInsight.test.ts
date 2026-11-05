// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Observation, SocialPost, SocialSnapshot } from "@/features/social/types";
import type { PostTags } from "@/features/world/postTags";
import { deriveInsights, insightNote, measurementText, MAX_MEASUREMENT } from "./instagramInsight";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const OBSERVED = "2026-11-03T11:50:00Z";

const obs = (media: string, metric: "reach" | "saves" | "shares", value: number | null): Observation => ({
  account_id: "synthetic-account",
  media_id: media,
  provider: "instagram",
  provider_api_version: "v26.0",
  metric_name: metric,
  native_metric_name: metric === "saves" ? "saved" : metric,
  value,
  unit: metric === "reach" ? "accounts" : "count",
  period: "lifetime",
  availability_state: value === null ? "UNAVAILABLE" : "VERIFIED",
  availability_reason: null,
  observed_at: OBSERVED,
  baseline_definition: null,
  source_reference: `instagram:media/${media}/insights#${metric}`,
});

function post(id: string, saves: number | null, shares: number, reach: number, format: SocialPost["format"] = "reel", ageDays = 30): SocialPost {
  return {
    media_id: id,
    media_type: "VIDEO",
    media_product_type: "REELS",
    format,
    caption: `SECRET CAPTION ${id}`,
    permalink: `https://www.instagram.com/reel/${id}/`,
    thumbnail_url: null,
    published_at: new Date(NOW - ageDays * 86_400_000).toISOString(),
    insights_state: "ok",
    observations: [obs(id, "reach", reach), obs(id, "saves", saves), obs(id, "shares", shares)],
  };
}

const snapshot = (posts: SocialPost[]): SocialSnapshot =>
  ({ provider: "instagram", provider_api_version: "v26.0", account_id: "synthetic-account", handle: "synthetic", observed_at: OBSERVED, served_at: OBSERVED, coverage: {}, account: [], posts }) as unknown as SocialSnapshot;

const tag = (theme: PostTags["theme"], confidence = 0.9): PostTags => ({ theme, ana: "face", shot: "action", hook: "place", cta: "none", mood: "calm", country: null, brand: false, confidence });

// beach: 10 %, 12 %, 2 %; the other reels: 4 %, 5 %, 6 %
const POSTS = [post("101", 80, 20, 1000), post("102", 100, 20, 1000), post("103", 10, 10, 1000), post("201", 30, 10, 1000), post("202", 40, 10, 1000), post("203", 50, 10, 1000)];
const TAGS: Record<string, PostTags> = { "101": tag("beach"), "102": tag("beach"), "103": tag("beach"), "201": tag("city"), "202": tag("food"), "203": tag("culture") };

describe("deriveInsights", () => {
  it("compares a theme with the other posts of the same format and keeps both sides of the evidence", () => {
    const { insights } = deriveInsights(snapshot(POSTS), TAGS, NOW);
    const beach = insights.find((i) => i.theme === "beach");
    expect(beach).toMatchObject({ id: "kn-ig-resonanz-reel-beach", format: "reel", status: "DERIVED", direction: "above", n: 3, restN: 3, observedAt: OBSERVED, day: "2026-11-03" });
    expect(beach?.themeMedian).toBeCloseTo(0.1);
    expect(beach?.restMedian).toBeCloseTo(0.05);
    expect(beach?.supporting.map((p) => p.id)).toEqual(["102", "101"]);
    expect(beach?.contradicting.map((p) => p.id)).toEqual(["103"]);
    expect(insights).toHaveLength(1);
  });

  it("keeps the id stable across later snapshots with other values", () => {
    const later = deriveInsights(snapshot([post("101", 500, 20, 9000), ...POSTS.slice(1)]), TAGS, NOW + 86_400_000);
    expect(later.insights[0]?.id).toBe("kn-ig-resonanz-reel-beach");
  });

  it("an unmeasured metric is UNKNOWN, never zero", () => {
    const { insights } = deriveInsights(snapshot([post("104", null, 20, 1000), ...POSTS]), { ...TAGS, "104": tag("beach") }, NOW);
    const beach = insights.find((i) => i.theme === "beach");
    expect(beach?.n).toBe(3);
    expect(beach?.unknownIds).toEqual(["104"]);
    expect(beach?.supporting.concat(beach.contradicting).map((p) => p.id)).not.toContain("104");
  });

  it("too few posts make no insight, a missing comparison group makes an UNKNOWN one", () => {
    expect(deriveInsights(snapshot(POSTS.slice(0, 2)), TAGS, NOW).insights).toEqual([]);
    const { insights } = deriveInsights(snapshot(POSTS.slice(0, 3)), TAGS, NOW);
    expect(insights[0]).toMatchObject({ status: "UNKNOWN", direction: null, restN: 0, restMedian: null });
  });

  it("does not count young posts, other formats or unsure categories", () => {
    const young = [post("301", 90, 10, 1000, "reel", 2), ...POSTS];
    const otherFormat = [post("302", 90, 10, 1000, "image"), ...POSTS];
    const unsure = [post("303", 90, 10, 1000), ...POSTS];
    const n = (posts: SocialPost[], tags: Record<string, PostTags>) => deriveInsights(snapshot(posts), tags, NOW).insights.find((i) => i.theme === "beach")?.n;
    expect(n(young, { ...TAGS, "301": tag("beach") })).toBe(3);
    expect(n(otherFormat, { ...TAGS, "302": tag("beach") })).toBe(3);
    expect(n(unsure, { ...TAGS, "303": tag("beach", 0.2) })).toBe(3);
  });
});

describe("the written note", () => {
  const insight = deriveInsights(snapshot(POSTS), TAGS, NOW).insights[0];
  if (!insight) throw new Error("fixture");

  it("carries the whole contract and separates observation from interpretation", () => {
    const line = measurementText(insight);
    const note = insightNote(insight);
    expect(note.source_refs[0]).toEqual({ source: "src-instagram-insights", locator: "instagram:media-insights?format=reel&theme=beach" });
    expect(note.body).toContain("(Saves + Shares) ÷ Reichweite");
    expect(line).toMatch(/^IG-INSIGHT tag=2026-11-03 v=1 status=DERIVED/);
    expect(line).toContain(`observed_at=${OBSERVED}`);
    expect(line).toContain("Datenalter=10 min");
    expect(line).toContain("instagram:media/102 saves=100 count shares=20 count reach=1000 accounts");
    expect(line).toContain("BELEGE dafür");
    expect(line).toContain("BELEGE dagegen: instagram:media/103");
    expect(line.indexOf("BEOBACHTUNG (SOURCE)")).toBeLessThan(line.indexOf("ABLEITUNG (DERIVED)"));
    expect(line.indexOf("ABLEITUNG (DERIVED)")).toBeLessThan(line.indexOf("INTERPRETATION"));
    expect(line).toContain("SUBSTACK-HYPOTHESE (CANDIDATE, unbelegt)");
  });

  it("invents no outcome: no caption, no community or purchase claim beyond the stated limit", () => {
    const text = `${measurementText(insight)} ${insightNote(insight).body}`;
    expect(text).not.toContain("SECRET CAPTION");
    expect(text).toContain("keine Aussage über Bedürfnis, Kaufabsicht oder Umsatz");
    expect(text).toContain("nur Posts dieses Kontos, keine Aussage über die Community");
    expect(text).not.toMatch(/Nachfrage besteht|Kunden wollen|Umsatz steigt|die Community will/i);
  });

  it("no hypothesis without a clear lead", () => {
    const flat = deriveInsights(snapshot([post("101", 40, 10, 1000), post("102", 45, 10, 1000), post("103", 50, 10, 1000), ...POSTS.slice(3)]), TAGS, NOW).insights[0];
    expect(flat && measurementText(flat)).toContain("SUBSTACK-HYPOTHESE: keine");
  });

  it("stays inside the Brain's observation limit in the worst case and says what it left out", async () => {
    const long = (n: number) => String(n).padStart(18, "9");
    const theme = Array.from({ length: 40 }, (_, i) => post(long(i), i < 25 ? 90_000 : 100, 90_000, 999_999));
    const rest = Array.from({ length: 10 }, (_, i) => post(long(100 + i), 9_000, 9_000, 999_999));
    const missing = Array.from({ length: 9 }, (_, i) => post(long(200 + i), null, 1, 999_999));
    const tags: Record<string, PostTags> = Object.fromEntries([...theme, ...missing].map((p) => [p.media_id, tag("transport")]));
    for (const p of rest) tags[p.media_id] = tag("city");
    const big = deriveInsights(snapshot([...theme, ...rest, ...missing]), tags, NOW).insights.find((i) => i.theme === "transport");
    const line = big ? measurementText(big) : "";
    expect(line.length).toBeGreaterThan(1000);
    expect(line.length).toBeLessThanOrEqual(MAX_MEASUREMENT);
    expect(line).toMatch(/\+\d+ weitere/);
  });
});

describe("the Brain's limit, at its edge", () => {
  it("gives up the references last, and then keeps only their count", () => {
    const snap = { ...snapshot(POSTS), coverage: { retrieved: 50, posts_with_insights: 38, halted: "x".repeat(950) } } as unknown as SocialSnapshot;
    const beach = deriveInsights(snap, TAGS, NOW).insights[0];
    const line = beach ? measurementText(beach) : "";
    expect(line.length).toBeLessThanOrEqual(MAX_MEASUREMENT);
    expect(line).not.toContain("instagram:media/");
    expect(line).toContain("+3 weitere");
  });
});

describe("the comparison is honest", () => {
  it("counts only classified posts as the others, and names how many were left out", () => {
    const unread = post("401", 900, 100, 1000);
    const low = post("402", 900, 100, 1000);
    const { insights } = deriveInsights(snapshot([...POSTS, unread, low]), { ...TAGS, "402": tag("city", 0.1) }, NOW);
    const beach = insights.find((i) => i.theme === "beach");
    expect(beach?.restN).toBe(3);
    expect(beach?.restMedian).toBeCloseTo(0.05);
    expect(beach?.unclassified).toBe(2);
    expect(beach && measurementText(beach)).toContain("2 Posts ohne sichere Themen-Lesung");
  });

  it("writes nothing for a format whose posts are not read yet: a partial reading must not become the day's measurement", () => {
    const unread = Array.from({ length: 6 }, (_, i) => post(`5${i}`, 90, 10, 1000));
    const r = deriveInsights(snapshot([...POSTS, ...unread]), TAGS, NOW);
    expect(r.insights).toEqual([]);
    expect(r.unreadFormats).toEqual(["reel"]);
  });

  it("an UNKNOWN block still carries what was measured", () => {
    const u = deriveInsights(snapshot(POSTS.slice(0, 3)), TAGS, NOW).insights[0];
    const line = u ? measurementText(u) : "";
    expect(line).toContain("status=UNKNOWN");
    expect(line).toContain("GEMESSEN: instagram:media/102 saves=100 count");
    expect(line).toContain("n=3");
    expect(line).not.toContain("BELEGE dafür");
  });

  it("names the comparison posts and the coverage, so the derivation can be retraced", () => {
    const snap = { ...snapshot(POSTS), coverage: { retrieved: 50, posts_with_insights: 38, halted: "rate-limit" } } as unknown as SocialSnapshot;
    const beach = deriveInsights(snap, TAGS, NOW).insights[0];
    const line = beach ? measurementText(beach) : "";
    expect(line).toContain("VERGLEICHSGRUPPE: instagram:media/203 rate=6.00 %");
    expect(line).toContain("Abdeckung: 38 von 50 Posts mit Werten");
    expect(line).toContain("abgebrochen: rate-limit");
  });

  it("unmeasured comparison posts are named as UNKNOWN too", () => {
    const beach = deriveInsights(snapshot([...POSTS, post("204", null, 1, 1000)]), { ...TAGS, "204": tag("city") }, NOW).insights.find((i) => i.theme === "beach");
    expect(beach?.restUnknown).toBe(1);
    expect(beach && measurementText(beach)).toContain("1 Posts der Vergleichsgruppe");
  });

  it("evidence sides: strongest first, and a post level with the comparison is on no side of above/below", () => {
    const rate = (id: string, pctValue: number) => post(id, pctValue * 10, 0, 1000);
    const rest = [rate("201", 4), rate("202", 5), rate("203", 6)];
    const tags = (ids: string[]): Record<string, PostTags> => ({ ...Object.fromEntries(ids.map((i) => [i, tag("beach")])), "201": tag("city"), "202": tag("food"), "203": tag("culture") });
    const above = deriveInsights(snapshot([rate("1", 1), rate("2", 3), rate("3", 8), rate("4", 9), rate("5", 7), rate("6", 5), ...rest]), tags(["1", "2", "3", "4", "5", "6"]), NOW).insights[0];
    expect(above?.direction).toBe("above");
    expect(above?.supporting.map((p) => p.id)).toEqual(["4", "3", "5"]);
    expect(above?.contradicting.map((p) => p.id)).toEqual(["1", "2"]);
    expect(above?.level).toBe(1);
    const below = deriveInsights(snapshot([rate("1", 5), rate("2", 3), rate("3", 2), ...rest]), tags(["1", "2", "3"]), NOW).insights[0];
    expect(below?.direction).toBe("below");
    expect(below?.supporting.map((p) => p.id)).toEqual(["3", "2"]);
    expect(below?.contradicting).toEqual([]);
    const equal = deriveInsights(snapshot([rate("1", 4), rate("2", 5), rate("3", 6), ...rest]), tags(["1", "2", "3"]), NOW).insights[0];
    expect(equal?.direction).toBe("equal");
    expect(equal?.supporting.map((p) => p.id)).toEqual(["2"]);
    expect(equal?.contradicting.map((p) => p.id).sort()).toEqual(["1", "3"]);
  });

  it("a verified reach of 0 is not called a missing value", () => {
    const zero = post("105", 0, 0, 0);
    const beach = deriveInsights(snapshot([zero, ...POSTS]), { ...TAGS, "105": tag("beach") }, NOW).insights.find((i) => i.theme === "beach");
    expect(beach?.unknownIds).toEqual(["105"]);
    const line = beach ? measurementText(beach) : "";
    expect(line).toContain("ohne berechenbare Rate");
    expect(line).not.toContain("Werte fehlen");
  });

  it("each block states its own rule; the note does not pin a version it cannot change", () => {
    const beach = deriveInsights(snapshot(POSTS), TAGS, NOW).insights[0];
    if (!beach) throw new Error("fixture");
    expect(measurementText(beach, 2)).toContain("v=2");
    expect(measurementText(beach, 2)).toContain("Regel: reif ab 7 Tagen, je Seite mindestens 3 Posts");
    expect(insightNote(beach).body).not.toMatch(/Version \d|ab 7 Tagen|mindestens 3/);
  });
});
