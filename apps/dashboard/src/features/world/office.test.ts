import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/translate";
import { OFFICE_CONFIRMED, OFFICE_MIN_N, OFFICE_TOPICS, OFFICE_VERSION, officeView, reactionsOf, type OfficeTopic } from "./office";

const topic = (id: string, reactions: number): OfficeTopic => ({ id, lane: "stories", about: id, evidence: [{ source: "reddit", where: `r/${id}`, title: id, url: `https://www.reddit.com/r/${id}/comments/a/`, date: "2026-11-01", up: reactions, comments: 0 }] });

const PINNED = "2026-11-04.1:eeed3faa";

describe("Ana's office — topics in the matrix", () => {
  const topics = [topic("loud-liked", 500), topic("loud-new", 400), topic("quiet-liked", 50), topic("quiet", 10)];
  // usual save+share rate 0.03 (median); "liked" topics are saved clearly more often
  const posts = [
    { id: "a", ssr: 0.04 }, { id: "b", ssr: 0.05 }, { id: "c", ssr: 0.03 },
    { id: "d", ssr: 0.04 }, { id: "e", ssr: 0.05 }, { id: "f", ssr: 0.03 },
    { id: "g", ssr: 0.01 }, { id: "h", ssr: 0.01 }, { id: "i", ssr: 0.02 }, { id: "j", ssr: 0.02 }, { id: "k", ssr: 0.01 }, { id: "l", ssr: null },
  ];
  const postTopics = { a: ["loud-liked"], b: ["loud-liked"], c: ["loud-liked"], d: ["quiet-liked"], e: ["quiet-liked"], f: ["quiet-liked"], g: ["loud-new"], h: [], l: ["loud-new"] };

  it("places topics by outside talk and by how Ana's audience saves and shares", () => {
    const v = officeView(topics, posts, postTopics);
    const by = Object.fromEntries(v.points.map((p) => [p.id, p]));
    expect(v.baseline).toBeCloseTo(0.03);
    expect(v.threshold).toBe((400 + 50) / 2);
    expect(by["loud-liked"]?.quadrant).toBe("starter");
    expect(by["loud-liked"]?.ana.index).toBeCloseTo(0.04 / 0.03);
    expect(by["quiet-liked"]?.quadrant).toBe("niche");
    // one rated post (the unrated one never counts) is not a test
    expect(by["loud-new"]).toMatchObject({ quadrant: "test", ana: { n: 1, index: null, posts: ["g"] } });
    expect(by.quiet?.quadrant).toBe("skip");
    // starters first, then tests, niches, the rest; numbered in that order
    expect(v.points.map((p) => p.n + p.id)).toEqual(["1loud-liked", "2loud-new", "3quiet-liked", "4quiet"]);
    // "l" was read but has no rate: it still counts as read; a reading of a post no longer in view does not
    expect(officeView(topics, posts, { ...postTopics, gone: ["quiet"] }).read).toBe(Object.keys(postTopics).length);
    expect(by["loud-liked"]?.ana.state).toBe("confirmed");
    expect(by["loud-new"]?.ana.state).toBe("untested");
  });

  it("without the model nothing counts as tested; a weak audience result stays a test, never a starter", () => {
    expect(officeView(topics, posts, null).points.every((p) => p.ana.index === null && p.ana.n === 0)).toBe(true);
    const weak = { g: ["loud-new"], h: ["loud-new"], k: ["loud-new"] };
    const p = officeView(topics, posts, weak).points.find((x) => x.id === "loud-new");
    expect(p?.ana.n).toBe(OFFICE_MIN_N);
    expect((p?.ana.index ?? 9) < OFFICE_CONFIRMED).toBe(true);
    expect(p?.quadrant).toBe("test");
    // tested and weak is told apart from untested
    expect(p?.ana.state).toBe("weak");
  });

  it("no usual rate (all zero) leaves every topic untested instead of dividing by zero", () => {
    const zero = posts.map((p) => ({ ...p, ssr: p.ssr === null ? null : 0 }));
    const v = officeView(topics, zero, postTopics);
    expect(v.baseline).toBe(0);
    expect(v.points.every((p) => p.ana.index === null && p.ana.state === "untested")).toBe(true);
  });

  it("every topic has a title in English, German and Italian", () => {
    for (const loc of ["en", "de", "it"] as const) {
      const titles = (dictionaries[loc].world.office.topics as Record<string, string>);
      for (const t of OFFICE_TOPICS) expect(titles[t.id], `${loc}:${t.id}`).toBeTruthy();
      expect(Object.keys(titles).sort()).toEqual(OFFICE_TOPICS.map((t) => t.id).sort());
    }
  });

  it("the catalog the model reads is pinned to its version: change a topic → bump OFFICE_VERSION and this fingerprint", () => {
    let h = 5381;
    for (const ch of OFFICE_TOPICS.map((t) => `${t.id}=${t.about}`).join("\n")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    expect(`${OFFICE_VERSION}:${h.toString(16)}`).toBe(PINNED);
  });

  it("the shipped catalog: real links, unique ids, numbers from the test run", () => {
    expect(new Set(OFFICE_TOPICS.map((t) => t.id)).size).toBe(OFFICE_TOPICS.length);
    for (const t of OFFICE_TOPICS) {
      expect(t.evidence.length).toBeGreaterThan(0);
      for (const e of t.evidence) {
        expect(e.url).toMatch(/^https:\/\/(www\.reddit\.com\/r\/[\w]+\/comments\/[a-z0-9]+\/|www\.youtube\.com\/watch\?v=[\w-]{11})$/);
        expect(e.date).toMatch(/^2026-1[01]-\d\d$/);
      }
    }
    expect(reactionsOf(OFFICE_TOPICS.find((t) => t.id === "quit-to-travel") as OfficeTopic)).toBe(588);
  });
});

describe("office posts — the snapshot and Ana's older posts", () => {
  it("adds the history's posts once, the snapshot wins, and older posts count for the topics", async () => {
    const { officePosts, officeView, OFFICE_TOPICS } = await import("./office");
    const snap = [{ id: "a", format: "reel" as const, caption: null, permalink: null, published_at: "2026-11-04T00:00:00Z", reach: 100, views: null, saves: 1, shares: 1, interactions: null, likes: null, comments: null, counters_at: null, er: null, ssr: 0.02, fresh: false }];
    const hist = (id: string, ssr: number | null) => ({ id, published_at: "2026-08-01T00:00:00Z", format: "reel" as const, cover: null, reach: 100, saves: 5, shares: 5, ssr });
    const all = officePosts(snap, { posts: [hist("a", 0.9), hist("b", 0.1), hist("c", 0.1), hist("d", 0.1), hist("e", null)] });
    expect(all.map((p) => [p.id, p.ssr])).toEqual([["a", 0.02], ["b", 0.1], ["c", 0.1], ["d", 0.1], ["e", null]]);
    const view = officeView(OFFICE_TOPICS, all, { b: ["homesick"], c: ["homesick"], d: ["homesick"], e: ["homesick"] });
    const homesick = view.points.find((p) => p.id === "homesick");
    // three older posts with numbers make the topic tested; the one without numbers does not count
    expect(homesick?.ana.n).toBe(3);
    expect(homesick?.ana.index).not.toBeNull();
    expect(officePosts(snap, null)).toEqual(snap);
    // a snapshot post without its own numbers takes the history's
    const unmeasured = [{ ...(snap[0] as (typeof snap)[number]), ssr: null, reach: null, saves: null, shares: null }];
    expect(officePosts(unmeasured, { posts: [hist("a", 0.3)] })[0]).toMatchObject({ id: "a", ssr: 0.3, reach: 100 });
    expect(officePosts(unmeasured, { posts: [hist("a", 0.3)] })).toHaveLength(1);
  });
});
