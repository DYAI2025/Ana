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
  // the raw locator is shown only for non-restricted sources with a known G0/G1 class
  const openClass = s.data_class === "G0" || s.data_class === "G1";
  if (s.access === "restricted" || !openClass || s.locator === "UNKNOWN") return `${s.kind}: ${s.original_title}`;
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

  // Label = the topic that is most characteristic of the cluster (share of that topic's notes that fall in the
  // cluster, weighted by count). Labels are unique: larger clusters choose first; a cluster without a free topic
  // gets "<topic> · <n>" so two colours never carry the same name.
  const globalCount = new Map<string, number>();
  const topicsOf = (m: (typeof embedded)[number]) => [...m.fm.topics, ...(m.fm.type === "topic" ? [m.fm.id] : [])].filter((t) => topicTitle.has(t));
  for (const m of embedded) for (const t of topicsOf(m)) globalCount.set(t, (globalCount.get(t) ?? 0) + 1);
  const raw = Array.from({ length: k }, (_, ci) => {
    const members = embedded.filter((_, i) => assign[i] === ci);
    const counts = new Map<string, number>();
    for (const m of members) for (const t of topicsOf(m)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const ranked = [...counts.entries()]
      .map(([t, c]) => [t, c * (c / (globalCount.get(t) ?? c))] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
    return { ci, size: members.length, ranked };
  });
  const used = new Map<string, number>();
  const labels = new Map<number, string>();
  for (const c of [...raw].sort((a, b) => b.size - a.size || a.ci - b.ci)) {
    const free = c.ranked.find((t) => !used.has(t));
    const pick = free ?? c.ranked[0];
    if (!pick) {
      labels.set(c.ci, `Cluster ${c.ci + 1}`);
      continue;
    }
    const n = (used.get(pick) ?? 0) + 1;
    used.set(pick, n);
    labels.set(c.ci, n === 1 ? topicTitle.get(pick)! : `${topicTitle.get(pick)!} · ${n}`);
  }
  const clusters = raw.map((c) => ({ id: `c${c.ci}`, label: labels.get(c.ci)!, size: c.size })).filter((c) => c.size > 0);

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
