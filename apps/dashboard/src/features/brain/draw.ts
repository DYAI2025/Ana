/** Canvas drawing for the Brain projection. Visual only — positions come from the projection, never from type. */
import type { BrainCluster, BrainEdge, BrainNode, NodeType } from "./types";
import { project, type Camera, type HitTarget, type Viewport } from "./projection";

export type NodeShape = "double" | "circle" | "square" | "triangle" | "diamond" | "hexagon" | "pentagon" | "ring" | "star";

/** Shape encodes the note type (mirrored in the legend); colour is reserved for the cluster. */
export const TYPE_STYLE: Readonly<Record<NodeType, { shape: NodeShape }>> = {
  source: { shape: "pentagon" },
  concept: { shape: "circle" },
  method: { shape: "square" },
  tool: { shape: "hexagon" },
  preference: { shape: "double" },
  observation: { shape: "ring" },
  workshop: { shape: "triangle" },
  topic: { shape: "diamond" },
  question: { shape: "star" },
};

/** Deterministic pastel palette from the C4/Lumen tones; clusters take colours in projection order. */
// ordered for hue distance: the first six clusters get clearly different hues (salmon, lavender, butter, mint,
// sky, lime) before the softer pink/sand tones are reused
export const CLUSTER_PALETTE = ["#ffb7a8", "#bbb4d5", "#f1d7a6", "#a9d3c5", "#a8c3e6", "#c9e2a6", "#ddbbc2", "#e5d3be"] as const;
export const UNCLUSTERED_COLOR = "#b8b0aa";

export function clusterColors(clusters: readonly BrainCluster[]): Map<string, string> {
  return new Map(clusters.map((c, i) => [c.id, CLUSTER_PALETTE[i % CLUSTER_PALETTE.length]!]));
}

