/** Search/focus over a Brain projection: which notes match, and which stay bright (noise reduction). Pure. */
import { normalize } from "@/lib/search";
import { neighbours, type BrainCluster, type BrainEdge, type BrainNode } from "./types";

/** A filter matches title, type (id and translated name), topics and cluster label; every word must match. */
export function matchesFilter(node: BrainNode, query: string, typeName: string, clusterLabel: string): boolean {
  const q = normalize(query);
  if (q === "") return true;
  const haystack = normalize([node.title, node.type, typeName, clusterLabel, ...node.topics.map((t) => t.replace(/-/g, " "))].join(" "));
  return q.split(" ").every((token) => haystack.includes(token));
}

export interface FocusInput {
  nodes: readonly BrainNode[];
  edges: readonly BrainEdge[];
  clusters: readonly BrainCluster[];
  filter: string;
  cluster: string | null;
  selected: string | null;
  typeName: (node: BrainNode) => string;
}

/**
 * The bright set. A selection shows the note and its explicit neighbours. Otherwise a filter keeps its matches and
 * their explicit neighbours, a cluster focus keeps the cluster's notes; both together intersect. Null = nothing active.
 */
export function focusSet({ nodes, edges, clusters, filter, cluster, selected, typeName }: FocusInput): Set<string> | null {
  if (selected) return new Set([selected, ...neighbours(edges, selected)]);
  const labels = new Map(clusters.map((c) => [c.id, c.label]));
  let bright: Set<string> | null = null;
  if (normalize(filter) !== "") {
    const matches = nodes.filter((n) => matchesFilter(n, filter, typeName(n), labels.get(n.cluster) ?? ""));
    bright = new Set(matches.flatMap((n) => [n.id, ...neighbours(edges, n.id)]));
  }
  if (cluster) {
    const members = new Set(nodes.filter((n) => n.cluster === cluster).map((n) => n.id));
    bright = bright ? new Set([...bright].filter((id) => members.has(id))) : members;
  }
  return bright;
}
