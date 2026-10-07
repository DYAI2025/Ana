/**
 * Synthetic Brain projection for Playwright (docs/brain/CONTRACT.md §5). Every title, id and source here is invented
 * test data — no real Brain content, no real locators.
 */

const C = {
  c0: { x: 0.45, y: 0.1, z: 0.25 },
  c1: { x: -0.45, y: 0.2, z: 0.2 },
  c2: { x: 0.05, y: -0.45, z: -0.35 },
  c3: { x: -0.1, y: 0.5, z: -0.4 },
};

const at = (cluster, dx, dy, dz) => ({ x: +(C[cluster].x + dx).toFixed(3), y: +(C[cluster].y + dy).toFixed(3), z: +(C[cluster].z + dz).toFixed(3) });
const T = "2026-10-07T12:00:00Z";

function n(id, title, type, status, cluster, offset, extra = {}) {
  return {
    id,
    title,
    type,
    status,
    cluster,
    position: at(cluster, ...offset),
    topics: [],
    workshops: [],
    summary: `Synthetic test note: ${title}.`,
    updated: T,
    created_by: "agent:e2e",
    source_refs: [],
    source: null,
    ...extra,
  };
}

const src = (kind, access, data_class, locator_display) => ({ kind, access, data_class, locator_display });

export function baseProjection() {
  const nodes = [
    n("top-cut-brief", "Cut brief", "topic", "DERIVED", "c0", [0, 0, 0]),
    n("kn-hook-first-cut-brief", "Hook-first cut brief", "method", "DERIVED", "c0", [0.12, 0.08, 0.05], {
      topics: ["top-cut-brief"],
      workshops: ["ws-workshop-02"],
      created_by: "ben",
      source_refs: [{ source: "src-synthetic-research", locator: "§3 Hook" }],
    }),
    n("kn-cut-brief-structure", "Cut brief structure", "concept", "CONFIRMED", "c0", [-0.1, 0.12, -0.04], { topics: ["top-cut-brief"], created_by: "ana" }),
    n("kn-old-cut-template", "Old cut template", "method", "SUPERSEDED", "c0", [0.05, -0.12, 0.1], { topics: ["top-cut-brief"] }),
    n("kn-short-intro-preference", "Prefers short intros", "preference", "CONFIRMED", "c0", [0.15, -0.05, -0.12], { created_by: "ana", topics: ["top-cut-brief"] }),
    n("kn-long-intro-observation", "Long intro kept attention once", "observation", "CANDIDATE", "c0", [-0.14, -0.08, 0.1], {
      source_refs: [{ source: "src-synthetic-notes", locator: "UNKNOWN" }],
    }),
    n("top-workshop-practice", "Workshop practice", "topic", "DERIVED", "c1", [0, 0, 0]),
    n("ws-workshop-01", "Workshop 01", "workshop", "DERIVED", "c1", [0.12, 0.1, 0.05], { topics: ["top-workshop-practice"] }),
    n("ws-workshop-02", "Workshop 02", "workshop", "DERIVED", "c1", [-0.12, 0.1, -0.05], {
      topics: ["top-workshop-practice"],
      created_by: "vince",
      source_refs: [{ source: "src-synthetic-agenda", locator: "Agenda item 2" }],
    }),
    n("kn-warmup-method", "Two-minute warm-up", "method", "DERIVED", "c1", [0.08, -0.12, 0.12], { topics: ["top-workshop-practice"] }),
    n("kn-timebox-concept", "Timeboxed exercises", "concept", "CANDIDATE", "c1", [-0.06, -0.1, -0.14], { topics: ["top-workshop-practice"] }),
    n("tl-synthetic-editor", "Synthetic video editor", "tool", "DERIVED", "c2", [0.1, 0.05, 0.05]),
    n("tl-synthetic-board", "Synthetic whiteboard", "tool", "DERIVED", "c2", [-0.12, 0.06, -0.02]),
    n("src-synthetic-research", "Synthetic research report", "source", "SOURCE", "c2", [0.02, -0.12, 0.1], {
      source: src("drive_doc", "restricted", "G2", "drive_doc · Synthetic research report"),
    }),
    n("src-synthetic-notes", "Synthetic workshop notes", "source", "SOURCE", "c2", [-0.1, -0.1, -0.1], {
      source: src("local_file", "internal", "G1", "notes/synthetic-workshop.md"),
    }),
    n("src-synthetic-agenda", "Synthetic agenda page", "source", "SOURCE", "c2", [0.14, -0.04, -0.14], {
      source: src("confluence_page", "public", "G0", "https://example.invalid/agenda"),
    }),
    n("top-open-questions", "Open questions", "topic", "CANDIDATE", "c3", [0, 0, 0]),
    n("qu-best-hook-length", "What hook length works best?", "question", "CANDIDATE", "c3", [0.12, 0.06, 0.05], { topics: ["top-open-questions", "top-cut-brief"] }),
    n("qu-remote-workshops", "Do remote workshops need breaks?", "question", "CANDIDATE", "c3", [-0.12, 0.05, 0.08], { topics: ["top-open-questions"] }),
    n("kn-break-observation", "Energy dropped after 40 minutes", "observation", "DERIVED", "c3", [0.02, -0.12, -0.1], {
      source_refs: [{ source: "src-synthetic-notes", locator: "Session 2" }],
    }),
  ];
  const edges = [
    { from: "kn-hook-first-cut-brief", to: "kn-cut-brief-structure", type: "supports" },
    { from: "kn-long-intro-observation", to: "kn-short-intro-preference", type: "contradicts" },
    { from: "kn-cut-brief-structure", to: "kn-old-cut-template", type: "supersedes" },
    { from: "kn-hook-first-cut-brief", to: "src-synthetic-research", type: "derived_from" },
    { from: "kn-hook-first-cut-brief", to: "top-cut-brief", type: "part_of" },
    { from: "ws-workshop-02", to: "kn-hook-first-cut-brief", type: "relates_to" },
    { from: "ws-workshop-01", to: "kn-warmup-method", type: "relates_to" },
    { from: "kn-warmup-method", to: "top-workshop-practice", type: "part_of" },
    { from: "kn-timebox-concept", to: "kn-warmup-method", type: "supports" },
    { from: "kn-break-observation", to: "qu-remote-workshops", type: "answers" },
    { from: "kn-break-observation", to: "src-synthetic-notes", type: "derived_from" },
    { from: "qu-best-hook-length", to: "top-open-questions", type: "part_of" },
    { from: "tl-synthetic-editor", to: "kn-hook-first-cut-brief", type: "relates_to" },
    { from: "tl-synthetic-board", to: "ws-workshop-01", type: "relates_to" },
    { from: "ws-workshop-02", to: "src-synthetic-agenda", type: "derived_from" },
    { from: "kn-timebox-concept", to: "kn-break-observation", type: "updates" },
  ];
  const clusters = [
    { id: "c0", label: "Cut brief", size: 6 },
    { id: "c1", label: "Workshop practice", size: 5 },
    { id: "c2", label: "Tools and sources", size: 5 },
    { id: "c3", label: "Open questions", size: 4 },
  ];
  return { version: 1, generated_at: T, embed_model: "bge-m3:latest", index_version: 1, clusters, nodes, edges };
}

/** Same notes, positions mirrored on x and z: a different semantic layout from the same graph. */
export function mirrored(projection) {
  return { ...projection, nodes: projection.nodes.map((node) => ({ ...node, position: { x: -node.position.x, y: node.position.y, z: -node.position.z } })) };
}