const POLYGON: Partial<Record<NodeShape, { sides: number; rotation: number; scale: number }>> = {
  square: { sides: 4, rotation: Math.PI / 4, scale: 1.25 },
  triangle: { sides: 3, rotation: -Math.PI / 2, scale: 1.45 },
  diamond: { sides: 4, rotation: 0, scale: 1.3 },
  hexagon: { sides: 6, rotation: 0, scale: 1.18 },
  pentagon: { sides: 5, rotation: -Math.PI / 2, scale: 1.2 },
};

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * 0.48;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    else ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
}

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, sides: number, rotation: number) {
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export interface DrawInput {
  nodes: readonly BrainNode[];
  edges: readonly BrainEdge[];
  colors: ReadonlyMap<string, string>;
  camera: Camera;
  viewport: Viewport;
  selected: string | null;
  hovered: string | null;
  related: ReadonlySet<string>;
  /** Nodes that stay bright while a filter, cluster focus or selection is active; null = no focus, all bright. */
  focus: ReadonlySet<string> | null;
  labelOf: (node: BrainNode) => string;
}

function hexToRgba(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function drawBrain(ctx: CanvasRenderingContext2D, input: DrawInput): HitTarget[] {
  const { nodes, edges, colors, camera, viewport, selected, hovered, related, focus, labelOf } = input;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // full canvas: the drawing viewport may be narrower

  const projected = new Map(nodes.map((node) => [node.id, project(node.position, camera, viewport)]));
  const depthAlpha = (depth: number) => 0.35 + ((depth + 1.2) / 2.4) * 0.65;

  // edges first, far to near
  for (const edge of edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b) continue;
    const isActive = selected !== null && (edge.from === selected || edge.to === selected);
    const inFocus = !focus || (focus.has(edge.from) && focus.has(edge.to));
    // noise reduction: relations outside the focus nearly disappear
    const weight = isActive ? 0.9 : !inFocus ? 0.04 : selected ? 0.18 : focus ? 0.55 : 0.32;
    const alpha = Math.max(0.03, Math.min(1, depthAlpha((a.depth + b.depth) / 2))) * weight;
    ctx.strokeStyle = isActive ? `rgba(255, 150, 130, ${alpha})` : `rgba(245, 237, 228, ${alpha})`;
    ctx.lineWidth = isActive ? 1.6 : 1;
    ctx.setLineDash(isActive ? [] : [3, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const order = [...nodes].sort((n1, n2) => projected.get(n1.id)!.depth - projected.get(n2.id)!.depth);
  const targets: HitTarget[] = [];
  const labels: LabelCandidate[] = [];

  for (const node of order) {
    const p = projected.get(node.id)!;
    const style = { shape: TYPE_STYLE[node.type].shape, color: colors.get(node.cluster) ?? UNCLUSTERED_COLOR };
    const isSelected = node.id === selected;
    const isRelated = related.has(node.id);
    const dimmed = focus !== null && !focus.has(node.id);
    const superseded = node.status === "SUPERSEDED";
    const alpha = Math.min(1, depthAlpha(p.depth)) * (dimmed ? 0.12 : 1) * (superseded ? 0.5 : 1);
    const radius = (node.type === "topic" ? 8.5 : 6.5) * p.scale * Math.sqrt(camera.zoom);

    // soft glow
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.4);
    glow.addColorStop(0, hexToRgba(style.color, 0.38 * alpha));
    glow.addColorStop(1, hexToRgba(style.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hexToRgba(style.color, 0.92 * alpha);
    ctx.strokeStyle = hexToRgba("#ffffff", 0.55 * alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const poly = POLYGON[style.shape];
    if (superseded) ctx.setLineDash([2, 2]);
    if (poly) {
      polygon(ctx, p.x, p.y, radius * poly.scale, poly.sides, poly.rotation);
      ctx.fill();
      ctx.stroke();
    } else if (style.shape === "star") {
      star(ctx, p.x, p.y, radius * 1.45);
      ctx.fill();
      ctx.stroke();
    } else if (style.shape === "ring") {
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(style.color, 0.25 * alpha);
      ctx.fill();
      ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = hexToRgba(style.color, 0.95 * alpha);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (style.shape === "double") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(style.color, 0.6 * alpha);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 128, 108, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const priority = isSelected ? 3 : node.id === hovered ? 2 : isRelated ? 1 : selected === null && !dimmed && p.depth > -0.2 ? 0 : -1;
    if (priority >= 0) labels.push({ node, x: p.x, y: p.y, radius, alpha, priority, depth: p.depth });

    targets.push({ id: node.id, x: p.x, y: p.y, radius: Math.max(radius + 3, 10), depth: p.depth });
  }
  drawLabels(ctx, labels, viewport, labelOf, hovered);
  return targets;
}

interface LabelCandidate {
  node: BrainNode;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  priority: number;
  depth: number;
}

/** Labels in priority order (selected, hovered, related, then nearest); a label that would collide is skipped, one that would leave the canvas flips left. */
function drawLabels(ctx: CanvasRenderingContext2D, labels: LabelCandidate[], viewport: Viewport, labelOf: (node: BrainNode) => string, hovered: string | null) {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const sorted = [...labels].sort((a, b) => b.priority - a.priority || b.depth - a.depth);
  for (const label of sorted) {
    const strong = label.priority >= 2;
    ctx.font = `${strong ? 600 : 500} ${strong ? 13 : 11.5}px "Inter Variable", Inter, system-ui, sans-serif`;
    const text = labelOf(label.node);
    const width = ctx.measureText(text).width + 12;
    const height = 20;
    let x = label.x + label.radius + 8;
    if (x + width > viewport.width - 8) x = label.x - label.radius - 8 - width;
    x = Math.max(8, x); // never past the canvas edge, even after flipping left
    const y = label.y - height / 2;
    const box = { x, y, w: width, h: height };
    const collides = placed.some((o) => box.x < o.x + o.w + 4 && box.x + box.w + 4 > o.x && box.y < o.y + o.h + 2 && box.y + box.h + 2 > o.y);
    if (collides && label.priority < 3) continue;
    placed.push(box);
    ctx.fillStyle = `rgba(40, 33, 38, ${0.78 * Math.max(label.alpha, 0.65)})`;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.fillStyle = `rgba(250, 245, 240, ${strong || label.node.id === hovered ? 1 : 0.88 * Math.max(label.alpha, 0.6)})`;
    ctx.fillText(text, box.x + 6, box.y + 14);
  }
}
