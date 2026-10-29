import { describe, expect, it } from "vitest";
import { CLUSTER_PALETTE, UNCLUSTERED_COLOR, clusterColors } from "./draw";

// the light ASADA canvas (globals.css --canvas / --canvas-deep) and the selection ring (--accent)
const CANVAS = "#eceff3";
const CANVAS_DEEP = "#dfe3e9";
const SELECTION = "#a8321c";

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueDistance = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return Math.min(d, 360 - d);
};

describe("cluster palette", () => {
  it("has eight distinct tones", () => {
    expect(CLUSTER_PALETTE).toHaveLength(8);
    expect(new Set(CLUSTER_PALETTE).size).toBe(8);
  });

  it("every node colour reaches 3:1 against the light canvas (WCAG 1.4.11)", () => {
    for (const color of [...CLUSTER_PALETTE, UNCLUSTERED_COLOR]) {
      expect(contrast(color, CANVAS), `${color} on ${CANVAS}`).toBeGreaterThanOrEqual(3);
      expect(contrast(color, CANVAS_DEEP), `${color} on ${CANVAS_DEEP}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("tones are told apart by hue, and none reads as the selection accent", () => {
    for (const [i, a] of CLUSTER_PALETTE.entries()) {
      expect(hueDistance(a, SELECTION), `${a} vs selection`).toBeGreaterThanOrEqual(30);
      for (const b of CLUSTER_PALETTE.slice(i + 1)) expect(hueDistance(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(30);
    }
  });

  it("assigns colours in projection order and wraps after eight clusters", () => {
    const clusters = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `C${i}` }));
    const colors = clusterColors(clusters as never);
    expect(colors.get("c0")).toBe(CLUSTER_PALETTE[0]);
    expect(colors.get("c7")).toBe(CLUSTER_PALETTE[7]);
    expect(colors.get("c8")).toBe(CLUSTER_PALETTE[0]);
  });
});
