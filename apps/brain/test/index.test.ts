import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunk, pointId, uuidv5 } from "../src/index/chunker.js";
import { Indexer, search } from "../src/index/indexer.js";
import { DimensionError, OllamaEmbedder } from "../src/index/ollama.js";
import { CollectionMismatchError, QdrantStore } from "../src/index/qdrant.js";
import { Vault } from "../src/vault/vault.js";
import { fakeOllama, listen, MemoryStore, syntheticVault } from "./helpers.js";

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
    expect(state.index_version).toBe(1);
    const p = store.points.get(pointId("kn-hook-first", 0))!;
    expect(Object.keys(p.payload).sort()).toEqual(["chunk", "content_sha", "embed_model", "index_version", "note_id", "retired", "source_ids", "status", "topics", "type", "workshops"]);
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
