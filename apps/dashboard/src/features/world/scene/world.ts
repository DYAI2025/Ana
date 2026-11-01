/**
 * The world stage controller. Owns the renderer, camera, animation loop and HTML labels; React feeds it SceneData and
 * pulse events. Every data-driven object (post cards, audience arcs, station lamps, Ana's place) is rebuilt from
 * SceneData only; ambient motion is decoration.
 */
import * as THREE from "three";
import type { Geo } from "../geo";
import { ORBIT_MAX, type ChannelDef, type ChannelStatus, type PulseEvent, type ShareEntry, type WorldPost } from "../model";
import type { AnaLookId, OutfitColors } from "../looks";
import { BERLIN, PEOPLE, type AvatarSpec, type ProjectShape, type WorldPersonId } from "../people";
import type { WorldPlace } from "../types";
import { buildAvatar, type AvatarRig } from "./avatar";
import { declutter } from "./declutter";
import { basic, disposeGeometry, disposeTree, ll, mesh, PALETTE, R } from "./kit";
import { buildAnaSpot, buildClouds, buildGlobe, buildOffice, buildRock, buildScooter, buildStation, type AnaSpot, type Station } from "./stage";

export type StationStatus = "busy" | "recent" | "idle" | "done" | "no-source" | "no-jira";

export interface SceneProject {
  id: string;
  shape: ProjectShape;
  owner: WorldPersonId;
  status: StationStatus;
  label: string;
  sub: string;
}

export interface SceneCountry extends ShareEntry {
  label: string;
}

export interface SceneLabels {
  people: Record<WorldPersonId, { name: string; sub: string }>;
  berlin: string;
  anaPlace: string;
  vps: string;
  vpsSub: string;
  ring: string;
  ringSub: string;
  notConnected: string;
  /** Ana's label line per state, already including her place */
  anaStates: Record<AnaLookId | "sleeping", string>;
  /** prefix of an estimated clock ("≈") */
  clockApprox: string;
}

export interface SceneData {
  posts: WorldPost[];
  erMedian: number | null;
  channels: Array<{ def: ChannelDef; status: ChannelStatus }>;
  countries: SceneCountry[];
  anaPlace: WorldPlace | null;
  projects: SceneProject[];
  labels: SceneLabels;
  anaLook: { look: AnaLookId; colors: OutfitColors | null };
}

export type SceneRef =
  | { type: "person"; id: WorldPersonId }
  | { type: "project"; id: string }
  | { type: "post"; id: string }
  | { type: "country"; key: string }
  | { type: "place"; id: "berlin" | "ana" }
  | { type: "vps" }
  | { type: "ring" };

export type ViewName = "world" | "berlin" | "ana" | "orbit";

export interface WorldScene {
  setData(data: SceneData): void;
  burst(events: readonly PulseEvent[]): void;
  focus(view: ViewName): void;
  resize(): void;
  dispose(): void;
}

interface Label {
  el: HTMLElement;
  anchor: THREE.Object3D;
  dy: number;
  focus: "berlin" | "ana" | null;
  minDist: number;
  maxDist: number;
  dx: number;
  /** higher wins a contested spot; see declutter() */
  priority: number;
  subEl: HTMLElement | null;
  w: number;
  h: number;
  shift: number;
  hidden?: boolean;
}

const STATUS_COLOR: Record<StationStatus, number> = { busy: PALETTE.busy, recent: PALETTE.recent, idle: PALETTE.idle, done: PALETTE.ok, "no-source": 0xc4c9d2, "no-jira": 0xc4c9d2 };
const RING_R = R * 1.62;
const SAT_R = R * 1.36;

function estimatedLocalHour(lon: number, now = new Date()): number {
  const tz = Math.round(lon / 15);
  return (((now.getUTCHours() + tz) % 24) + 24) % 24;
}
function hourIn(timeZone: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}
function clockIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}
function estimatedClock(lon: number, now = new Date()): string {
  const d = new Date(now.getTime() + Math.round(lon / 15) * 3_600_000);
  return d.toISOString().slice(11, 16);
}
/** Ana's local hour: from the operator's time zone, else estimated from the longitude */
function anaHour(place: WorldPlace, now = new Date()): number {
  return place.tz ? hourIn(place.tz, now) : estimatedLocalHour(place.lon, now);
}

/** Ana's avatar for one look; colours from her newest post or the team's pick replace the dress colours. */
function anaSpec(look: AnaLookId, colors: OutfitColors | null): AvatarSpec {
  const base = PEOPLE.ana.avatar;
  if (look === "mermaid") return { ...base, outfit: { kind: "mermaid", primary: colors?.primary ?? 0x2fa39a, secondary: colors?.secondary ?? 0xf6c6d0 }, prop: "none" };
  const outfit = { kind: "sundress" as const, primary: colors?.primary ?? base.outfit.primary, secondary: colors?.secondary ?? base.outfit.secondary };
  if (look === "scooter") return { ...base, outfit, prop: "none", sunglassesOnHead: false, helmet: 0xf27d72 };
  return { ...base, outfit };
}
function berlinHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));
}
const isNight = (h: number) => h >= 23 || h < 7;

function heartGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.12);
  s.bezierCurveTo(-0.16, 0, -0.12, 0.13, 0, 0.06);
  s.bezierCurveTo(0.12, 0.13, 0.16, 0, 0, -0.12);
  return new THREE.ShapeGeometry(s, 10);
}

