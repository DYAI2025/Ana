/**
 * The Brain projection contract (docs/brain/CONTRACT.md §5) and its runtime validation.
 * Pure module: used by the dashboard server (validating the Brain service answer) and by the browser.
 */

export const NODE_TYPES = ["source", "concept", "method", "tool", "preference", "observation", "workshop", "topic", "question"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_STATUSES = ["SOURCE", "CONFIRMED", "DERIVED", "CANDIDATE", "SUPERSEDED"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const RELATION_TYPES = ["supports", "contradicts", "updates", "relates_to", "derived_from", "part_of", "answers", "supersedes"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SourceRef {
  source: string;
  locator: string;
}

export interface SourceDetails {
  kind: string;
  access: string;
  data_class: string;
  locator_display: string;
}

export interface BrainCluster {
  id: string;
  label: string;
  size: number;
}

export interface BrainNode {
  id: string;
  title: string;
  type: NodeType;
  status: NodeStatus;
  cluster: string;
  position: Vec3;
  topics: string[];
  workshops: string[];
  summary: string;
  updated: string;
  created_by: string;
  source_refs: SourceRef[];
  source: SourceDetails | null;
}

export interface BrainEdge {
  from: string;
  to: string;
  type: RelationType;
}

export interface BrainProjection {
  version: 1;
  generated_at: string;
  embed_model: string;
  index_version: number;
  clusters: BrainCluster[];
  nodes: BrainNode[];
  edges: BrainEdge[];
}

export type BrainFailureKind = "not-configured" | "unreachable" | "unauthorized" | "invalid-response";

export interface BrainFailure {
  kind: BrainFailureKind;
  detail: string;
}

export type BrainResult = { ok: true; projection: BrainProjection } | { ok: false; failure: BrainFailure };

/** How a failure is shown: nothing can be read (BLOCKED) or the Brain answered something we cannot trust (UNKNOWN). */
export const BRAIN_FAILURE_STATE: Readonly<Record<BrainFailureKind, "BLOCKED" | "UNKNOWN">> = {
  "not-configured": "BLOCKED",
  unauthorized: "BLOCKED",
  unreachable: "BLOCKED",
  "invalid-response": "UNKNOWN",
};

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

function node(raw: unknown, index: number): Check<BrainNode> {
  const at = `nodes[${index}]`;
  if (!isObject(raw)) return { ok: false, error: `${at} is not an object` };
  for (const key of ["id", "title", "cluster", "summary", "updated", "created_by"] as const) {
    if (!isString(raw[key])) return { ok: false, error: `${at}.${key} is not a string` };
  }
  if (!NODE_TYPES.includes(raw.type as NodeType)) return { ok: false, error: `${at}.type is not a contract type` };
  if (!NODE_STATUSES.includes(raw.status as NodeStatus)) return { ok: false, error: `${at}.status is not a contract status` };
  const p = raw.position;
  if (!isObject(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y) || !isFiniteNumber(p.z)) return { ok: false, error: `${at}.position is not a 3D point` };
  if (!isStringArray(raw.topics) || !isStringArray(raw.workshops)) return { ok: false, error: `${at}.topics/workshops are not string lists` };
  const refs = raw.source_refs;
  if (!Array.isArray(refs) || !refs.every((r) => isObject(r) && isString(r.source) && isString(r.locator))) {
    return { ok: false, error: `${at}.source_refs is malformed` };
  }
  let source: SourceDetails | null = null;
  if (raw.source !== null && raw.source !== undefined) {
    const s = raw.source;
    if (!isObject(s) || !isString(s.kind) || !isString(s.access) || !isString(s.data_class) || !isString(s.locator_display)) {
      return { ok: false, error: `${at}.source is malformed` };
    }
    source = { kind: s.kind, access: s.access, data_class: s.data_class, locator_display: s.locator_display };
  }
  return {
    ok: true,
    value: {
      id: raw.id as string,
      title: raw.title as string,
      type: raw.type as NodeType,
      status: raw.status as NodeStatus,
      cluster: raw.cluster as string,
      position: { x: p.x, y: p.y, z: p.z },
      topics: [...raw.topics],
      workshops: [...raw.workshops],
      summary: raw.summary as string,
      updated: raw.updated as string,
      created_by: raw.created_by as string,
      source_refs: refs.map((r) => ({ source: (r as SourceRef).source, locator: (r as SourceRef).locator })),
      source,
    },
  };
}

/** Validates an untrusted projection body; only known fields are copied, so nothing extra reaches the browser. */
export function parseProjection(raw: unknown): Check<BrainProjection> {
  if (!isObject(raw)) return { ok: false, error: "projection is not an object" };
  if (raw.version !== 1) return { ok: false, error: `unsupported projection version ${String(raw.version)}` };
  if (!isString(raw.generated_at) || !isString(raw.embed_model) || !isFiniteNumber(raw.index_version)) {
    return { ok: false, error: "generated_at, embed_model or index_version missing" };
  }
  if (!Array.isArray(raw.clusters) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return { ok: false, error: "clusters, nodes or edges missing" };
  const clusters: BrainCluster[] = [];
  for (const [i, c] of raw.clusters.entries()) {
    if (!isObject(c) || !isString(c.id) || !isString(c.label) || !isFiniteNumber(c.size)) return { ok: false, error: `clusters[${i}] is malformed` };
    clusters.push({ id: c.id, label: c.label, size: c.size });
  }
  const nodes: BrainNode[] = [];
  for (const [i, n] of raw.nodes.entries()) {
    const checked = node(n, i);
    if (!checked.ok) return checked;
    nodes.push(checked.value);
  }
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) return { ok: false, error: "duplicate node ids" };
  const edges: BrainEdge[] = [];
  for (const [i, e] of raw.edges.entries()) {
    if (!isObject(e) || !isString(e.from) || !isString(e.to) || !RELATION_TYPES.includes(e.type as RelationType)) return { ok: false, error: `edges[${i}] is malformed` };
    if (!ids.has(e.from) || !ids.has(e.to)) return { ok: false, error: `edges[${i}] points to an unknown node` };
    edges.push({ from: e.from, to: e.to, type: e.type as RelationType });
  }
  return { ok: true, value: { version: 1, generated_at: raw.generated_at, embed_model: raw.embed_model, index_version: raw.index_version, clusters, nodes, edges } };
}

/** Explicit neighbours of a node (both directions). */
export function neighbours(edges: readonly BrainEdge[], id: string): string[] {
  return edges.flatMap((edge) => (edge.from === id ? [edge.to] : edge.to === id ? [edge.from] : []));
}
