import { describe, expect, it } from "vitest";
import { declutter, type LabelBox } from "./declutter";

const box = (x: number, y: number, priority = 1, prevShift = 0): LabelBox => ({ x, y, w: 100, h: 30, priority, prevShift });

function rects(boxes: LabelBox[]) {
  return declutter(boxes)
    .map((p, i) => ({ p, b: boxes[i] as LabelBox }))
    .filter(({ p }) => p.visible)
    .map(({ p, b }) => ({ l: b.x - b.w / 2, r: b.x + b.w / 2, t: b.y + p.shift - b.h, bt: b.y + p.shift }));
}

describe("declutter", () => {
  it("keeps labels that do not touch where they are", () => {
    expect(declutter([box(0, 100), box(300, 100)])).toEqual([
      { shift: 0, visible: true },
      { shift: 0, visible: true },
    ]);
  });

  it("never leaves two visible labels overlapping, even in a pile of ten at one point", () => {
    const pile = Array.from({ length: 10 }, (_, i) => box(200 + i * 3, 300, i % 3));
    const rs = rects(pile);
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        if (!a || !b) continue;
        expect(a.l < b.r && b.l < a.r && a.t < b.bt && b.t < a.bt, `labels ${i} and ${j} overlap`).toBe(false);
      }
    expect(rs.length).toBeLessThan(10);
    expect(rs.length).toBeGreaterThan(1);
  });

  it("gives the free spot to the higher priority label and moves the other one", () => {
    const [low, high] = declutter([box(0, 100, 1), box(10, 100, 5)]);
    expect(high).toEqual({ shift: 0, visible: true });
    expect(low?.visible).toBe(true);
    expect(low?.shift).not.toBe(0);
  });

  it("keeps the previous shift when it is still free, so labels do not jump", () => {
    const [a, b] = declutter([box(0, 100, 5), box(10, 100, 1, 34)]);
    expect(a?.shift).toBe(0);
    expect(b?.shift).toBe(34);
  });
});