export function createWorldScene(
  canvas: HTMLCanvasElement,
  labelHost: HTMLElement,
  geo: Geo,
  options: { reducedMotion: boolean; onSelect: (ref: SceneRef) => void },
): WorldScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xfbfcfd, 0xd9cfbf, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(6, 8, 10);
  camera.add(key);
  const reduced = options.reducedMotion;

  const world = new THREE.Group();
  scene.add(world);
  world.add(buildGlobe(geo));
  const clouds = buildClouds([BERLIN]);
  world.add(clouds);

  const pickables: THREE.Object3D[] = [];
  const refOf = new WeakMap<THREE.Object3D, SceneRef>();
  const pick = (root: THREE.Object3D, ref: SceneRef) =>
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== undefined) {
        refOf.set(o, ref);
        pickables.push(o);
      }
    });
  const unpick = (root: THREE.Object3D) => {
    const set = new Set<THREE.Object3D>();
    root.traverse((o) => set.add(o));
    for (let i = pickables.length - 1; i >= 0; i--) if (set.has(pickables[i] as THREE.Object3D)) pickables.splice(i, 1);
  };

  // ---------- Berlin office with Ben and Vince ----------
  const office = buildOffice(BERLIN.lat, BERLIN.lon);
  world.add(office.frame);
  pick(office.frame, { type: "place", id: "berlin" });
  const rigs: Record<WorldPersonId, AvatarRig> = { ana: buildAvatar(anaSpec("everyday", null)), ben: buildAvatar(PEOPLE.ben.avatar), vince: buildAvatar(PEOPLE.vince.avatar) };
  // Ana's rig is rebuilt when her look changes; everything that places or follows her uses this stable holder
  const anaRoot = new THREE.Group();
  anaRoot.add(rigs.ana.root);
  // look props (scooter, rock) live on Ana's island
  const lookProps = new THREE.Group();
  let ride: ReturnType<typeof buildScooter> | null = null;
  let rock: ReturnType<typeof buildRock> | null = null;
  let currentLook: AnaLookId = "everyday";
  let lookKey = "everyday|-|-";
  canvas.dataset.anaLook = "everyday";
  rigs.ben.root.position.copy(office.benSpot);
  rigs.ben.root.scale.multiplyScalar(0.9);
  office.frame.add(rigs.ben.root);
  rigs.vince.root.position.copy(office.vinceSpot);
  rigs.vince.root.rotation.y = -0.55;
  rigs.vince.root.scale.multiplyScalar(0.9);
  office.frame.add(rigs.vince.root);
  pick(rigs.ben.root, { type: "person", id: "ben" });
  pick(rigs.vince.root, { type: "person", id: "vince" });

  // ---------- Ana ----------
  let anaSpot: AnaSpot | null = null;
  let anaPlaceKey = "";
  const anaHolder = new THREE.Group();
  world.add(anaHolder);
  function placeAna(place: WorldPlace | null) {
    const k = place ? `${place.lat},${place.lon}` : "none";
    if (k === anaPlaceKey) return;
    anaPlaceKey = k;
    if (anaSpot) {
      unpick(anaSpot.frame);
      anaSpot.frame.remove(lookProps);
      anaRoot.parent?.remove(anaRoot);
      anaHolder.remove(anaSpot.frame);
      disposeGeometry(anaSpot.frame);
    }
    // without a place Ana floats on an island in the sky, clearly not on the map
    anaSpot = place ? buildAnaSpot(place.lat, place.lon) : buildAnaSpot(-8, -150);
    if (!place) anaSpot.frame.position.multiplyScalar(1.25);
    anaHolder.add(anaSpot.frame);
    const here = ll(place?.lat ?? -8, place?.lon ?? -150, 1).normalize();
    for (const puff of clouds.children) puff.visible = puff.position.clone().normalize().angleTo(here) > 0.5;
    anaRoot.position.copy(anaSpot.anaSpot);
    anaSpot.frame.add(anaRoot);
    anaSpot.frame.add(lookProps);
    pick(anaSpot.frame, { type: "place", id: "ana" });
    pick(anaRoot, { type: "person", id: "ana" });
    pick(lookProps, { type: "person", id: "ana" });
    VIEWS.ana = { ...(place ? closeView(place.lat, place.lon, 1.2) : closeView(-8, -150, 4.2)), focus: "ana" };
    anaLabelAnchor.position.set(0, 0, 0);
    anaSpot.frame.add(anaLabelAnchor);
  }
  const anaLabelAnchor = new THREE.Object3D();

  function dressAna(look: AnaLookId, colors: OutfitColors | null) {
    const key = `${look}|${colors?.primary ?? "-"}|${colors?.secondary ?? "-"}`;
    if (key === lookKey) return;
    lookKey = key;
    currentLook = look;
    unpick(anaRoot);
    unpick(lookProps);
    anaRoot.remove(rigs.ana.root);
    disposeGeometry(rigs.ana.root);
    rigs.ana = buildAvatar(anaSpec(look, colors));
    anaRoot.add(rigs.ana.root);
    // back on the island before the old props go (a rider sits inside the scooter group)
    if (anaSpot && anaRoot.parent !== anaSpot.frame) anaSpot.frame.add(anaRoot);
    disposeGeometry(lookProps);
    lookProps.clear();
    ride = null;
    rock = null;
    if (look === "scooter") {
      ride = buildScooter(0x8fd3c1);
      lookProps.add(ride.group);
    }
    if (look === "mermaid") {
      rock = buildRock();
      rock.group.position.set(0.05, 0.1, 0.42);
      lookProps.add(rock.group);
    }
    pick(anaRoot, { type: "person", id: "ana" });
    pick(lookProps, { type: "person", id: "ana" });
    canvas.dataset.anaLook = look;
  }

  // ---------- stations ----------
  const stations = new Map<string, Station>();
  const stationHolder = office.stationAnchor;

  // ---------- Instagram orbit + other channels ----------
  const ringPivot = new THREE.Group();
  ringPivot.rotation.set(0.42, 0, -0.18);
  scene.add(ringPivot);
  const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.05, 6, 180), new THREE.MeshBasicMaterial({ color: 0xd8566f, transparent: true, opacity: 0.45 }));
  ringMesh.rotation.x = Math.PI / 2;
  ringPivot.add(ringMesh);
  pick(ringMesh, { type: "ring" });
  const ringSpin = new THREE.Group();
  ringPivot.add(ringSpin);
  const ringAnchor = new THREE.Object3D();
  ringAnchor.position.set(-RING_R, 0, 0);
  ringPivot.add(ringAnchor);
  const otherRings = new THREE.Group();
  scene.add(otherRings);

  const cards = new Map<string, { group: THREE.Group; slot: THREE.Vector3; launch: number; post: WorldPost }>();
  const heartGeo = heartGeometry();
  const heartMat = new THREE.MeshBasicMaterial({ color: PALETTE.heart, side: THREE.DoubleSide, transparent: true });
  const bubbleGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: PALETTE.comment, transparent: true });

  // ---------- VPS satellite ----------
  const satPivot = new THREE.Group();
  satPivot.rotation.set(-0.5, 0, 0.6);
  scene.add(satPivot);
  const sat = new THREE.Group();
  satPivot.add(sat);
  sat.add(mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), 0xe6e9ef, 1.1));
  for (const s of [-1, 1]) {
    const panel = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.45), 0x5a78b8, 1.15);
    panel.position.x = s * 0.85;
    sat.add(panel);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: PALETTE.ok }));
  led.position.set(0, 0.2, 0.29);
  sat.add(led);
  pick(sat, { type: "vps" });

  // ---------- audience arcs ----------
  const arcs = new THREE.Group();
  world.add(arcs);
  const comets: Array<{ m: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; speed: number }> = [];
  const ripples: THREE.Mesh[] = [];

  // ---------- labels ----------
  const labels: Label[] = [];
  function label(text: string, sub: string | null, anchor: THREE.Object3D, ref: SceneRef | null, o: Partial<Pick<Label, "dy" | "focus" | "minDist" | "maxDist" | "dx" | "priority">> & { cls?: string; tint?: string } = {}): Label {
    const el = document.createElement(ref ? "button" : "div");
    el.className = `world-label${o.cls ? ` ${o.cls}` : ""}`;
    if (ref) (el as HTMLButtonElement).type = "button";
    const b = document.createElement("b");
    b.textContent = text;
    if (o.tint) el.style.setProperty("--tint", o.tint);
    el.appendChild(b);
    let subEl: HTMLElement | null = null;
    if (sub !== null) {
      const s = document.createElement("small");
      subEl = s;
      s.textContent = sub;
      // the line may be cut with an ellipsis; the full text stays available on hover
      s.title = sub;
      el.appendChild(s);
    }
    if (ref) el.addEventListener("click", () => options.onSelect(ref));
    labelHost.appendChild(el);
    const l: Label = { el, anchor, dy: o.dy ?? 0, focus: o.focus ?? null, minDist: o.minDist ?? 0, maxDist: o.maxDist ?? 999, dx: o.dx ?? 0, priority: o.priority ?? 1, subEl, w: 0, h: 0, shift: 0 };
    labels.push(l);
    return l;
  }
  const dataLabels: Label[] = [];
  function clearDataLabels() {
    for (const l of dataLabels) {
      l.el.remove();
      labels.splice(labels.indexOf(l), 1);
    }
    dataLabels.length = 0;
  }

  // ---------- camera ----------
  type View = { lat: number; lon: number; dist: number; look: THREE.Vector3; focus: "berlin" | "ana" | null; auto: boolean };
  function closeView(lat: number, lon: number, lookLift: number): View {
    return { lat: lat - 15, lon, dist: 14.2, look: ll(lat, lon, R + lookLift), focus: null, auto: false };
  }
  const VIEWS: Record<ViewName, View> = {
    world: { lat: 30, lon: 55, dist: 38, look: new THREE.Vector3(), focus: null, auto: true },
    berlin: { ...closeView(BERLIN.lat, BERLIN.lon, 1.8), dist: 15.2, focus: "berlin" },
    ana: closeView(18, 99, 1.2),
    orbit: { lat: 14, lon: 70, dist: 47, look: new THREE.Vector3(), focus: null, auto: true },
  };
  const cam = { lat: 34, lon: 20, dist: 44, tLat: 30, tLon: 55, tDist: 38, look: new THREE.Vector3(), tLook: new THREE.Vector3(), focus: null as "berlin" | "ana" | null, auto: !reduced };
  function focus(view: ViewName) {
    const v = VIEWS[view];
    cam.tLat = v.lat;
    let d = v.lon - cam.lon;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    cam.tLon = cam.lon + d;
    cam.tDist = v.dist;
    cam.tLook.copy(v.look);
    cam.focus = view === "berlin" ? "berlin" : view === "ana" ? "ana" : null;
    cam.auto = v.auto && !reduced;
    if (reduced) {
      cam.lat = cam.tLat;
      cam.lon = cam.tLon;
      cam.dist = cam.tDist;
      cam.look.copy(cam.tLook);
    }
  }

  // ---------- data ----------
  let data: SceneData | null = null;
  let lastSignature = "";

  function setData(next: SceneData) {
    data = next;
    placeAna(next.anaPlace);
    dressAna(next.anaLook.look, next.anaLook.colors);
    // stations
    for (const [id, s] of stations) {
      if (!next.projects.some((p) => p.id === id)) {
        unpick(s.group);
        stationHolder.remove(s.group);
        stations.delete(id);
      }
    }
    next.projects.forEach((p, i) => {
      let s = stations.get(p.id);
      if (!s) {
        s = buildStation(p.shape, p.status === "no-source" ? 0xc4c9d2 : p.owner === "vince" ? 0x8a5cf6 : 0x5b7fd6);
        const n = next.projects.length;
        const a = (-1 + (2 * i) / Math.max(1, n - 1)) * 1.05;
        s.group.position.set(Math.sin(a) * 1.85, 1.75 + (i % 2) * 0.38, -Math.cos(a) * 0.55);
        stationHolder.add(s.group);
        stations.set(p.id, s);
        pick(s.group, { type: "project", id: p.id });
      }
      (s.lamp.material as THREE.MeshBasicMaterial).color.setHex(STATUS_COLOR[p.status]);
    });
    // post cards
    const ids = new Set(next.posts.map((p) => p.id));
    for (const [id, c] of cards) {
      if (!ids.has(id)) {
        unpick(c.group);
        ringSpin.remove(c.group);
        disposeGeometry(c.group);
        cards.delete(id);
      }
    }
    const reaches = next.posts.map((p) => p.reach ?? 0);
    const maxReach = Math.max(1, ...reaches);
    next.posts.slice(0, ORBIT_MAX).forEach((p, i, arr) => {
      const ang = (i / arr.length) * Math.PI * 2;
      const slot = new THREE.Vector3(Math.cos(ang) * RING_R, 0, Math.sin(ang) * RING_R);
      const existing = cards.get(p.id);
      const size = p.reach === null ? 0.55 : 0.6 + Math.sqrt(p.reach / maxReach) * 0.75;
      const colour = p.er === null || next.erMedian === null ? 0xb9c0cb : p.er >= next.erMedian ? 0xe2785e : 0x6fbdb8;
      if (existing) {
        existing.slot = slot;
        existing.post = p;
        const body = existing.group.children[0] as THREE.Mesh;
        (body.material as THREE.MeshToonMaterial).color.setHex(colour);
        existing.group.scale.setScalar(size);
        return;
      }
      const g = new THREE.Group();
      const body = mesh(new THREE.BoxGeometry(0.62, 1, 0.06), colour, 1.1, { emissive: p.fresh ? PALETTE.glow : undefined, unique: true });
      g.add(body);
      const pic = basic(new THREE.PlaneGeometry(0.5, 0.56), 0xfbfcfd);
      pic.position.set(0, 0.1, 0.035);
      g.add(pic);
      const sun = basic(new THREE.CircleGeometry(0.08, 16), 0xffd66b);
      sun.position.set(0.12, 0.25, 0.04);
      g.add(sun);
      const hill = basic(new THREE.CircleGeometry(0.2, 3), 0x9fcf8d);
      hill.rotation.z = Math.PI / 2;
      hill.position.set(-0.04, 0.02, 0.04);
      g.add(hill);
      const er = p.er === null ? 0 : Math.min(1, p.er / 0.2);
      const barBg = basic(new THREE.PlaneGeometry(0.5, 0.06), 0xe8e3d4);
      barBg.position.set(0, -0.33, 0.04);
      g.add(barBg);
      if (er > 0) {
        const bar = basic(new THREE.PlaneGeometry(0.5 * er, 0.06), PALETTE.ink);
        bar.position.set(-0.25 * (1 - er), -0.33, 0.045);
        g.add(bar);
      }
      g.scale.setScalar(size);
      ringSpin.add(g);
      const launch = reduced ? 1 : 0;
      cards.set(p.id, { group: g, slot, launch, post: p });
      pick(g, { type: "post", id: p.id });
    });
    canvas.dataset.posts = String(cards.size);
    const signature = JSON.stringify([next.countries.map((c) => [c.key, c.value, c.label]), next.anaPlace, next.projects, next.channels.map((c) => [c.def.id, c.status]), next.labels]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    // other channels: dashed rings, not connected
    disposeGeometry(otherRings);
    otherRings.clear();
    next.channels
      .filter((c) => c.def.id !== "instagram")
      .forEach((c, i) => {
        const ring = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, k) => new THREE.Vector3(Math.cos((k / 160) * Math.PI * 2) * (RING_R + 1.4 + i * 0.9), 0, Math.sin((k / 160) * Math.PI * 2) * (RING_R + 1.4 + i * 0.9)))),
          new THREE.LineDashedMaterial({ color: c.def.color, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.45 }),
        );
        ring.computeLineDistances();
        ring.rotation.set(0.42 + (i + 1) * 0.16, 0, -0.18 - (i + 1) * 0.12);
        otherRings.add(ring);
      });
    // audience arcs
    unpick(arcs);
    disposeGeometry(arcs);
    arcs.clear();
    comets.length = 0;
    ripples.length = 0;
    const target = next.anaPlace ? ll(next.anaPlace.lat, next.anaPlace.lon, R + 0.5) : null;
    let drawn = 0;
    for (const c of next.countries.slice(0, 20)) {
      const cen = geo.centroids.get(c.key);
      if (!cen) continue;
      drawn++;
      const base = ll(cen.lat, cen.lon, R + 0.12);
      // a flat disc on the ground: size = share; never a pillar that could cut through the dioramas
      const radius = 0.22 + Math.sqrt(c.share) * 1.1;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.04, 32), new THREE.MeshBasicMaterial({ color: 0xd8566f, transparent: true, opacity: 0.42, depthWrite: false }));
      disc.position.copy(ll(cen.lat, cen.lon, R + 0.23));
      disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), base.clone().normalize());
      arcs.add(disc);
      pick(disc, { type: "country", key: c.key });
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 6, 40), new THREE.MeshBasicMaterial({ color: 0xa8321c, transparent: true, opacity: 0.8 }));
      ripple.rotation.x = Math.PI / 2;
      disc.add(ripple);
      ripples.push(ripple);
      if (target && base.distanceTo(target) > 1.2) {
        const mid = base.clone().add(target).multiplyScalar(0.5);
        mid.setLength(R + 1.2 + base.distanceTo(target) * 0.32);
        const curve = new THREE.QuadraticBezierCurve3(base, mid, target);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.025 + Math.sqrt(c.share) * 0.09, 6), new THREE.MeshBasicMaterial({ color: 0xd8566f, transparent: true, opacity: 0.5 }));
        arcs.add(tube);
        pick(tube, { type: "country", key: c.key });
        const n = reduced ? 0 : Math.max(1, Math.round(c.share * 8));
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: 0xffe2e8 }));
          m.scale.setScalar(0.7);
          arcs.add(m);
          comets.push({ m, curve, t: k / n, speed: 0.08 + c.share * 0.12 });
        }
      }
    }
    canvas.dataset.arcs = String(drawn);
    // data labels
    clearDataLabels();
    for (const p of next.projects) {
      const s = stations.get(p.id);
      if (s) dataLabels.push(label(p.label, p.sub, s.group, { type: "project", id: p.id }, { dy: 0.75, focus: "berlin", maxDist: 20, cls: `station-${p.status}`, priority: 4 }));
    }
    const places = [BERLIN, ...(next.anaPlace ? [next.anaPlace] : [])].map((p) => ll(p.lat, p.lon, 1).normalize());
    for (const c of next.countries.slice(0, 6)) {
      const cen = geo.centroids.get(c.key);
      if (!cen) continue;
      const dir = ll(cen.lat, cen.lon, 1).normalize();
      if (places.some((p) => p.angleTo(dir) < 0.16)) continue;
      const a = new THREE.Object3D();
      a.position.copy(ll(cen.lat, cen.lon, R + 0.6));
      arcs.add(a);
      dataLabels.push(label(c.label, `${Math.round(c.share * 100)} %`, a, { type: "country", key: c.key }, { minDist: 22, maxDist: 60, cls: "country", priority: 2 }));
    }
    next.channels
      .filter((c) => c.def.id !== "instagram")
      .forEach((c, i) => {
        const ring = otherRings.children[i];
        if (!ring) return;
        const a = new THREE.Object3D();
        a.position.set(RING_R + 1.4 + i * 0.9, 0, 0);
        ring.add(a);
        dataLabels.push(label(c.def.label, next.labels.notConnected, a, null, { minDist: 40, cls: "channel-off", priority: 1 }));
      });
    const L = next.labels;
    for (const l of staticLabels) l.el.remove();
    staticLabels.forEach((l) => labels.splice(labels.indexOf(l), 1));
    staticLabels.length = 0;
    staticLabels.push(
      label(L.people.ben.name, L.people.ben.sub, rigs.ben.root, { type: "person", id: "ben" }, { dy: 1.45, focus: "berlin", maxDist: 22, cls: "person", tint: PEOPLE.ben.tint, priority: 6 }),
      label(L.people.vince.name, L.people.vince.sub, rigs.vince.root, { type: "person", id: "vince" }, { dy: 1.45, focus: "berlin", maxDist: 22, cls: "person", tint: PEOPLE.vince.tint, priority: 6 }),
      (anaLabel = label(L.people.ana.name, L.people.ana.sub, anaRoot, { type: "person", id: "ana" }, { dy: 1.5, focus: "ana", maxDist: 22, cls: "person", tint: PEOPLE.ana.tint, priority: 6 })),
      (berlinLabel = label(L.berlin, "", office.frame, { type: "place", id: "berlin" }, { dy: 2.4, minDist: 22, priority: 5 })),
      (placeLabel = label(L.anaPlace, "", anaLabelAnchor, { type: "place", id: "ana" }, { dy: 2.1, minDist: 22, priority: 5 })),
      label(L.vps, L.vpsSub, sat, { type: "vps" }, { dy: 0.9, minDist: 18, priority: 3 }),
      label(L.ring, L.ringSub, ringAnchor, { type: "ring" }, { dy: 1, minDist: 30, priority: 3 }),
    );
    lastClock = -1;
    zzz = label("Z z z", null, anaRoot, null, { dy: 1.2, dx: 46, focus: "ana", maxDist: 22, cls: "zzz", priority: 6 });
    staticLabels.push(zzz);
    canvas.dataset.ready = "true";
  }
  const staticLabels: Label[] = [];
  let zzz: Label | null = null;
  let anaLabel: Label | null = null;
  let berlinLabel: Label | null = null;
  let placeLabel: Label | null = null;
  let lastClock = -1;
  function setSub(l: Label | null, text: string) {
    if (!l?.subEl || l.subEl.textContent === text) return;
    l.subEl.textContent = text;
    l.w = 0;
  }

  // ---------- bursts (real counter changes) ----------
  const particles: Array<{ m: THREE.Mesh; v: THREE.Vector3; life: number; total: number }> = [];
  const launches: Array<{ id: string }> = [];
  function burst(events: readonly PulseEvent[]) {
    for (const e of events) {
      if (e.kind === "new-post" && e.postId) {
        const c = cards.get(e.postId);
        if (c) c.launch = 0;
        launches.push({ id: e.postId });
        continue;
      }
      const origin = new THREE.Vector3();
      if (e.postId && cards.get(e.postId)) cards.get(e.postId)?.group.getWorldPosition(origin);
      else anaRoot.localToWorld(origin.set(0, 1.2, 0));
      const n = Math.min(14, Math.max(1, Math.abs(e.delta)));
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(e.kind === "comments" ? bubbleGeo : heartGeo, e.kind === "comments" ? bubbleMat.clone() : heartMat.clone());
        m.position.copy(origin);
        m.scale.setScalar(e.kind === "followers" ? 2.2 : 1.6);
        scene.add(m);
        const dir = origin.clone().normalize().multiplyScalar(0.9).add(new THREE.Vector3(Math.cos(k * 2.4), Math.sin(k * 1.7), Math.sin(k * 2.9)).multiplyScalar(0.6));
        particles.push({ m, v: dir, life: 0, total: reduced ? 0.01 : 2.4 });
      }
    }
  }

  // ---------- input ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; moved: number } | null = null;
  let pinch0 = 0;
  let dist0 = 0;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down = { x: e.clientX, y: e.clientY, moved: 0 };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (a && b) {
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        dist0 = cam.tDist;
      }
    }
    cam.auto = false;
  };
  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (a && b && pinch0 > 0) cam.tDist = Math.min(52, Math.max(12, (dist0 * pinch0) / Math.hypot(a.x - b.x, a.y - b.y)));
      return;
    }
    const f = 0.22 * (cam.dist / 36);
    cam.tLon -= dx * f;
    cam.tLat = Math.max(-75, Math.min(78, cam.tLat + dy * f));
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (down && down.moved < 6 && pointers.size === 0) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const ocean = world.getObjectByName("ocean");
      const hit = ray.intersectObjects(ocean ? [...pickables, ocean] : pickables, false)[0];
      const ref = hit ? refOf.get(hit.object) : undefined;
      if (ref) options.onSelect(ref);
    }
    if (pointers.size === 0) down = null;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cam.tDist = Math.min(52, Math.max(12, cam.tDist * (1 + e.deltaY * 0.0012)));
    cam.auto = false;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  // while the pointer is over the stage the orbit and the auto camera stand still, so a moving post card can be hit
  let hovering = false;
  let hoverAt: { x: number; y: number } | null = null;
  canvas.dataset.orbit = reduced ? "still" : "running";
  const onEnter = () => {
    hovering = true;
    if (!reduced) canvas.dataset.orbit = "paused";
  };
  const onLeave = () => {
    hovering = false;
    hoverAt = null;
    canvas.style.cursor = "";
    if (!reduced) canvas.dataset.orbit = "running";
  };
  // a late font subset changes label widths: measure again
  const remeasure = () => {
    for (const l of labels) l.w = 0;
  };
  document.fonts?.addEventListener?.("loadingdone", remeasure);
  const onHover = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && pointers.size === 0) hoverAt = { x: e.offsetX, y: e.offsetY };
  };
  // the stage element holds the canvas and the labels, so pointing at a label does not count as leaving
  const stage = canvas.parentElement ?? canvas;
  stage.addEventListener("pointerenter", onEnter);
  stage.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointermove", onHover);
  function updateCursor() {
    if (!hoverAt) return;
    ndc.set((hoverAt.x / (canvas.clientWidth || 1)) * 2 - 1, -(hoverAt.y / (canvas.clientHeight || 1)) * 2 + 1);
    hoverAt = null;
    ray.setFromCamera(ndc, camera);
    // "" leaves the stylesheet's grab/grabbing cursor in charge
    canvas.style.cursor = ray.intersectObjects(pickables, false)[0] ? "pointer" : "";
  }

  // ---------- loop ----------
  // lying on her back along the hammock (head towards the first palm), face up
  const sleepPose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.12).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  const clock = new THREE.Clock();
  let T = 0;
  let orbitT = 0;
  let raf = 0;
  const tmp = new THREE.Vector3();
  const proj = new THREE.Vector3();

  let shownCount = -1;
  function updateLabels() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cp = camera.position;
    const focused = document.activeElement;
    const shown: Array<{ l: Label; x: number; y: number }> = [];
    const off: Label[] = [];
    // pass 1: projection only, no DOM reads or writes
    for (const l of labels) {
      l.anchor.updateWorldMatrix(true, false);
      const s = l.anchor.getWorldScale(tmp).x || 1;
      const p = l.anchor.localToWorld(new THREE.Vector3(0, l.dy / s, 0));
      let vis = !l.hidden;
      const d = p.clone().sub(cp);
      const len = d.length();
      d.normalize();
      const b = cp.dot(d);
      const c = cp.lengthSq() - R * 1.02 * R * 1.02;
      const disc = b * b - c;
      if (disc > 0) {
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < len - 0.2) vis = false;
      }
      if (cam.dist > l.maxDist || cam.dist < l.minDist) vis = false;
      if (l.focus && cam.focus !== l.focus) vis = false;
      proj.copy(p).project(camera);
      if (proj.z > 1) vis = false;
      if (vis) shown.push({ l, x: (proj.x * 0.5 + 0.5) * w + l.dx, y: (-proj.y * 0.5 + 0.5) * h });
      else off.push(l);
    }
    // pass 2: measure labels whose size is unknown (once, and again after a font swap); visibility:hidden keeps the box
    for (const { l } of shown) {
      if (l.w === 0) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
    }
    // a label with keyboard focus keeps its spot (a mouse click focuses a button too, hence :focus-visible)
    const placement = declutter(shown.map(({ l, x, y }) => ({ x, y, w: l.w, h: l.h, priority: l.el === focused && l.el.matches(":focus-visible") ? 99 : l.priority, prevShift: l.shift })));
    // pass 3: writes only
    for (const l of off) {
      l.shift = 0;
      hideLabel(l);
    }
    let count = 0;
    shown.forEach(({ l, x, y }, i) => {
      const at = placement[i];
      if (!at || !at.visible) {
        hideLabel(l);
        return;
      }
      count++;
      l.shift = at.shift;
      l.el.classList.remove("is-hidden");
      if (l.el instanceof HTMLButtonElement) l.el.tabIndex = 0;
      l.el.style.transform = `translate(${x}px, ${y + at.shift}px) translate(-50%, -100%)`;
    });
    if (count !== shownCount) {
      shownCount = count;
      canvas.dataset.labels = String(count);
    }
  }
  function hideLabel(l: Label) {
    l.el.classList.add("is-hidden");
    if (l.el instanceof HTMLButtonElement) l.el.tabIndex = -1;
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, clock.getDelta());
    T += dt;
    const mo = reduced ? 0 : 1;
    const hold = hovering ? 0 : 1;
    // orbit time stands still while the pointer is over the stage, so cards hold their exact place
    orbitT += dt * hold;
    if (cam.auto) cam.tLon += dt * 3 * hold;
    const k = reduced ? 1 : 1 - Math.pow(0.0025, dt);
    cam.lat += (cam.tLat - cam.lat) * k;
    cam.lon += (cam.tLon - cam.lon) * k;
    cam.dist += (cam.tDist - cam.dist) * k;
    cam.look.lerp(cam.tLook, k);
    ll(cam.lat, cam.lon, cam.dist, camera.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.look);

    clouds.rotation.y += dt * 0.008 * mo;
    // time of day from the real clock: Berlin exactly, Ana's place from its time zone (estimated without one)
    const bNight = isNight(berlinHour()) || berlinHour() >= 18;
    office.windows.color.setHex(bNight ? 0xffd66b : 0xaab8c8);
    const place = data?.anaPlace ?? null;
    const aNight = place !== null && isNight(anaHour(place));
    if (T - lastClock >= 1 || lastClock < 0) {
      lastClock = T;
      setSub(berlinLabel, clockIn("Europe/Berlin"));
      if (place) setSub(placeLabel, place.tz ? clockIn(place.tz) : `${data?.labels.clockApprox ?? "≈"} ${estimatedClock(place.lon)}`);
      if (data) setSub(anaLabel, data.labels.anaStates[aNight ? "sleeping" : currentLook]);
    }
    // Ben types, Vince talks on the phone, Ana films or sleeps (decoration, not activity data)
    rigs.ben.root.rotation.y = 0.55;
    rigs.ben.armL.rotation.x = -1.15 + Math.sin(T * 13) * 0.16 * mo;
    rigs.ben.armR.rotation.x = -1.15 + Math.sin(T * 13 + 1.7) * 0.16 * mo;
    rigs.ben.body.position.y = 0.06;
    rigs.ben.head.rotation.x = 0.12 + Math.sin(T * 0.7) * 0.03 * mo;
    (office.laptopScreen.material as THREE.MeshBasicMaterial).color.setHSL(0.6, 0.85, 0.74 + Math.sin(T * 2.5) * 0.04 * mo);
    rigs.vince.armR.rotation.set(-2.35, 0, 0.3);
    rigs.vince.armL.rotation.x = -0.25 + Math.sin(T * 1.6) * 0.15 * mo;
    rigs.vince.head.rotation.z = Math.sin(T * 1.5) * 0.08 * mo;
    rigs.vince.root.position.y = office.vinceSpot.y + Math.abs(Math.sin(T * 1.6)) * 0.015 * mo;
    if (anaSpot) {
      const riding = !aNight && currentLook === "scooter" && ride !== null;
      const holder = riding && ride ? ride.group : anaSpot.frame;
      if (anaRoot.parent !== holder) holder.add(anaRoot);
      const tail = rigs.ana.body.userData.tail as THREE.Group[] | undefined;
      let pose: string;
      rigs.ana.head.rotation.y = 0;
      if (aNight) {
        pose = "sleeping";
        anaRoot.position.set(0.4, 0.5, -0.38);
        anaRoot.quaternion.copy(sleepPose);
        rigs.ana.eyes.scale.y = 0.12;
        rigs.ana.armL.rotation.set(0, 0, 0);
        rigs.ana.armR.rotation.set(-0.2, 0, 0);
        tail?.forEach((seg) => seg.rotation.set(0, 0, 0));
        if (ride) {
          // parked next to the hammock
          ride.group.position.set(-0.55, 0.1, 0.5);
          ride.group.rotation.set(0, 0.7, 0);
        }
      } else if (riding && ride) {
        pose = "riding";
        // a loop around the island; heading follows the path, a slight lean into the curve
        const a = T * 0.5 * mo + 0.6;
        const rx = 0.5;
        const rz = 0.38;
        ride.group.position.set(-0.05 + Math.cos(a) * rx, 0.1, 0.12 + Math.sin(a) * rz);
        ride.group.rotation.set(0, Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz), 0);
        ride.group.rotateZ(0.12 * mo);
        for (const w of ride.wheels) w.rotation.x += dt * 9 * mo;
        anaRoot.position.set(0, ride.seat.y - 0.32, ride.seat.z);
        anaRoot.quaternion.identity();
        rigs.ana.eyes.scale.y = 1;
        rigs.ana.armL.rotation.set(-1.25, 0, 0.12);
        rigs.ana.armR.rotation.set(-1.25, 0, -0.12);
        rigs.ana.head.rotation.y = Math.sin(T * 0.9) * 0.25 * mo;
      } else if (currentLook === "mermaid" && rock) {
        pose = "sitting";
        anaRoot.position.set(rock.group.position.x, rock.group.position.y + rock.top.y - 0.16, rock.group.position.z);
        anaRoot.quaternion.setFromEuler(new THREE.Euler(0, 0.25, 0));
        rigs.ana.eyes.scale.y = 1;
        // waving, the tail flapping slowly
        rigs.ana.armL.rotation.set(0, 0, 0.25);
        rigs.ana.armR.rotation.set(-2.85 + Math.sin(T * 3) * 0.22 * mo, 0, 0.3);
        tail?.forEach((seg, k) => seg.rotation.set(-0.46 + Math.sin(T * 2.2 - k * 0.7) * 0.1 * mo, 0, 0));
      } else {
        pose = "standing";
        anaRoot.position.copy(anaSpot.anaSpot);
        anaRoot.position.y += Math.abs(Math.sin(T * 2.2)) * 0.025 * mo;
        anaRoot.quaternion.setFromEuler(new THREE.Euler(0, 0.25, 0));
        rigs.ana.eyes.scale.y = 1;
        rigs.ana.armL.rotation.set(0, 0, 0);
        // the coconut, raised like in her photo
        rigs.ana.armR.rotation.set(-2.6 + Math.sin(T * 1.8) * 0.1 * mo, 0, 0.35);
      }
      if (ride && !riding && !aNight) {
        ride.group.position.set(-0.55, 0.1, 0.5);
        ride.group.rotation.set(0, 0.7, 0);
      }
      anaSpot.hammock.visible = true;
      if (canvas.dataset.anaPose !== pose) canvas.dataset.anaPose = pose;
    }
    if (zzz) zzz.hidden = !aNight;
    // stations
    let i = 0;
    for (const [id, s] of stations) {
      s.icon.rotation.y += dt * 0.6 * mo;
      s.icon.position.y = 0.38 + Math.sin(T * 1.6 + i++) * 0.04 * mo;
      const p = data?.projects.find((x) => x.id === id);
      if (p && (p.status === "busy" || p.status === "recent")) s.lamp.scale.setScalar(1 + Math.sin(T * 4 + i) * 0.22 * mo);
    }
    // orbit
    ringSpin.rotation.y += dt * 0.04 * mo * hold;
    const anaWorld = anaRoot.localToWorld(new THREE.Vector3(0, 1.2, 0));
    for (const c of cards.values()) {
      if (c.launch < 1) {
        c.launch = Math.min(1, c.launch + dt * 0.5 * hold);
        const e = 1 - Math.pow(1 - c.launch, 3);
        const start = ringSpin.worldToLocal(anaWorld.clone());
        const mid = start.clone().add(c.slot).multiplyScalar(0.5).setLength(RING_R * 1.2);
        const v = 1 - e;
        c.group.position.set(v * v * start.x + 2 * v * e * mid.x + e * e * c.slot.x, v * v * start.y + 2 * v * e * mid.y + e * e * c.slot.y, v * v * start.z + 2 * v * e * mid.z + e * e * c.slot.z);
      } else {
        c.group.position.copy(c.slot);
        c.group.position.y = Math.sin(orbitT * 1.1 + c.slot.x) * 0.15 * mo;
      }
      c.group.lookAt(camera.position);
    }
    const sa = orbitT * 0.08 * mo + 1.2;
    sat.position.set(Math.cos(sa) * SAT_R, 0, Math.sin(sa) * SAT_R);
    sat.rotation.y = -sa;
    (led.material as THREE.MeshBasicMaterial).color.setHSL(0.4, 0.6, 0.42 + Math.sin(T * 5) * 0.1 * mo);
    for (const r of ripples) {
      const s = 1 + ((T * 0.5) % 1) * 0.35 * mo;
      r.scale.set(s, s, 1);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.8 - ((T * 0.5) % 1) * 0.6 * mo;
    }
    for (const c of comets) {
      c.t = (c.t + dt * c.speed) % 1;
      c.curve.getPoint(c.t, c.m.position);
    }
    for (let j = particles.length - 1; j >= 0; j--) {
      const p = particles[j];
      if (!p) continue;
      p.life += dt;
      p.m.position.addScaledVector(p.v, dt * 1.6);
      p.m.lookAt(camera.position);
      const mat = p.m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - p.life / p.total);
      if (p.life >= p.total) {
        scene.remove(p.m);
        mat.dispose();
        particles.splice(j, 1);
      }
    }
    renderer.render(scene, camera);
    updateLabels();
    updateCursor();
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  focus("world");
  raf = requestAnimationFrame(frame);

  return {
    setData,
    burst,
    focus,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerenter", onEnter);
      stage.removeEventListener("pointerleave", onLeave);
      document.fonts?.removeEventListener?.("loadingdone", remeasure);
      canvas.removeEventListener("pointermove", onHover);
      for (const l of labels) l.el.remove();
      disposeTree(scene);
      heartGeo.dispose();
      renderer.dispose();
    },
  };
}

