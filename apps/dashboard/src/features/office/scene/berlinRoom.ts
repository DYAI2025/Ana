/**
 * Office Berlin as a small 3D room, built from the same comic kit as the world and Ana's office: a Berlin Altbau with
 * floorboards, tall windows over the rooftops and the TV tower, Ben's and Vince's desks, and the ticket wall. The wall
 * shows every open ticket as a post-it in its column, coloured by who works on it, with a glowing "?" while Ana waits
 * for an answer. A note on each desk names the ticket that person is on right now. A ticket that moves columns flies
 * across the wall (instantly under reduced motion). Clicks call onPick; the HTML board opens over the room.
 */
import * as THREE from "three";
import type { AvatarSpec } from "@/features/world/people";
import { buildAvatar } from "@/features/world/scene/avatar";
import { canvasTexture, disposeGeometry, hex, mesh, PALETTE, toon } from "@/features/world/scene/kit";

export const BERLIN_SPOTS = ["board", "ben", "vince"] as const;
export type BerlinSpot = (typeof BERLIN_SPOTS)[number];

export interface WallNote {
  id: string;
  title: string;
  column: "todo" | "doing" | "done";
  assignee: "ben" | "vince" | "none";
  question: boolean;
}

export interface BerlinScene {
  focus(spot: BerlinSpot | null): void;
  setWall(notes: readonly WallNote[], labels: { columns: Record<WallNote["column"], string>; more: (n: number) => string }): void;
  setDesk(person: "ben" | "vince", title: string | null, idle: string): void;
  anchors(): Record<BerlinSpot, { x: number; y: number } | null>;
  resize(): void;
  dispose(): void;
}

const THEME = {
  wall: 0xeee6d8,
  sideWall: 0xdfe6ea,
  stucco: 0xfbfcfd,
  floor: 0xb98a5a,
  floorLine: 0x8f6640,
  desk: 0xd8c3a5,
  ben: "#d4cde9",
  vince: "#eadcc9",
  none: "#fff3b8",
  question: "#e8a03a",
} as const;

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const POSES: Record<BerlinSpot | "room", Pose> = {
  room: { pos: new THREE.Vector3(1.2, 2.9, 5.6), look: new THREE.Vector3(0.1, 1.2, -1.2) },
  // the board sits in the left half of the view: the drawer covers the right one
  board: { pos: new THREE.Vector3(3.3, 1.75, 0.95), look: new THREE.Vector3(3.25, 1.7, -2.5) },
  // a desk sits in the left half too: the camera stands to its right and looks straight ahead
  ben: { pos: new THREE.Vector3(-0.6, 1.55, 2.1), look: new THREE.Vector3(-0.6, 1.05, -0.9) },
  vince: { pos: new THREE.Vector3(1.25, 1.55, 2.1), look: new THREE.Vector3(1.25, 1.05, -0.9) },
};

function poseFor(spot: BerlinSpot | null, aspect: number): Pose {
  const base = POSES[spot ?? "room"];
  if (aspect >= 0.9) return base;
  if (!spot) return { pos: base.look.clone().add(base.pos.clone().sub(base.look).multiplyScalar(1.35)), look: base.look.clone() };
  // tall screens: the thing goes into the top part, the sheet covers the rest
  const target = spot === "board" ? new THREE.Vector3(1.6, 1.7, -2.5) : spot === "ben" ? new THREE.Vector3(-1.4, 1.1, -0.9) : new THREE.Vector3(0.4, 1.1, -0.9);
  return { pos: new THREE.Vector3(target.x, target.y + 0.2, target.z + 3.4), look: new THREE.Vector3(target.x, target.y - 1.0, target.z) };
}

function floorboards(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = hex(THEME.floor);
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = hex(THEME.floorLine);
      ctx.lineWidth = 3;
      // long Altbau Dielen running towards the windows
      for (let i = 0; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo((i * s) / 6, 0);
        ctx.lineTo((i * s) / 6, s);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const y = (((i * 37) % 6) / 6) * s + s * 0.12;
        ctx.beginPath();
        ctx.moveTo((i * s) / 6, y);
        ctx.lineTo(((i + 1) * s) / 6, y);
        ctx.stroke();
      }
    },
    [3, 2],
  );
}

