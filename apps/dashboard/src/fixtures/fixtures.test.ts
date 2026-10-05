import { describe, expect, it } from "vitest";
import { BRAIN_EDGES, BRAIN_NODES, neighbours } from "./brain";
import { EVENTS } from "./calendar";
import { SOURCE_GROUPS, TOOLS } from "./connections";
import { SESSIONS } from "./sessions";

describe("brain fixture", () => {
  it("has unique node ids and only edges between existing nodes", () => {
    const ids = BRAIN_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const edge of BRAIN_EDGES) {
      expect(ids).toContain(edge.from);
      expect(ids).toContain(edge.to);
    }
  });

  it("is centred and fits the unit sphere", () => {
    const n = BRAIN_NODES.length;
    const centroid = BRAIN_NODES.reduce((acc, { position: p }) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n, z: acc.z + p.z / n }), { x: 0, y: 0, z: 0 });
    expect(Math.hypot(centroid.x, centroid.y, centroid.z)).toBeLessThan(0.01);
    for (const { position: p } of BRAIN_NODES) expect(Math.hypot(p.x, p.y, p.z)).toBeLessThanOrEqual(1.001);
  });

  it("every node is connected to something", () => {
    for (const node of BRAIN_NODES) expect(neighbours(node.id).length).toBeGreaterThan(0);
  });
});

describe("prototype honesty", () => {
  it("never claims a connected source or a configured tool link", () => {
    expect(SOURCE_GROUPS.every((g) => g.state === "not-connected")).toBe(true);
    expect(TOOLS.every((tool) => tool.url === null)).toBe(true);
  });

  it("marks every transcript line as fictional in every language", () => {
    for (const session of SESSIONS) {
      for (const line of session.transcript) {
        expect(line.text.en.startsWith("[Fictional]")).toBe(true);
        expect(line.text.de.startsWith("[Fiktiv]")).toBe(true);
        expect(line.text.it.startsWith("[Fittizio]")).toBe(true);
      }
    }
  });

  it("contains no URLs, e-mail addresses or phone-like numbers in fixture text", () => {
    const corpus = JSON.stringify({ SESSIONS, EVENTS, TOOLS, BRAIN_NODES });
    expect(corpus).not.toMatch(/https?:\/\//);
    expect(corpus).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(corpus).not.toMatch(/\+\d{2}|\d{9,}/); // international prefix or long digit runs (ISO dates stay allowed)
  });
});

describe("cross-module consistency", () => {
  it("a session that also appears in the calendar has the same date there", async () => {
    const { SESSIONS } = await import("./sessions");
    const { EVENTS } = await import("./calendar");
    const workshop02 = SESSIONS.find((s) => s.id === "workshop-02")!;
    const event = EVENTS.find((e) => e.id === "e-workshop-02")!;
    expect(workshop02.date).toBe(event.date);
    expect(workshop02.start).toBe(event.start);
  });
});
