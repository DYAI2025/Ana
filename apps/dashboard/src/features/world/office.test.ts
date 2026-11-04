import { describe, expect, it } from "vitest";
import { OFFICE_CONFIRMED, OFFICE_MIN_N, OFFICE_TOPICS, officeView, reactionsOf, type OfficeTopic } from "./office";

const topic = (id: string, reactions: number): OfficeTopic => ({ id, lane: "stories", about: id, evidence: [{ source: "reddit", where: `r/${id}`, title: id, url: `https://www.reddit.com/r/${id}/comments/a/`, date: "2026-11-01", up: reactions, comments: 0 }] });

describe("Ana's office — topics in the matrix", () => {
  const topics = [topic("loud-liked", 500), topic("loud-new", 400), topic("quiet-liked", 50), topic("quiet", 10)];
  // usual save+share rate 0.02; "liked" topics are saved clearly more often
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
    expect(v.read).toBe(Object.keys(postTopics).length);
  });

  it("without the model nothing counts as tested; a weak audience result stays a test, never a starter", () => {
    expect(officeView(topics, posts, null).points.every((p) => p.ana.index === null && p.ana.n === 0)).toBe(true);
    const weak = { g: ["loud-new"], h: ["loud-new"], k: ["loud-new"] };
    const p = officeView(topics, posts, weak).points.find((x) => x.id === "loud-new");
    expect(p?.ana.n).toBe(OFFICE_MIN_N);
    expect((p?.ana.index ?? 9) < OFFICE_CONFIRMED).toBe(true);
    expect(p?.quadrant).toBe("test");
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
