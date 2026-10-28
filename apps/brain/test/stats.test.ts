import { describe, expect, it } from "vitest";
import { Indexer } from "../src/index/indexer.js";
import { OllamaEmbedder } from "../src/index/ollama.js";
import { projection } from "../src/projection/projection.js";
import { vaultStats } from "../src/stats.js";
import { Vault } from "../src/vault/vault.js";
import { fakeOllama, MemoryStore, syntheticVault } from "./helpers.js";

describe("stats", () => {
  it("gives the reference counts for the dashboard check: indexed notes = nodes, relations = edges", async () => {
    const ollama = await fakeOllama();
    try {
      const vault = new Vault(syntheticVault(), { git: false });
      await vault.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first");
      await vault.addRelation("ben", "kn-grade-cool", "contradicts", "kn-grade-warm");
      const store = new MemoryStore();
      await new Indexer(vault, new OllamaEmbedder(ollama.url), store).run();
      const p = await projection(vault, store);
      const s = vaultStats(vault);
      expect(s.indexed).toBe(s.notes);
      expect(s.indexed).toBe(p.nodes.length);
      expect(s.relations).toBe(2);
      expect(s.relations).toBe(p.edges.length);
      expect(Object.keys(s)).toEqual(["notes", "invalid", "relations", "byType", "byStatus", "indexed", "embed_model", "embed_digest", "index_version"]);
    } finally {
      ollama.close();
    }
  });
});
