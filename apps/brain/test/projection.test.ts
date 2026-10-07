import { describe, expect, it } from "vitest";
import { Indexer } from "../src/index/indexer.js";
import { OllamaEmbedder } from "../src/index/ollama.js";
import { clusterCount, kmeans, pca } from "../src/projection/math.js";
import { buildProjection, noteEmbeddings, projection } from "../src/projection/projection.js";
import { Vault } from "../src/vault/vault.js";
import { fakeOllama, MemoryStore, seed, syntheticVault } from "./helpers.js";

describe("projection", () => {
  it("is deterministic, inside the unit sphere, with explicit edges only", async () => {
    const ollama = await fakeOllama();
    try {
      const root = syntheticVault();
      seed(root, "src-restricted-doc", "source", "Restricted synthetic record.\n", {
        source: { kind: "drive_doc", locator: "SECRET-DRIVE-ID-123", original_title: "Synthetic restricted", access: "restricted", data_class: "G2" },
      });
      const vault = new Vault(root);
      await vault.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first");
      const store = new MemoryStore();
      await new Indexer(vault, new OllamaEmbedder(ollama.url), store).run();

      const a = await projection(vault, store);
      const emb = await noteEmbeddings(vault, store);
      const opts = { summary: (n: { fm: { id: string } }) => vault.summary(n.fm.id), generatedAt: a.generated_at };
      const b = buildProjection(vault.all(), emb, opts);
      expect(b).toEqual(a);
      expect(Object.keys(a).sort()).toEqual(["clusters", "edges", "embed_model", "generated_at", "index_version", "nodes", "version"]);
      expect(a.nodes).toHaveLength(9);
      for (const n of a.nodes) {
        const { x, y, z } = n.position;
        expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(1.0001);
        expect(n.cluster).toMatch(/^c\d$/);
        expect(n.summary.length).toBeLessThanOrEqual(280);
      }
      expect(a.edges).toEqual([{ from: "kn-hook-variant", to: "kn-hook-first", type: "supports" }]);
      expect(a.clusters.reduce((s, c) => s + c.size, 0)).toBe(9);
      expect(a.clusters.length).toBe(2);
      expect(a.clusters.some((c) => c.label === "Title top-alpha" || c.label === "Title top-beta")).toBe(true);
      const restricted = a.nodes.find((n) => n.id === "src-restricted-doc")!;
      expect(restricted.source).toEqual({ kind: "drive_doc", access: "restricted", data_class: "G2", locator_display: "drive_doc: Synthetic restricted" });
      expect(JSON.stringify(a)).not.toContain("SECRET-DRIVE-ID-123");
      expect(a.nodes.find((n) => n.id === "kn-hook-first")!.source).toBeNull();
      // semantically close notes are closer than unrelated ones
      const pos = (id: string) => a.nodes.find((n) => n.id === id)!.position;
      const d = (p: { x: number; y: number; z: number }, q: typeof p) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      expect(d(pos("kn-grade-warm"), pos("kn-grade-cool"))).toBeLessThan(d(pos("kn-grade-warm"), pos("kn-hook-first")));
    } finally {
      ollama.close();
    }
  });

  it("handles tiny inputs", () => {
    expect(clusterCount(0)).toBe(0);
    expect(clusterCount(2)).toBe(1);
    expect(clusterCount(8)).toBe(2);
    expect(clusterCount(1000)).toBe(8);
    expect(pca([[1, 2, 3]])).toEqual([[0, 0, 0]]);
    expect(kmeans([[1], [2]], 1)).toEqual([0, 0]);
    expect(buildProjection([], new Map(), { summary: () => "" }).nodes).toEqual([]);
  });
});
