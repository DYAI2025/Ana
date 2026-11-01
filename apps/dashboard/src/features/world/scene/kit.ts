/**
 * Shared material kit for the world stage: one toon ramp, one ink colour, one palette. Every mesh of the scene is built
 * from these so the comic look stays consistent (ASADA canvas around it, ink = dashboard text colour).
 */
import * as THREE from "three";

export const PALETTE = {
  ink: 0x1f242b,
  sea: 0x9ccfe3,
  seaDeep: 0x7db9d3,
  land: [0x9fcf8d, 0x8fc47e, 0xadd69b],
  tropic: [0x7fc271, 0x6fb763],
  tundra: [0xcfd9c4, 0xc2cfb6],
  ice: 0xf1f5f9,
  pearl: 0xfbfcfd,
  silver: 0xc9ced6,
  chrome: 0x8e97a3,
  coral: 0xc8584a,
  sand: 0xead8b0,
  wood: 0xa8754a,
  woodDark: 0x6e4a2c,
  leaf: 0x58b06a,
  leafDark: 0x3f9356,
  heart: 0xe2557a,
  comment: 0x5b8def,
  glow: 0xffd66b,
  idle: 0x9aa4b2,
  ok: 0x3aa76d,
  busy: 0xe0a92e,
  recent: 0x5b7fd6,
} as const;

let ramp: THREE.DataTexture | null = null;

/** Three hard light bands: the comic look. */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const d = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: number, opts: { map?: THREE.Texture; transparent?: boolean; opacity?: number; emissive?: number; side?: THREE.Side; unique?: boolean } = {}): THREE.MeshToonMaterial {
  const key = opts.map || opts.transparent || opts.emissive || opts.side || opts.unique ? null : `c${color}`;
  if (key) {
    const hit = toonCache.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), map: opts.map ?? null, transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide });
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = 0.55;
  }
  if (key) toonCache.set(key, m);
  return m;
}

export const INK = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });

/** Inverted-hull outline: a slightly larger back-face copy in ink. */
export function inked<T extends THREE.Mesh>(mesh: T, scale = 1.07): T {
  const o = new THREE.Mesh(mesh.geometry, INK);
  o.scale.setScalar(scale);
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

export function mesh(geo: THREE.BufferGeometry, color: number, ink = 0, opts?: Parameters<typeof toon>[1]): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color, opts));
  if (ink) inked(m, ink);
  return m;
}

export function basic(geo: THREE.BufferGeometry, color: number, opts: { transparent?: boolean; opacity?: number } = {}): THREE.Mesh {
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1 }));
}

export function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export const R = 10;

/** lat/lon in degrees → point on a sphere of radius r (three-globe convention). */
export function ll(lat: number, lon: number, r = R, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lon + 180) * Math.PI) / 180;
  return out.set(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

/** A group standing on the globe: local +Y = up, +Z = south (towards the close-up camera), +X = east. */
export function siteFrame(lat: number, lon: number, lift: number): THREE.Group {
  const g = new THREE.Group();
  const n = ll(lat, lon, 1).normalize();
  const north = new THREE.Vector3(0, 1, 0).sub(n.clone().multiplyScalar(n.y)).normalize();
  const south = north.clone().negate();
  const east = new THREE.Vector3().crossVectors(n, south);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, n, south));
  g.position.copy(n.multiplyScalar(R + lift));
  return g;
}

/** Deterministic pseudo-random in [0,1) for decoration (never for data). */
export function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Frees geometries and the materials (with their textures) that are not shared from the toon cache (safe for rebuilt sub-trees). */
export function disposeGeometry(root: THREE.Object3D): void {
  const cached = new Set<THREE.Material>(toonCache.values());
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (cached.has(mat) || mat === INK || seen.has(mat)) continue;
      seen.add(mat);
      const map = (mat as THREE.MeshToonMaterial).map;
      if (map && !seen.has(map)) {
        seen.add(map);
        map.dispose();
      }
      mat.dispose();
    }
  });
}

export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const map = (mat as THREE.MeshToonMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
  });
  toonCache.clear();
}
