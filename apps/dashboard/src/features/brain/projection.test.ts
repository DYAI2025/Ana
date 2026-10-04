import { describe, expect, it } from "vitest";
import { clampCamera, DEFAULT_CAMERA, hitTest, project, rotate } from "./projection";

const viewport = { width: 800, height: 600 };

describe("rotate", () => {
  it("is the identity at yaw 0 / pitch 0", () => {
    expect(rotate({ x: 1, y: 2, z: 3 }, 0, 0)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("turns +x towards the viewer (+z) after a quarter yaw", () => {
    const r = rotate({ x: 1, y: 0, z: 0 }, Math.PI / 2, 0);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(1);
  });

  it("keeps distances (rigid rotation)", () => {
    const p = { x: 0.3, y: -0.7, z: 0.5 };
    const r = rotate(p, 1.1, -0.4);
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(Math.hypot(p.x, p.y, p.z));
  });
});

describe("project", () => {
  it("maps the origin to the viewport centre", () => {
    const p = project({ x: 0, y: 0, z: 0 }, DEFAULT_CAMERA, viewport);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
  });

  it("draws nearer points larger and up as up", () => {
    const near = project({ x: 0, y: 0, z: 0.8 }, { ...DEFAULT_CAMERA, pitch: 0 }, viewport);
    const far = project({ x: 0, y: 0, z: -0.8 }, { ...DEFAULT_CAMERA, pitch: 0 }, viewport);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.depth).toBeGreaterThan(far.depth);
    const up = project({ x: 0, y: 1, z: 0 }, { ...DEFAULT_CAMERA, pitch: 0 }, viewport);
    expect(up.y).toBeLessThan(300);
  });

  it("zooming in spreads points further from the centre", () => {
    const point = { x: 1, y: 0, z: 0 };
    const base = project(point, { yaw: 0, pitch: 0, zoom: 1 }, viewport);
    const zoomed = project(point, { yaw: 0, pitch: 0, zoom: 2 }, viewport);
    expect(Math.abs(zoomed.x - 400)).toBeGreaterThan(Math.abs(base.x - 400));
  });
});

describe("clampCamera", () => {
  it("bounds zoom and pitch", () => {
    const c = clampCamera({ yaw: 10, pitch: 5, zoom: 99 });
    expect(c.zoom).toBeLessThanOrEqual(2.4);
    expect(c.pitch).toBeLessThanOrEqual(1.2);
    expect(clampCamera({ yaw: 0, pitch: -5, zoom: 0 }).zoom).toBeGreaterThanOrEqual(0.6);
  });
});

describe("hitTest", () => {
  const points = [
    { id: "a", x: 100, y: 100, radius: 10, depth: 0 },
    { id: "b", x: 108, y: 100, radius: 10, depth: 0.5 },
    { id: "c", x: 300, y: 300, radius: 10, depth: 0 },
  ];

  it("prefers the nearer (front) node when two overlap", () => {
    expect(hitTest(points, 104, 100)).toBe("b");
  });

  it("returns null when nothing is under the pointer", () => {
    expect(hitTest(points, 200, 200)).toBeNull();
  });

  it("allows a small touch tolerance", () => {
    expect(hitTest(points, 300, 313)).toBe("c");
  });
});
