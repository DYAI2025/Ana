/**
 * Tiny perspective projection for the Brain visual fixture. Pure math, no rendering —
 * deliberately not a graph engine (the production 3D library is still spike-gated).
 */
import type { Vec3 } from "@/fixtures/brain";

export interface Camera {
  yaw: number;
  pitch: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Projected {
  x: number;
  y: number;
  /** rotated z: larger = nearer the viewer */
  depth: number;
  scale: number;
}

export interface HitTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  depth: number;
}

export const DEFAULT_CAMERA: Camera = { yaw: 0.6, pitch: -0.28, zoom: 1 };
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.4;
const PITCH_LIMIT = 1.2;
const CAMERA_DISTANCE = 3.2;
const TOUCH_TOLERANCE = 4;

export function rotate(p: Vec3, yaw: number, pitch: number): Vec3 {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = p.x * cosY - p.z * sinY;
  const z1 = p.x * sinY + p.z * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y2 = p.y * cosP - z1 * sinP;
  const z2 = p.y * sinP + z1 * cosP;
  return { x: x1 + 0, y: y2 + 0, z: z2 + 0 };
}

export function project(p: Vec3, camera: Camera, viewport: Viewport): Projected {
  const r = rotate(p, camera.yaw, camera.pitch);
  const scale = CAMERA_DISTANCE / (CAMERA_DISTANCE - r.z);
  const base = Math.min(viewport.width, viewport.height) * 0.36 * camera.zoom;
  return {
    x: viewport.width / 2 + r.x * base * scale,
    y: viewport.height / 2 - r.y * base * scale,
    depth: r.z,
    scale,
  };
}

export function clampCamera(camera: Camera): Camera {
  return {
    yaw: camera.yaw,
    pitch: Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, camera.pitch)),
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom)),
  };
}

/** Front-most node whose (tolerance-padded) disc contains the point, else null. */
export function hitTest(targets: readonly HitTarget[], px: number, py: number): string | null {
  let best: HitTarget | null = null;
  for (const target of targets) {
    if (Math.hypot(target.x - px, target.y - py) > target.radius + TOUCH_TOLERANCE) continue;
    if (!best || target.depth > best.depth) best = target;
  }
  return best?.id ?? null;
}
