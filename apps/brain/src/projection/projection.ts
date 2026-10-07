import type { Note } from "../contract/note.js";
import type { Frontmatter, SourceBlock } from "../contract/schema.js";
import { pointId } from "../index/chunker.js";
import { INDEX_VERSION, loadState } from "../index/indexer.js";
import { EMBED_MODEL } from "../index/ollama.js";
import type { VectorStore } from "../index/qdrant.js";
import type { Vault } from "../vault/vault.js";
import { clusterCount, kmeans, mean, pca, toUnitSphere, type Vec } from "./math.js";

export interface ProjectionNode {
  id: string;
  title: string;
  type: Frontmatter["type"];
  status: Frontmatter["status"];
  cluster: string | null;
  position: { x: number; y: number; z: number };
  topics: string[];
  workshops: string[];
  summary: string;
  updated: string;
  created_by: string;
  source_refs: { source: string; locator: string }[];
  source: { kind: string; access: string; data_class: string; locator_display: string } | null;
}
export interface Projection {
  version: 1;
  generated_at: string;
  embed_model: string;
  index_version: number;
  clusters: { id: string; label: string; size: number }[];
  nodes: ProjectionNode[];
  edges: { from: string; to: string; type: string }[];
}

export function locatorDisplay(s: SourceBlock): string {
  if (s.access === "restricted" || s.locator === "UNKNOWN") return `${s.kind}: ${s.original_title}`;
  return `${s.kind}: ${s.original_title} (${s.locator})`;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Note embeddings = mean of their chunk vectors, read from the vector store using the index state. */
export async function noteEmbeddings(vault: Vault, store: VectorStore): Promise<Map<string, Vec>> {
  const state = loadState(vault.root);
  const out = new Map<string, Vec>();
  if (!state) return out;
  const ids = Object.keys(state.notes).sort();
  for (const id of ids) {
    const n = state.notes[id]!.chunks;
    const pts = await store.retrieve(Array.from({ length: n }, (_, i) => pointId(id, i)));
    const vecs = pts.map((p) => p.vector).filter((v) => Array.isArray(v) && v.length > 0);
    if (vecs.length) out.set(id, mean(vecs));
  }
  return out;
}

export function buildProjection(notes: Note[], embeddings: Map<string, Vec>, opts: { summary: (n: Note) => string; generatedAt?: string; embedModel?: string }): Projection {
  const sorted = [...notes].sort((a, b) => a.fm.id.localeCompare(b.fm.id));
  const ids = new Set(sorted.map((n) => n.fm.id));
  const embedded = sorted.filter((n) => embeddings.has(n.fm.id));
  const rows = embedded.map((n) => {
    const v = embeddings.get(n.fm.id)!;
    const l = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / l);
  });
  const pos = toUnitSphere(pca(rows, 3));
  const assign = kmeans(rows, clusterCount(rows.length));
  const k = rows.length ? Math.max(...assign) + 1 : 0;
  const topicTitle = new Map(sorted.filter((n) => n.fm.type === "topic").map((n) => [n.fm.id, n.fm.title]));

  const clusters = Array.from({ length: k }, (_, ci) => {
    const members = embedded.filter((_, i) => assign[i] === ci);
    const counts = new Map<string, number>();
    for (const m of members) for (const t of m.fm.topics) if (topicTitle.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { id: `c${ci}`, label: best ? topicTitle.get(best[0])! : `Cluster ${ci + 1}`, size: members.length };
  }).filter((c) => c.size > 0);

  const posById = new Map(embedded.map((n, i) => [n.fm.id, { p: pos[i] ?? [0, 0, 0], c: `c${assign[i]}` }]));
  const nodes: ProjectionNode[] = sorted.map((n) => {
    const fm = n.fm;
    const e = posById.get(fm.id);
    return {
      id: fm.id,
      title: fm.title,
      type: fm.type,
      status: fm.status,
      cluster: e ? e.c : null,
      position: { x: r4(e?.p[0] ?? 0), y: r4(e?.p[1] ?? 0), z: r4(e?.p[2] ?? 0) },
      topics: fm.topics,
      workshops: fm.workshops,
      summary: opts.summary(n),
      updated: fm.updated,
      created_by: fm.created_by,
      source_refs: fm.source_refs,
      source: fm.type === "source" && fm.source
        ? { kind: fm.source.kind, access: fm.source.access, data_class: fm.source.data_class, locator_display: locatorDisplay(fm.source) }
        : null,
    };
  });
  const edges = sorted.flatMap((n) => n.fm.relations.filter((r) => ids.has(r.target)).map((r) => ({ from: n.fm.id, to: r.target, type: r.type })));
  return {
    version: 1,
    generated_at: opts.generatedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    embed_model: opts.embedModel ?? EMBED_MODEL,
    index_version: INDEX_VERSION,
    clusters,
    nodes,
    edges,
  };
}

export async function projection(vault: Vault, store: VectorStore): Promise<Projection> {
  const emb = await noteEmbeddings(vault, store);
  const state = loadState(vault.root);
  return buildProjection(vault.all(), emb, { summary: (n) => vault.summary(n.fm.id), embedModel: state?.embed_model });
}
