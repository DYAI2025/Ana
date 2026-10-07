import { describe, expect, it } from "vitest";
import { baseProjection } from "../../../e2e/fake-brain/data.mjs";
import { focusSet, matchesFilter } from "./focus";
import type { BrainNode } from "./types";

const p = baseProjection();
const byId = (id: string) => p.nodes.find((n) => n.id === id)!;
const typeName = (n: BrainNode) => ({ method: "Method", workshop: "Workshop", question: "Question" })[n.type as string] ?? n.type;
const input = { nodes: p.nodes, edges: p.edges, clusters: p.clusters, filter: "", cluster: null, selected: null, typeName };

describe("matchesFilter", () => {
  it("matches title, type, topics and cluster label; every word must match", () => {
    expect(matchesFilter(byId("kn-hook-first-cut-brief"), "hook", "Method", "Cut brief")).toBe(true);
    expect(matchesFilter(byId("kn-hook-first-cut-brief"), "method", "Method", "Cut brief")).toBe(true);
    expect(matchesFilter(byId("kn-warmup-method"), "workshop practice", "Method", "Workshop practice")).toBe(true);
    expect(matchesFilter(byId("qu-best-hook-length"), "top cut brief", "Question", "Open questions")).toBe(true); // topic id
    expect(matchesFilter(byId("kn-hook-first-cut-brief"), "hook zebra", "Method", "Cut brief")).toBe(false);
    expect(matchesFilter(byId("kn-hook-first-cut-brief"), "  ", "Method", "Cut brief")).toBe(true);
  });
});

describe("focusSet", () => {
  it("is null when nothing is active", () => {
    expect(focusSet(input)).toBeNull();
  });

  it("a filter keeps its matches and their explicit neighbours bright, dims the rest", () => {
    const bright = focusSet({ ...input, filter: "energy" })!;
    expect([...bright].sort()).toEqual(["kn-break-observation", "kn-timebox-concept", "qu-remote-workshops", "src-synthetic-notes"]);
    expect(bright.has("tl-synthetic-editor")).toBe(false);
  });

  it("a cluster focus keeps only the cluster; with a filter both intersect", () => {
    expect(focusSet({ ...input, cluster: "c3" })).toEqual(new Set(p.nodes.filter((n) => n.cluster === "c3").map((n) => n.id)));
    expect([...focusSet({ ...input, cluster: "c3", filter: "energy" })!].sort()).toEqual(["kn-break-observation", "qu-remote-workshops"]);
  });

  it("a selection shows the note and its explicit neighbours, overriding filter and cluster", () => {
    const bright = focusSet({ ...input, filter: "energy", cluster: "c0", selected: "ws-workshop-02" })!;
    expect([...bright].sort()).toEqual(["kn-hook-first-cut-brief", "src-synthetic-agenda", "ws-workshop-02"]);
  });
});
