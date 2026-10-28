import { appendFileSync, readFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunk, pointId, uuidv5 } from "../src/index/chunker.js";
import { Indexer, search } from "../src/index/indexer.js";
import { DimensionError, OllamaEmbedder } from "../src/index/ollama.js";
import { CollectionMismatchError, QdrantStore } from "../src/index/qdrant.js";
import { Vault } from "../src/vault/vault.js";
import { fakeOllama, listen, MemoryStore, seed, syntheticVault } from "./helpers.js";

let ollama: Awaited<ReturnType<typeof fakeOllama>>;
beforeAll(async () => {
  ollama = await fakeOllama();
});
afterAll(() => ollama.close());

describe("chunker", () => {
  it("splits on headings and caps chunk size", () => {
    const c = chunk("T", "Intro\n\n## A\nalpha\n\n## B\n" + "word ".repeat(800));
    expect(c.length).toBeGreaterThanOrEqual(4);
    expect(c.every((x) => x.length <= 1500 + 3)).toBe(true);
  });
  it("produces stable UUIDv5 point ids", () => {
    expect(pointId("kn-a-note", 0)).toBe(pointId("kn-a-note", 0));
    expect(pointId("kn-a-note", 0)).not.toBe(pointId("kn-a-note", 1));
    expect(uuidv5("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("indexer", () => {
  it("is idempotent, re-embeds only changed notes, retires superseded notes", async () => {
    const root = syntheticVault();
    const vault = new Vault(root);
    const store = new MemoryStore();
    const embedder = new OllamaEmbedder(ollama.url);
    const idx = new Indexer(vault, embedder, store);

    const first = await idx.run();
    expect(first.embedded).toBe(8);
    const state = JSON.parse(readFileSync(path.join(root, ".ana", "index-state.json"), "utf8"));
    expect(state.embed_model).toBe("bge-m3:latest");
    expect(state.index_version).toBe(2);
    expect(state.embed_digest).toBe("a".repeat(64));
    const p = store.points.get(pointId("kn-hook-first", 0))!;
    expect(Object.keys(p.payload).sort()).toEqual(["chunk", "content_sha", "embed_model", "index_version", "note_id", "retired", "source_ids", "source_retired", "status", "topics", "type", "workshops"]);
    expect(p.payload.source_ids).toEqual(["src-synthetic-report"]);

    const before = store.counts.upserted;
    const second = await idx.run();
    expect(second.embedded).toBe(0);
    expect(second.skipped).toBe(8);
    expect(store.counts.upserted).toBe(before);

    // shrink one note: 2 chunks -> 1 chunk; only that note is re-embedded and its surplus point removed
    const file = path.join(root, "knowledge", "kn-hook-first.md");
    const text = readFileSync(file, "utf8").replace(/\n## Details[\s\S]*$/, "\nChanged.\n");
    (await import("node:fs")).writeFileSync(file, text);
    vault.reload();
    const third = await idx.run();
    expect(third.embedded).toBe(1);
    expect(third.upserted_points).toBe(1);
    expect(third.deleted_points).toBe(1);
    expect(store.points.has(pointId("kn-hook-first", 1))).toBe(false);

    const hits = await search(vault, embedder, store, "colour grading palettes warm evening");
    expect(hits[0]?.id).toBe("kn-grade-warm");

    await vault.addRelation("ana", "kn-grade-cool", "supersedes", "kn-grade-warm");
    const fourth = await idx.run();
    expect(fourth.payload_updates).toBeGreaterThanOrEqual(1);
    expect(store.points.get(pointId("kn-grade-warm", 0))!.payload.retired).toBe(true);
    const hits2 = await search(vault, embedder, store, "colour grading palettes warm evening");
    expect(hits2.map((h) => h.id)).not.toContain("kn-grade-warm");
    const hits3 = await search(vault, embedder, store, "colour grading palettes warm evening", { includeRetired: true });
    expect(hits3.map((h) => h.id)).toContain("kn-grade-warm");
    const filtered = await search(vault, embedder, store, "hook", { type: "concept", topic: "top-alpha" });
    expect(filtered.map((h) => h.id)).toEqual(["kn-hook-variant"]);
  });

  it("full rebuild drops and re-creates the collection", async () => {
    const vault = new Vault(syntheticVault());
    const store = new MemoryStore();
    const idx = new Indexer(vault, new OllamaEmbedder(ollama.url), store);
    await idx.run();
    const stats = await idx.run({ full: true });
    expect(stats.embedded).toBe(8);
    expect(store.counts.drops).toBe(2);
  });

  it("superseding a source retires only the notes that rest on it alone; the Markdown stays untouched (B-3)", async () => {
    const root = syntheticVault();
    seed(root, "src-synthetic-update", "source", "A newer synthetic report.\n");
    seed(root, "src-synthetic-other", "source", "An unrelated synthetic report.\n");
    seed(root, "kn-two-sources", "method", "Hook opening shot checklist from two reports.\n", {
      source_refs: [{ source: "src-synthetic-report", locator: "UNKNOWN" }, { source: "src-synthetic-other", locator: "UNKNOWN" }],
    });
    const vault = new Vault(root);
    const store = new MemoryStore();
    const embedder = new OllamaEmbedder(ollama.url);
    const idx = new Indexer(vault, embedder, store);
    await idx.run();
    const dependent = path.join(root, "knowledge", "kn-hook-first.md");
    const before = readFileSync(dependent, "utf8");

    await expect(vault.addRelation("ben", "kn-hook-variant", "supersedes", "src-synthetic-report")).rejects.toThrow(/source/);
    expect((await vault.addRelation("ben", "src-synthetic-update", "supersedes", "src-synthetic-report")).added).toBe(true);
    const old = vault.require("src-synthetic-report");
    expect(old.fm.status).toBe("SOURCE");
    expect(old.fm.superseded_by).toBe("src-synthetic-update");

    const stats = await idx.run();
    expect(stats.embedded).toBe(0); // payload only, nothing re-embedded
    const payload = (id: string) => store.points.get(pointId(id, 0))!.payload;
    expect(payload("src-synthetic-report").retired).toBe(true);
    expect(payload("kn-hook-first").source_retired).toBe(true);
    expect(payload("kn-two-sources").source_retired).toBe(false);
    expect(payload("kn-hook-variant").source_retired).toBe(false); // no sources at all: nothing to retire
    expect(readFileSync(dependent, "utf8")).toBe(before);

    const ids = async (opts = {}) => (await search(vault, embedder, store, "hook opening shot", { limit: 20, ...opts })).map((h) => h.id);
    expect(await ids()).not.toContain("kn-hook-first");
    expect(await ids()).toContain("kn-two-sources");
    expect(await ids({ includeRetired: true })).toContain("kn-hook-first");
  });

  it("a removed source retires its sole dependents and a removed note loses its points", async () => {
    const root = syntheticVault();
    const vault = new Vault(root);
    const store = new MemoryStore();
    const idx = new Indexer(vault, new OllamaEmbedder(ollama.url), store);
    await idx.run();
    unlinkSync(path.join(root, "sources", "src-synthetic-report.md"));
    unlinkSync(path.join(root, "knowledge", "kn-grade-warm.md"));
    vault.reload();
    const stats = await idx.run();
    expect(stats.removed_notes).toBe(2);
    expect(store.points.has(pointId("kn-grade-warm", 0))).toBe(false);
    expect(store.points.has(pointId("src-synthetic-report", 0))).toBe(false);
    expect(store.points.get(pointId("kn-hook-first", 0))!.payload.source_retired).toBe(true);
    const state = JSON.parse(readFileSync(path.join(root, ".ana", "index-state.json"), "utf8"));
    expect(Object.keys(state.notes)).not.toContain("kn-grade-warm");
  });

  it("refuses to run while notes fail to load, instead of deleting their points as if they were removed", async () => {
    const root = syntheticVault();
    const vault = new Vault(root);
    const store = new MemoryStore();
    const idx = new Indexer(vault, new OllamaEmbedder(ollama.url), store);
    await idx.run();
    const file = path.join(root, "knowledge", "kn-grade-warm.md");
    (await import("node:fs")).writeFileSync(file, readFileSync(file, "utf8").replace(/^status: .*$/m, "status: NOT-A-STATUS"));
    vault.reload();
    expect(vault.loadErrors).toHaveLength(1);
    await expect(idx.run()).rejects.toThrow(/1 note\(s\) failed to load: knowledge\/kn-grade-warm\.md/);
    expect(store.points.has(pointId("kn-grade-warm", 0))).toBe(true);
  });

  it("a lost collection or missing points force a full rebuild instead of an empty index (B-4)", async () => {
    const vault = new Vault(syntheticVault());
    const store = new MemoryStore();
    const idx = new Indexer(vault, new OllamaEmbedder(ollama.url), store);
    await idx.run();
    const total = store.points.size;
    await store.drop(); // Qdrant lost the collection, index-state.json survived
    const afterLoss = await idx.run();
    expect(afterLoss.full).toBe(true);
    expect(afterLoss.embedded).toBe(8);
    expect(store.points.size).toBe(total);
    store.points.delete(pointId("kn-grade-cool", 0)); // points fall short of the state
    const afterGap = await idx.run();
    expect(afterGap.full).toBe(true);
    expect(afterGap.embedded).toBe(8);
    expect(store.points.size).toBe(total);
    const steady = await idx.run();
    expect(steady.full).toBe(false);
    expect(steady.embedded).toBe(0);
  });

  it("records the model digest and rebuilds when the pulled model changes under the same tag (B-6)", async () => {
    const own = await fakeOllama();
    try {
      const root = syntheticVault();
      const vault = new Vault(root);
      const store = new MemoryStore();
      const idx = new Indexer(vault, new OllamaEmbedder(own.url), store);
      await idx.run();
      expect((await idx.run()).embedded).toBe(0);
      own.tags.digest = "b".repeat(64);
      const rebuilt = await idx.run();
      expect(rebuilt.full).toBe(true);
      expect(rebuilt.embedded).toBe(8);
      expect(JSON.parse(readFileSync(path.join(root, ".ana", "index-state.json"), "utf8")).embed_digest).toBe("b".repeat(64));
      own.tags.digest = null;
      await expect(idx.run()).rejects.toThrow(/not present in Ollama/);
    } finally {
      own.close();
    }
  });

  it("refuses a model that reports another dimension", async () => {
    const bad = await fakeOllama(768);
    try {
      await expect(new OllamaEmbedder(bad.url).embed(["x"])).rejects.toBeInstanceOf(DimensionError);
      const vault = new Vault(syntheticVault());
      const store = new MemoryStore();
      await expect(new Indexer(vault, new OllamaEmbedder(bad.url), store).run()).rejects.toThrow(/dimension/);
      expect(store.points.size).toBe(0);
    } finally {
      bad.close();
    }
  });

  it("Qdrant client refuses an existing collection with another size and creates a missing one", async () => {
    const calls: string[] = [];
    let size: number | undefined = 768;
    const server = createServer((req, res) => {
      calls.push(`${req.method} ${req.url}`);
      let b = "";
      req.on("data", (c: Buffer) => (b += c.toString()));
      req.on("end", () => {
        if (req.method === "GET") {
          if (size === undefined) return void res.writeHead(404).end("{}");
          return void res.writeHead(200).end(JSON.stringify({ result: { config: { params: { vectors: { size, distance: "Cosine" } } } } }));
        }
        if (req.method === "PUT") size = (JSON.parse(b) as { vectors: { size: number } }).vectors.size;
        res.writeHead(200).end(JSON.stringify({ result: true }));
      });
    });
    const url = await listen(server);
    try {
      await expect(new QdrantStore(url).ensureCollection(1024)).rejects.toBeInstanceOf(CollectionMismatchError);
      size = undefined;
      await new QdrantStore(url).ensureCollection(1024);
      expect(size).toBe(1024);
      expect(calls).toContain("PUT /collections/ana_brain_v1");
    } finally {
      server.close();
    }
  });

  it("Qdrant client counts points exactly and reports whether it created the collection", async () => {
    const seen: { url?: string; body?: string } = {};
    const server = createServer((req, res) => {
      let b = "";
      req.on("data", (c: Buffer) => (b += c.toString()));
      req.on("end", () => {
        if (req.method === "POST" && req.url === "/collections/ana_brain_v1/points/count") {
          Object.assign(seen, { url: req.url, body: b });
          return void res.writeHead(200).end(JSON.stringify({ result: { count: 7 } }));
        }
        if (req.method === "GET") return void res.writeHead(200).end(JSON.stringify({ result: { config: { params: { vectors: { size: 1024, distance: "Cosine" } } } } }));
        res.writeHead(404).end("{}");
      });
    });
    const url = await listen(server);
    try {
      expect(await new QdrantStore(url).count()).toBe(7);
      expect(JSON.parse(seen.body!)).toEqual({ exact: true });
      expect(await new QdrantStore(url).ensureCollection(1024)).toEqual({ created: false });
    } finally {
      server.close();
    }
  });

  it("does not touch the vault markdown when indexing", async () => {
    const root = syntheticVault();
    const vault = new Vault(root);
    const file = path.join(root, "knowledge", "kn-hook-first.md");
    const before = readFileSync(file, "utf8");
    await new Indexer(vault, new OllamaEmbedder(ollama.url), new MemoryStore()).run();
    expect(readFileSync(file, "utf8")).toBe(before);
    appendFileSync(path.join(root, ".ana", "x"), "");
  });
});
