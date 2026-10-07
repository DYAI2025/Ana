import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Filter, Point, PointPayload, ScoredPoint, VectorStore } from "../src/index/qdrant.js";

export const tmpDir = (p = "brain-") => mkdtempSync(path.join(os.tmpdir(), p));

/** Deterministic bag-of-words vector from text hashes (similar text -> similar vector). */
export function fakeVector(text: string, dim = 1024): number[] {
  const v: number[] = new Array<number>(dim).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const h = createHash("sha256").update(w).digest();
    v[h.readUInt32BE(0) % dim]! += 1;
    v[h.readUInt32BE(4) % dim]! += 0.5;
  }
  if (!v.some((x) => x !== 0)) v[0] = 1;
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / n);
}

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** In-process fake Ollama /api/embed. */
export async function fakeOllama(dim = 1024): Promise<{ url: string; calls: { n: number }; close: () => void }> {
  const calls = { n: 0 };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      if (req.url !== "/api/embed") return void res.writeHead(404).end();
      calls.n++;
      const { model, input } = JSON.parse(body) as { model: string; input: string[] };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ model, embeddings: input.map((t) => fakeVector(t, dim)) }));
    });
  });
  const url = await listen(server);
  return { url, calls, close: () => server.close() };
}

export class MemoryStore implements VectorStore {
  points = new Map<string, Point>();
  size?: number;
  counts = { upserted: 0, deleted: 0, payload: 0, drops: 0 };
  async ensureCollection(size: number) {
    if (this.size !== undefined && this.size !== size) throw new Error("size mismatch");
    this.size = size;
  }
  async drop() {
    this.points.clear();
    this.size = undefined;
    this.counts.drops++;
  }
  async upsert(points: Point[]) {
    for (const p of points) this.points.set(p.id, structuredClone(p));
    this.counts.upserted += points.length;
  }
  async delete(ids: string[]) {
    for (const id of ids) this.points.delete(id);
    this.counts.deleted += ids.length;
  }
  async setPayload(ids: string[], payload: Partial<PointPayload>) {
    for (const id of ids) {
      const p = this.points.get(id);
      if (p) p.payload = { ...p.payload, ...payload };
    }
    this.counts.payload += ids.length;
  }
  async search(vector: number[], limit: number, filter?: Filter): Promise<ScoredPoint[]> {
    const match = (p: Point) =>
      (filter?.must ?? []).every((c) => {
        const v = (p.payload as unknown as Record<string, unknown>)[c.key];
        return Array.isArray(v) ? v.includes(c.match.value) : v === c.match.value;
      });
    return [...this.points.values()]
      .filter(match)
      .map((p) => ({ id: p.id, payload: p.payload, score: p.vector.reduce((s, x, i) => s + x * vector[i]!, 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  async retrieve(ids: string[]) {
    return ids.map((id) => this.points.get(id)).filter((p): p is Point => !!p);
  }
}

export const ISO = "2026-10-07T12:00:00Z";

export function noteText(fm: Record<string, unknown>, body: string): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

export function baseFm(id: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ana_brain: 1, id, title: `Title ${id}`, type, status: type === "source" ? "SOURCE" : "DERIVED",
    created: ISO, updated: ISO, created_by: "agent:test", topics: [], workshops: [], source_refs: [], relations: [],
    superseded_by: null, provenance: { method: "seed", actor: "agent:test", at: ISO },
    ...(type === "source" ? { source: { kind: "url", locator: "https://example.org/x", original_title: "Example", access: "public", data_class: "G0" } } : {}),
    ...extra,
  };
}

const FOLDER: Record<string, string> = { source: "sources", workshop: "workshops", topic: "topics", question: "questions" };

/** Write a synthetic note file directly (seed). */
export function seed(root: string, id: string, type: string, body: string, extra: Record<string, unknown> = {}): void {
  const dir = path.join(root, FOLDER[type] ?? "knowledge");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.md`), noteText(baseFm(id, type, extra), body));
}

/** A small synthetic vault (no real content). */
export function syntheticVault(): string {
  const root = tmpDir();
  seed(root, "top-alpha", "topic", "Alpha topic about hooks and opening shots.\n");
  seed(root, "top-beta", "topic", "Beta topic about colour grading palettes.\n");
  seed(root, "ws-01-intro", "workshop", "Synthetic workshop one.\n", { topics: ["top-alpha"] });
  seed(root, "src-synthetic-report", "source", "A synthetic public report used for tests.\n", { topics: ["top-alpha"] });
  seed(root, "kn-hook-first", "method", "Start with the hook opening shot.\n\n## Details\nHooks grab attention in the opening seconds.\n", {
    topics: ["top-alpha"], workshops: ["ws-01-intro"], source_refs: [{ source: "src-synthetic-report", locator: "UNKNOWN" }],
  });
  seed(root, "kn-hook-variant", "concept", "Hook opening shot variants grab attention.\n", { topics: ["top-alpha"] });
  seed(root, "kn-grade-warm", "method", "Warm colour grading palettes for evening scenes.\n", { topics: ["top-beta"] });
  seed(root, "kn-grade-cool", "concept", "Cool colour grading palettes for night scenes.\n", { topics: ["top-beta"] });
  return root;
}
