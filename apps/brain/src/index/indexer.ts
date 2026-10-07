import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Note } from "../contract/note.js";
import type { Vault } from "../vault/vault.js";
import { chunk, pointId, sha256 } from "./chunker.js";
import { EMBED_DIM, type Embedder } from "./ollama.js";
import type { Filter, Point, PointPayload, VectorStore } from "./qdrant.js";

export const INDEX_VERSION = 1;

export interface NoteState { sha: string; meta: string; chunks: number; retired: boolean }
export interface IndexState { embed_model: string; index_version: number; notes: Record<string, NoteState> }
export interface IndexStats { notes: number; embedded: number; skipped: number; payload_updates: number; upserted_points: number; deleted_points: number; removed_notes: number }

export function statePath(root: string): string {
  return path.join(root, ".ana", "index-state.json");
}

export function loadState(root: string): IndexState | undefined {
  const p = statePath(root);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")) as IndexState;
}

function saveState(root: string, state: IndexState): void {
  const p = statePath(root);
  writeFileSync(`${p}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(`${p}.tmp`, p);
}

function meta(note: Note): Omit<PointPayload, "chunk" | "content_sha" | "embed_model" | "index_version"> {
  const fm = note.fm;
  return {
    note_id: fm.id,
    type: fm.type,
    status: fm.status,
    topics: fm.topics,
    workshops: fm.workshops,
    source_ids: [...new Set(fm.source_refs.map((r) => r.source))],
    retired: fm.status === "SUPERSEDED",
  };
}

export class Indexer {
  constructor(private readonly vault: Vault, private readonly embedder: Embedder, private readonly store: VectorStore) {}

  async run(opts: { full?: boolean } = {}): Promise<IndexStats> {
    const probe = await this.embedder.embed(["dimension probe"]);
    if (probe[0]?.length !== EMBED_DIM) throw new Error(`embedding dimension ${probe[0]?.length} != ${EMBED_DIM}`);
    let state = loadState(this.vault.root);
    const full = opts.full || !state || state.embed_model !== this.embedder.model || state.index_version !== INDEX_VERSION;
    if (full) await this.store.drop();
    await this.store.ensureCollection(EMBED_DIM);
    if (full || !state) state = { embed_model: this.embedder.model, index_version: INDEX_VERSION, notes: {} };
    const stats: IndexStats = { notes: 0, embedded: 0, skipped: 0, payload_updates: 0, upserted_points: 0, deleted_points: 0, removed_notes: 0 };
    const seen = new Set<string>();

    for (const note of this.vault.all()) {
      const id = note.fm.id;
      seen.add(id);
      stats.notes++;
      const chunks = chunk(note.fm.title, note.body);
      const sha = sha256(chunks.join("\u0000"));
      const m = meta(note);
      const metaSha = sha256(JSON.stringify(m));
      const prev = state.notes[id];
      if (prev && prev.sha === sha && prev.meta === metaSha) {
        stats.skipped++;
        continue;
      }
      if (prev && prev.sha === sha) {
        await this.store.setPayload(range(prev.chunks).map((i) => pointId(id, i)), m);
        stats.payload_updates++;
      } else {
        const vectors = await this.embedder.embed(chunks);
        const points: Point[] = chunks.map((_, i) => ({
          id: pointId(id, i),
          vector: vectors[i] as number[],
          payload: { ...m, chunk: i, content_sha: sha, embed_model: this.embedder.model, index_version: INDEX_VERSION },
        }));
        await this.store.upsert(points);
        stats.upserted_points += points.length;
        stats.embedded++;
        const surplus = range(prev?.chunks ?? 0).slice(chunks.length).map((i) => pointId(id, i));
        await this.store.delete(surplus);
        stats.deleted_points += surplus.length;
      }
      state.notes[id] = { sha, meta: metaSha, chunks: chunks.length, retired: m.retired };
      saveState(this.vault.root, state);
    }
    for (const [id, s] of Object.entries(state.notes)) {
      if (seen.has(id)) continue;
      await this.store.delete(range(s.chunks).map((i) => pointId(id, i)));
      stats.deleted_points += s.chunks;
      stats.removed_notes++;
      delete state.notes[id];
    }
    saveState(this.vault.root, state);
    return stats;
  }
}

export interface SearchOptions { limit?: number; includeRetired?: boolean; type?: string; status?: string; topic?: string; workshop?: string }
export interface SearchHit { id: string; title: string; type: string; status: string; score: number; summary: string; chunks: number[] }

export async function search(vault: Vault, embedder: Embedder, store: VectorStore, query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 50);
  const [vec] = await embedder.embed([query]);
  const must: Filter["must"] = [];
  if (!opts.includeRetired) must.push({ key: "retired", match: { value: false } });
  if (opts.type) must.push({ key: "type", match: { value: opts.type } });
  if (opts.status) must.push({ key: "status", match: { value: opts.status } });
  if (opts.topic) must.push({ key: "topics", match: { value: opts.topic } });
  if (opts.workshop) must.push({ key: "workshops", match: { value: opts.workshop } });
  const points = await store.search(vec as number[], limit * 4, must.length ? { must } : undefined);
  const byNote = new Map<string, SearchHit>();
  for (const p of points) {
    const id = p.payload.note_id;
    const hit = byNote.get(id);
    if (hit) {
      hit.chunks.push(p.payload.chunk);
      continue;
    }
    const note = vault.get(id);
    if (!note) continue;
    byNote.set(id, { id, title: note.fm.title, type: note.fm.type, status: note.fm.status, score: p.score, summary: vault.summary(id), chunks: [p.payload.chunk] });
  }
  return [...byNote.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
