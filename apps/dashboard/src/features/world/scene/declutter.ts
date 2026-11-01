/**
 * Screen-space label placement: no two visible world labels may overlap. Each label sits above its anchor point
 * (box = [x - w/2, x + w/2] × [y - h, y]); higher priority labels are placed first, a colliding label is moved up or
 * down in whole label heights, and a label that finds no free slot is hidden for this frame. The shift a label had in
 * the previous frame is tried first, so labels do not jump between slots while the scene moves.
 */
export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
  prevShift: number;
}

export interface Placement {
  shift: number;
  visible: boolean;
}

interface Rect {
  l: number;
  r: number;
  t: number;
  b: number;
}

const GAP = 4;

function rectOf(b: LabelBox, shift: number): Rect {
  return { l: b.x - b.w / 2, r: b.x + b.w / 2, t: b.y + shift - b.h, b: b.y + shift };
}

function hits(a: Rect, b: Rect): boolean {
  return a.l < b.r + GAP && b.l < a.r + GAP && a.t < b.b + GAP && b.t < a.b + GAP;
}

export function declutter(boxes: readonly LabelBox[]): Placement[] {
  const out: Placement[] = boxes.map(() => ({ shift: 0, visible: false }));
  const order = boxes.map((_, i) => i).sort((a, b) => (boxes[b]?.priority ?? 0) - (boxes[a]?.priority ?? 0) || a - b);
  const placed: Rect[] = [];
  for (const i of order) {
    const box = boxes[i];
    if (!box) continue;
    const step = box.h + GAP;
    const candidates = [box.prevShift, 0, -step, step, -2 * step, 2 * step];
    for (const shift of candidates) {
      const r = rectOf(box, shift);
      if (placed.some((p) => hits(p, r))) continue;
      placed.push(r);
      out[i] = { shift, visible: true };
      break;
    }
  }
  return out;
}
