import { describe, expect, it } from "vitest";
import { baseProjection } from "../../../e2e/fake-brain/data.mjs";
import { BRAIN_FAILURE_STATE, neighbours, parseProjection } from "./types";

const clone = () => JSON.parse(JSON.stringify(baseProjection())) as Record<string, unknown> & { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };

describe("parseProjection", () => {
  it("accepts a v1 projection and copies only known fields", () => {
    const raw = clone();
    raw.extra = "leak";
    raw.nodes[0]!.secret = "leak";
    const parsed = parseProjection(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.nodes).toHaveLength(raw.nodes.length);
    expect(parsed.value.edges).toHaveLength(raw.edges.length);
    expect(JSON.stringify(parsed.value)).not.toContain("leak");
  });

  it("accepts a source with data_class UNKNOWN and a null source", () => {
    const raw = clone();
    const src = raw.nodes.find((n) => n.source)!;
    (src.source as Record<string, unknown>).data_class = "UNKNOWN";
    const parsed = parseProjection(raw);
    expect(parsed.ok && parsed.value.nodes.find((n) => n.id === src.id)?.source?.data_class).toBe("UNKNOWN");
    expect(parsed.ok && parsed.value.nodes[0]!.source).toBeNull();
  });

  it.each([
    ["not an object", () => "nope"],
    ["wrong version", () => ({ ...clone(), version: 2 })],
    ["missing embed_model", () => ({ ...clone(), embed_model: undefined })],
    ["nodes not a list", () => ({ ...clone(), nodes: "nope" })],
    ["bad node type", () => { const r = clone(); r.nodes[0]!.type = "secret"; return r; }],
    ["bad status", () => { const r = clone(); r.nodes[0]!.status = "MAYBE"; return r; }],
    ["bad position", () => { const r = clone(); r.nodes[0]!.position = { x: 1, y: "2", z: 0 }; return r; }],
    ["duplicate ids", () => { const r = clone(); r.nodes[1]!.id = r.nodes[0]!.id; return r; }],
    ["edge to unknown node", () => { const r = clone(); r.edges[0]!.to = "missing"; return r; }],
    ["bad relation type", () => { const r = clone(); r.edges[0]!.type = "likes"; return r; }],
    ["malformed source", () => { const r = clone(); r.nodes.find((n) => n.source)!.source = { kind: "x" }; return r; }],
  ])("rejects %s", (_name, make) => {
    expect(parseProjection(make()).ok).toBe(false);
  });
});

describe("failure states", () => {
  it("a Brain that cannot be read is BLOCKED; an answer we cannot trust is UNKNOWN", () => {
    expect(BRAIN_FAILURE_STATE).toEqual({ "not-configured": "BLOCKED", unauthorized: "BLOCKED", unreachable: "BLOCKED", "invalid-response": "UNKNOWN" });
  });
});

describe("neighbours", () => {
  it("follows explicit edges in both directions", () => {
    const edges = [
      { from: "a", to: "b", type: "supports" as const },
      { from: "c", to: "a", type: "answers" as const },
    ];
    expect(neighbours(edges, "a").sort()).toEqual(["b", "c"]);
    expect(neighbours(edges, "z")).toEqual([]);
  });
});
