/** Canvas drawing for the Brain fixture. Visual only — no layout physics, no data semantics. */
import type { BrainEdge, BrainNode, NodeType } from "@/fixtures/brain";
import { project, type Camera, type HitTarget, type Viewport } from "./projection";

/** Pastel per type; shape also differs per type so meaning is not colour-only. */
export type NodeShape = "double" | "circle" | "square" | "triangle" | "diamond" | "hexagon" | "pentagon" | "ring";

/** Every type has its own shape (mirrored in the legend), so colour is never the only cue. */
export const TYPE_STYLE: Readonly<Record<NodeType, { color: string; shape: NodeShape }>> = {
  goal: { color: "#ffb7a8", shape: "double" },
  resource: { color: "#e5d3be", shape: "circle" },
  session: { color: "#bbb4d5", shape: "square" },
  workshop: { color: "#ddbbc2", shape: "triangle" },
  decision: { color: "#f5ede4", shape: "diamond" },
  tool: { color: "#c9a3ad", shape: "hexagon" },
  source: { color: "#d6c6ea", shape: "pentagon" },
  hypothesis: { color: "#f1d7a6", shape: "ring" },
};

const POLYGON: Partial<Record<NodeShape, { sides: number; rotation: number; scale: number }>> = {
  square: { sides: 4, rotation: Math.PI / 4, scale: 1.25 },
  triangle: { sides: 3, rotation: -Math.PI / 2, scale: 1.45 },
  diamond: { sides: 4, rotation: 0, scale: 1.3 },
  hexagon: { sides: 6, rotation: 0, scale: 1.18 },
  pentagon: { sides: 5, rotation: -Math.PI / 2, scale: 1.2 },
};

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
  camera: Camera;
  viewport: Viewport;
  selected: string | null;
  hovered: string | null;
  related: ReadonlySet<string>;
  labelOf: (node: BrainNode) => string;
}

function hexToRgba(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function drawBrain(ctx: CanvasRenderingContext2D, input: DrawInput): HitTarget[] {
  const { nodes, edges, camera, viewport, selected, hovered, related, labelOf } = input;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // full canvas: the drawing viewport may be narrower

  const projected = new Map(nodes.map((node) => [node.id, project(node.position, camera, viewport)]));
  const depthAlpha = (depth: number) => 0.35 + ((depth + 1.2) / 2.4) * 0.65;

  // edges first, far to near
  for (const edge of edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b) continue;
    const isActive = selected !== null && (edge.from === selected || edge.to === selected);
    const alpha = Math.max(0.05, Math.min(1, depthAlpha((a.depth + b.depth) / 2))) * (isActive ? 0.9 : selected ? 0.18 : 0.32);
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
    const style = TYPE_STYLE[node.type];
    const isSelected = node.id === selected;
    const isRelated = related.has(node.id);
    const dimmed = selected !== null && !isSelected && !isRelated;
    const alpha = Math.min(1, depthAlpha(p.depth)) * (dimmed ? 0.45 : 1);
    const radius = (node.type === "goal" ? 9 : 6.5) * p.scale * Math.sqrt(camera.zoom);

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
    if (poly) {
      polygon(ctx, p.x, p.y, radius * poly.scale, poly.sides, poly.rotation);
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

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 128, 108, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const priority = isSelected ? 3 : node.id === hovered ? 2 : isRelated ? 1 : selected === null && p.depth > -0.2 ? 0 : -1;
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