/** Berlin through the window: roofs, chimneys and the TV tower. */
function skyline(withTower: boolean): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const sky = ctx.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, "#9fc9e8");
    sky.addColorStop(1, "#e4f1f7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s, s);
    if (withTower) {
      ctx.fillStyle = "#c9ced6";
      ctx.fillRect(s * 0.62, s * 0.14, s * 0.035, s * 0.7);
      ctx.beginPath();
      ctx.arc(s * 0.637, s * 0.36, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d8584a";
      ctx.fillRect(s * 0.628, s * 0.06, s * 0.018, s * 0.1);
    }
    const roofs = ["#a85a48", "#8d4a3c", "#b86a52", "#9a5544"];
    for (let k = 0; k < 6; k++) {
      const x = (k / 6) * s - s * 0.04;
      const h = s * (0.28 + ((k * 7) % 5) * 0.035);
      ctx.fillStyle = "#e9dccb";
      ctx.fillRect(x, s - h, s / 6 + 2, h);
      ctx.fillStyle = roofs[k % roofs.length]!;
      ctx.beginPath();
      ctx.moveTo(x - 4, s - h);
      ctx.lineTo(x + s / 12, s - h - s * 0.09);
      ctx.lineTo(x + s / 6 + 6, s - h);
      ctx.fill();
      ctx.fillStyle = "#6d4a3c";
      ctx.fillRect(x + s * 0.11, s - h - s * 0.1, s * 0.02, s * 0.06);
    }
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

const WALL_W = 1024;
const WALL_H = 700;
const COLS: readonly WallNote["column"][] = ["todo", "doing", "done"];
const PER_COLUMN = 5;
const NOTE_W = 290;
const NOTE_H = 104;

interface Rect {
  x: number;
  y: number;
}

function layoutWall(notes: readonly WallNote[]): { pos: Map<string, Rect>; more: Record<WallNote["column"], number> } {
  const pos = new Map<string, Rect>();
  const more = { todo: 0, doing: 0, done: 0 };
  const colW = WALL_W / 3;
  COLS.forEach((c, ci) => {
    const inCol = notes.filter((n) => n.column === c);
    inCol.forEach((n, k) => {
      if (k >= PER_COLUMN) return;
      pos.set(n.id, { x: ci * colW + (colW - NOTE_W) / 2 + (k % 2 ? 6 : -6), y: 78 + k * (NOTE_H + 12) });
    });
    more[c] = Math.max(0, inCol.length - PER_COLUMN);
  });
  return { pos, more };
}

export function createBerlinScene(
  canvas: HTMLCanvasElement,
  options: { reducedMotion: boolean; ben: AvatarSpec; vince: AvatarSpec; onPick: (spot: BerlinSpot) => void; onHover?: (spot: BerlinSpot | null) => void },
): BerlinScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  const reduced = options.reducedMotion;

  scene.add(new THREE.HemisphereLight(0xfffaf2, 0xd2c0a8, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(-4, 6, 4);
  scene.add(sun);

  const room = new THREE.Group();
  scene.add(room);

  // ---------- shell: Dielen, a high back wall with two tall windows, a side wall, stucco along the top ----------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 5.4), toon(0xffffff, { map: floorboards() }));
  floor.position.set(0, -0.06, 0);
  room.add(floor);
  const back = mesh(new THREE.BoxGeometry(7, 3.6, 0.12), THEME.wall);
  back.position.set(0, 1.8, -2.76);
  room.add(back);
  const side = mesh(new THREE.BoxGeometry(0.12, 3.6, 5.4), THEME.sideWall);
  side.position.set(-3.56, 1.8, 0);
  room.add(side);
  for (const [geo, x, z] of [
    [new THREE.BoxGeometry(7, 0.16, 0.16), 0, -2.66],
    [new THREE.BoxGeometry(0.16, 0.16, 5.4), -3.46, 0],
  ] as const) {
    const stucco = mesh(geo, THEME.stucco, 1.04);
    stucco.position.set(x, 3.52, z);
    room.add(stucco);
  }
  const skirting = mesh(new THREE.BoxGeometry(7, 0.14, 0.04), THEME.stucco);
  skirting.position.set(0, 0.07, -2.69);
  room.add(skirting);
  for (const [x, tower] of [[-2.25, false], [-0.45, true]] as const) {
    const win = new THREE.Group();
    const frame = mesh(new THREE.BoxGeometry(1.15, 2.25, 0.08), THEME.stucco, 1.03);
    win.add(frame);
    const view = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.08), new THREE.MeshBasicMaterial({ map: skyline(tower) }));
    view.position.z = 0.045;
    win.add(view);
    const cross = mesh(new THREE.BoxGeometry(0.05, 2.08, 0.04), THEME.stucco);
    cross.position.z = 0.06;
    win.add(cross);
    const transom = mesh(new THREE.BoxGeometry(0.98, 0.05, 0.04), THEME.stucco);
    transom.position.set(0, 0.45, 0.06);
    win.add(transom);
    win.position.set(x, 1.85, -2.7);
    room.add(win);
  }
  const plant = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 16), 0xe8d6c0, 1.06);
  pot.position.y = 0.2;
  plant.add(pot);
  for (let k = 0; k < 6; k++) {
    const leaf = mesh(new THREE.SphereGeometry(0.19, 12, 8), k % 2 ? PALETTE.leaf : PALETTE.leafDark, 1.05);
    const a = (k / 6) * Math.PI * 2;
    leaf.scale.set(1, 0.45, 0.6);
    leaf.position.set(Math.cos(a) * 0.18, 0.6 + (k % 3) * 0.13, Math.sin(a) * 0.18);
    leaf.rotation.set(0, -a, 0.5);
    plant.add(leaf);
  }
  plant.position.set(-3.05, 0, -2.25);
  room.add(plant);

  // ---------- two desks with Ben and Vince, each with a note for the ticket in hand ----------
  const deskNotes: Record<"ben" | "vince", { ctx: CanvasRenderingContext2D | null; tex: THREE.CanvasTexture }> = {} as never;
  const people: Record<"ben" | "vince", THREE.Group> = {} as never;
  const rigs: Array<ReturnType<typeof buildAvatar>> = [];
  for (const [who, x, spec, chairColor] of [
    ["ben", -1.45, options.ben, 0x8f86b8],
    ["vince", 0.4, options.vince, 0xb8956a],
  ] as const) {
    const g = new THREE.Group();
    const top = mesh(new THREE.BoxGeometry(1.5, 0.07, 0.75), THEME.desk, 1.03);
    top.position.y = 0.76;
    g.add(top);
    const front = mesh(new THREE.BoxGeometry(1.5, 0.62, 0.04), THEME.desk, 1.03);
    front.position.set(0, 0.43, 0.36);
    g.add(front);
    for (const lx of [-0.71, 0.71]) {
      const leg = mesh(new THREE.BoxGeometry(0.05, 0.74, 0.7), PALETTE.woodDark);
      leg.position.set(lx, 0.37, 0);
      g.add(leg);
    }
    // the monitor stands to the side and faces its person, so the face stays visible from the room
    const screenStand = new THREE.Group();
    const monitor = mesh(new THREE.BoxGeometry(0.56, 0.36, 0.04), 0x2b2f38, 1.04);
    monitor.position.y = 0.3;
    screenStand.add(monitor);
    const neck = mesh(new THREE.BoxGeometry(0.05, 0.14, 0.04), 0x2b2f38);
    neck.position.y = 0.07;
    screenStand.add(neck);
    screenStand.position.set(who === "ben" ? 0.48 : -0.48, 0.8, -0.05);
    screenStand.rotation.y = Math.PI + (who === "ben" ? 0.55 : -0.55);
    g.add(screenStand);
    const mug = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 12), who === "ben" ? PALETTE.coral : 0x3d63b8, 1.08);
    mug.position.set(who === "ben" ? -0.5 : 0.5, 0.85, 0.15);
    g.add(mug);
    const chair = new THREE.Group();
    const seat = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.48), chairColor, 1.05);
    seat.position.y = 0.47;
    chair.add(seat);
    const rest = mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), chairColor, 1.05);
    rest.position.set(0, 0.78, -0.24);
    chair.add(rest);
    chair.position.set(0, 0, -0.75);
    g.add(chair);
    // the person sits behind the desk, facing the room: the desk hides the legs
    const rig = buildAvatar({ ...spec, prop: "none" });
    rig.root.scale.multiplyScalar(1.7 / Math.max(0.5, spec.height));
    rig.root.position.set(0, -0.14, -0.62);
    g.add(rig.root);
    rigs.push(rig);
    // a paper note pinned to the desk front: the ticket this person is on
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: tex }));
    note.position.set(0, 0.48, 0.385);
    note.rotation.z = who === "ben" ? -0.03 : 0.03;
    g.add(note);
    deskNotes[who] = { ctx: c.getContext("2d"), tex };
    g.position.set(x, 0, -0.9);
    room.add(g);
    people[who] = g;
  }

  // ---------- the ticket wall ----------
  const wall = new THREE.Group();
  const cork = mesh(new THREE.BoxGeometry(2.3, 1.62, 0.06), 0xc79a63, 1.02);
  wall.add(cork);
  const wallCanvas = document.createElement("canvas");
  wallCanvas.width = WALL_W;
  wallCanvas.height = WALL_H;
  const wallCtx = wallCanvas.getContext("2d");
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.48), new THREE.MeshBasicMaterial({ map: wallTex }));
  face.position.z = 0.032;
  wall.add(face);
  wall.position.set(2.15, 1.75, -2.67);
  room.add(wall);

  let wallNotes: readonly WallNote[] = [];
  let wallLabels: Parameters<BerlinScene["setWall"]>[1] = { columns: { todo: "", doing: "", done: "" }, more: (n) => `+${n}` };
  let wallLayout = layoutWall([]);
  // notes in flight: from where they hung to where they hang now
  const flights = new Map<string, { from: Rect; start: number }>();
  const FLIGHT_MS = 700;
  let pulse = 0;

  const drawWall = (now: number) => {
    if (!wallCtx) return;
    const ctx = wallCtx;
    ctx.fillStyle = "#c79a63";
    ctx.fillRect(0, 0, WALL_W, WALL_H);
    const colW = WALL_W / 3;
    ctx.strokeStyle = "rgba(90, 60, 30, 0.35)";
    ctx.lineWidth = 3;
    for (let k = 1; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(k * colW, 20);
      ctx.lineTo(k * colW, WALL_H - 20);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    COLS.forEach((c, ci) => {
      ctx.fillStyle = "#fbfcfd";
      ctx.beginPath();
      ctx.roundRect(ci * colW + 30, 16, colW - 60, 46, 10);
      ctx.fill();
      ctx.fillStyle = "#1f242b";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(wallLabels.columns[c], ci * colW + colW / 2, 40);
      if (wallLayout.more[c] > 0) {
        ctx.fillStyle = "#fbfcfd";
        ctx.font = "bold 26px sans-serif";
        ctx.fillText(wallLabels.more(wallLayout.more[c]), ci * colW + colW / 2, WALL_H - 26);
      }
    });
    for (const n of wallNotes) {
      const at = wallLayout.pos.get(n.id);
      if (!at) continue;
      let x = at.x;
      let y = at.y;
      const fl = flights.get(n.id);
      if (fl) {
        const k = Math.min(1, (now - fl.start) / FLIGHT_MS);
        const e = 1 - Math.pow(1 - k, 3);
        x = fl.from.x + (at.x - fl.from.x) * e;
        y = fl.from.y + (at.y - fl.from.y) * e - Math.sin(Math.PI * k) * 60;
        if (k >= 1) flights.delete(n.id);
      }
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = THEME[n.assignee];
      ctx.fillRect(x, y, NOTE_W, NOTE_H);
      ctx.restore();
      ctx.fillStyle = "#c8584a";
      ctx.beginPath();
      ctx.arc(x + NOTE_W / 2, y + 8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f242b";
      ctx.font = "600 23px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      wrap(ctx, n.title, NOTE_W - (n.question ? 64 : 28), 3).forEach((line, i) => ctx.fillText(line, x + 14, y + 20 + i * 27));
      if (n.question) {
        const r = 20 + (reduced ? 0 : Math.sin(pulse) * 3);
        ctx.fillStyle = THEME.question;
        ctx.beginPath();
        ctx.arc(x + NOTE_W - 30, y + 34, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + NOTE_W - 30, y + 35);
      }
    }
    wallTex.needsUpdate = true;
  };

  const drawDesk = (who: "ben" | "vince", title: string | null, idle: string) => {
    const d = deskNotes[who];
    if (!d.ctx) return;
    const ctx = d.ctx;
    ctx.fillStyle = title ? (who === "ben" ? THEME.ben : THEME.vince) : "#f4f1ea";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#c8584a";
    ctx.beginPath();
    ctx.arc(256, 16, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = title ? "#1f242b" : "#626a77";
    ctx.font = title ? "600 38px sans-serif" : "italic 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const lines = wrap(ctx, title ?? idle, 460, 3);
    const top = 128 - (lines.length * 46) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 256, top + i * 46));
    d.tex.needsUpdate = true;
  };

  // ---------- picking, halos ----------
  const spots: Record<BerlinSpot, THREE.Object3D> = { board: wall, ben: people.ben, vince: people.vince };
  const haloAt: Record<BerlinSpot, THREE.Vector3> = { board: new THREE.Vector3(2.15, 2.78, -2.6), ben: new THREE.Vector3(-1.45, 2.15, -1.2), vince: new THREE.Vector3(0.4, 2.15, -1.2) };
  const glow = {} as Record<BerlinSpot, THREE.Mesh>;
  for (const s of BERLIN_SPOTS) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0.85, depthTest: false }));
    halo.renderOrder = 10;
    halo.position.copy(haloAt[s]);
    room.add(halo);
    glow[s] = halo;
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: BerlinSpot | null = null;
  const spotOf = (o: THREE.Object3D | null): BerlinSpot | null => {
    for (let x = o; x; x = x.parent) for (const s of BERLIN_SPOTS) if (spots[s] === x) return s;
    return null;
  };
  const hit = (e: PointerEvent): BerlinSpot | null => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return spotOf(raycaster.intersectObjects(BERLIN_SPOTS.map((s) => spots[s]), true)[0]?.object ?? null);
  };
  const onMove = (e: PointerEvent) => {
    const s = hit(e);
    if (s === hovered) return;
    hovered = s;
    canvas.style.cursor = s ? "pointer" : "";
    canvas.dataset.hover = s ?? "";
    options.onHover?.(s);
  };
  const onClick = (e: PointerEvent) => {
    const s = hit(e);
    if (s) options.onPick(s);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("click", onClick as EventListener);

  // ---------- camera and loop ----------
  const camPos = POSES.room.pos.clone();
  const camLook = POSES.room.look.clone();
  let current: BerlinSpot | null = null;
  let goal: Pose = POSES.room;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const size = { w: 1, h: 1 };
  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 58 : 42;
    camera.updateProjectionMatrix();
    goal = poseFor(current, w / h);
  };
  resize();

  let raf = 0;
  let t0 = performance.now();
  const tmp = new THREE.Vector3();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 4);
    camPos.lerp(goal.pos, k);
    camLook.lerp(goal.look, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const time = now / 1000;
    for (const s of BERLIN_SPOTS) {
      const h = glow[s];
      h.quaternion.copy(camera.quaternion);
      h.visible = current === null;
      const base = s === hovered ? 1.35 : 1;
      h.scale.setScalar(reduced ? base : base * (1 + Math.sin(time * 2.4 + BERLIN_SPOTS.indexOf(s)) * 0.08));
    }
    if (!reduced) {
      rigs.forEach((r, i) => {
        r.body.position.y = Math.sin(time * 1.8 + i) * 0.01;
        r.head.rotation.y = Math.sin(time * 0.5 + i * 2) * 0.2;
      });
    }
    // the wall redraws while a note flies or a question pulses
    const questions = wallNotes.some((n) => n.question);
    if (flights.size > 0 || (questions && !reduced)) {
      pulse = time * 3;
      drawWall(now);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  canvas.dataset.ready = "true";

  return {
    focus(spot) {
      current = spot;
      goal = poseFor(spot, size.w / size.h);
      canvas.dataset.spot = spot ?? "room";
    },
    setWall(notes, labels) {
      const before = wallLayout;
      const prevColumn = new Map(wallNotes.map((n) => [n.id, n.column]));
      wallNotes = notes;
      wallLabels = labels;
      wallLayout = layoutWall(notes);
      const start = performance.now();
      if (!reduced) {
        for (const n of notes) {
          const was = prevColumn.get(n.id);
          const from = before.pos.get(n.id);
          if (was && was !== n.column && from) flights.set(n.id, { from, start });
        }
      }
      canvas.dataset.notes = String(notes.length);
      canvas.dataset.questions = String(notes.filter((n) => n.question).length);
      drawWall(start);
    },
    setDesk(person, title, idle) {
      drawDesk(person, title, idle);
      canvas.dataset[`desk${person === "ben" ? "Ben" : "Vince"}`] = title ?? "";
    },
    anchors() {
      const out = {} as Record<BerlinSpot, { x: number; y: number } | null>;
      for (const s of BERLIN_SPOTS) {
        tmp.copy(glow[s].position).project(camera);
        out[s] = current !== null || tmp.z > 1 ? null : { x: ((tmp.x + 1) / 2) * size.w, y: ((1 - tmp.y) / 2) * size.h };
      }
      return out;
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick as EventListener);
      disposeGeometry(scene);
      wallTex.dispose();
      deskNotes.ben.tex.dispose();
      deskNotes.vince.tex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

