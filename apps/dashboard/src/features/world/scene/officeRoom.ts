/**
 * Ana's office as a small 3D room (same comic kit as the world): a cut-away diorama with a desk, a lamp, a computer and
 * a topic board on the wall. The things you can use glow softly and react to the pointer; a click calls onPick. The
 * board shows the topic matrix as dots in the colours of their quadrant, so the data is visible before anything opens.
 *
 * ROOM_THEME holds the colours of the room: Ana is meant to style her office later (a later step, not built yet).
 * Until then the room wears her brand (../brand.ts): cream walls, olive lines and textiles, gold only as the rare accent
 * (pins, the mug, the markers of what you can use), and her original banner in an olive frame above the desk.
 */
import * as THREE from "three";
import type { AvatarSpec } from "../people";
import { ROOM_SPOTS, type BoardDot, type OfficeQuadrant, type RoomSpot } from "../office";
import { ANA_BANNER, ANA_BRAND } from "../brand";
import { buildAvatar } from "./avatar";
import { canvasTexture, disposeGeometry, hex, inked, mesh, PALETTE, toon } from "./kit";

export type { BoardDot, RoomSpot };

export const ROOM_THEME = {
  wall: ANA_BRAND.cream,
  // one step darker than cream, so the corner still reads in the flat light
  sideWall: 0xe4dfc4,
  // light oak: warm under cream and olive, without the orange that fought the brand colours
  floor: 0xcdb08a,
  floorLine: 0xa98c64,
  rug: ANA_BRAND.olive,
  rugInner: ANA_BRAND.cream,
  desk: PALETTE.wood,
  accent: ANA_BRAND.olive,
  line: ANA_BRAND.olive,
  trim: ANA_BRAND.cream,
  highlight: ANA_BRAND.gold,
} as const;

const QUADRANT_FILL: Record<OfficeQuadrant, string> = { starter: "#dcefe3", test: "#f6e8cf", niche: "#e2e1f1", skip: "#eceef1" };
const QUADRANT_DOT: Record<OfficeQuadrant, string> = { starter: "#2f7d55", test: "#9a5a12", niche: "#4a4670", skip: "#626a77" };

export interface RoomScene {
  /** moves the camera to a spot (null = the whole room) */
  focus(spot: RoomSpot | null): void;
  setLamp(on: boolean): void;
  setBoard(dots: readonly BoardDot[]): void;
  /** screen position (CSS px inside the canvas) of each spot, for the HTML labels; null when behind the camera */
  anchors(): Record<RoomSpot, { x: number; y: number } | null>;
  resize(): void;
  dispose(): void;
}

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const POSES: Record<RoomSpot | "room", Pose> = {
  room: { pos: new THREE.Vector3(4.6, 3.5, 5.6), look: new THREE.Vector3(-0.2, 1.1, -0.9) },
  // the board sits in the left half: the drawer with the topics covers the right one
  board: { pos: new THREE.Vector3(2.2, 1.8, 1.5), look: new THREE.Vector3(2.15, 1.7, -2.5) },
  computer: { pos: new THREE.Vector3(-0.35, 1.5, 0.2), look: new THREE.Vector3(-0.3, 1.0, -2.2) },
  lamp: { pos: new THREE.Vector3(0.6, 1.9, 0.6), look: new THREE.Vector3(-0.5, 1.0, -2.0) },
};

/** On a tall screen the camera steps back, and for a spot the thing sits in the upper part (the sheet covers the rest). */
function poseFor(spot: RoomSpot | null, aspect: number): Pose {
  const base = POSES[spot ?? "room"];
  if (aspect >= 0.9) return base;
  if (!spot) return { pos: base.look.clone().add(base.pos.clone().sub(base.look).multiplyScalar(1.3)), look: base.look.clone().add(new THREE.Vector3(-0.45, -0.3, 0)) };
  const target = spot === "board" ? new THREE.Vector3(0.9, 1.7, -2.5) : spot === "computer" ? new THREE.Vector3(-1.4, 1.05, -2.2) : new THREE.Vector3(-0.5, 1.0, -2.0);
  // look below the thing, so it lands in the top quarter of the screen
  return { pos: new THREE.Vector3(target.x, target.y + 0.2, target.z + 3.2), look: new THREE.Vector3(target.x, target.y - 1.0, target.z) };
}

function planks(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = hex(ROOM_THEME.floor);
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = hex(ROOM_THEME.floorLine);
      ctx.lineWidth = 3;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (i * s) / 8);
        ctx.lineTo(s, (i * s) / 8);
        ctx.stroke();
        // staggered board joints
        const x = ((i % 2) * 0.5 + 0.25) * s;
        ctx.beginPath();
        ctx.moveTo(x, (i * s) / 8);
        ctx.lineTo(x, ((i + 1) * s) / 8);
        ctx.stroke();
      }
    },
    [3, 3],
  );
}

function windowView(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const sky = ctx.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, "#9fd3ef");
    sky.addColorStop(0.62, "#d8f0f7");
    sky.addColorStop(0.63, "#5fb7d3");
    sky.addColorStop(1, "#3e95b8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#ffd66b";
    ctx.beginPath();
    ctx.arc(s * 0.72, s * 0.3, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // a palm on the left: Ana works from wherever she travels
    ctx.strokeStyle = "#6e4a2c";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s);
    ctx.quadraticCurveTo(s * 0.26, s * 0.6, s * 0.18, s * 0.34);
    ctx.stroke();
    ctx.fillStyle = "#3f9356";
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(s * 0.18, s * 0.34, s * 0.16, s * 0.04, (k * Math.PI) / 3 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function screenTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    // the media kit on the screen (ANA-59): warm paper, a title line, three numbers, two Reel covers
    ctx.fillStyle = "#fbf8f3";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#1d2226";
    ctx.fillRect(s * 0.08, s * 0.14, s * 0.4, s * 0.07);
    ctx.fillStyle = "#85592a";
    ctx.fillRect(s * 0.08, s * 0.07, s * 0.18, s * 0.025);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = "#1d2226";
      ctx.fillRect(s * (0.08 + k * 0.15), s * 0.32, s * 0.11, s * 0.06);
      ctx.fillStyle = "#9aa1a6";
      ctx.fillRect(s * (0.08 + k * 0.15), s * 0.41, s * 0.11, s * 0.02);
    }
    ctx.fillStyle = "#2c6e8a";
    for (const [x, y, r] of [[0.14, 0.7, 0.03], [0.24, 0.66, 0.022], [0.36, 0.74, 0.04], [0.3, 0.8, 0.018]] as const) {
      ctx.beginPath();
      ctx.arc(s * x, s * y, s * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#d8bb8f";
    ctx.beginPath();
    ctx.roundRect(s * 0.58, s * 0.1, s * 0.16, s * 0.42, 10);
    ctx.fill();
    ctx.fillStyle = "#cfe1e8";
    ctx.beginPath();
    ctx.roundRect(s * 0.77, s * 0.18, s * 0.16, s * 0.42, 10);
    ctx.fill();
  });
}

/** The board face: four quadrants and one dot per topic, numbered like the list. */
function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, dots: readonly BoardDot[]) {
  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(0, 0, w, h);
  const pad = 26;
  const mw = (w - pad * 2) / 2;
  const mh = (h - pad * 2) / 2;
  const cells: Array<[OfficeQuadrant, number, number]> = [
    ["niche", pad, pad],
    ["starter", pad + mw, pad],
    ["skip", pad, pad + mh],
    ["test", pad + mw, pad + mh],
  ];
  for (const [q, x, y] of cells) {
    ctx.fillStyle = QUADRANT_FILL[q];
    ctx.fillRect(x, y, mw, mh);
  }
  ctx.strokeStyle = "#1f242b";
  ctx.lineWidth = 3;
  ctx.strokeRect(pad, pad, mw * 2, mh * 2);
  ctx.beginPath();
  ctx.moveTo(pad + mw, pad);
  ctx.lineTo(pad + mw, pad + mh * 2);
  ctx.moveTo(pad, pad + mh);
  ctx.lineTo(pad + mw * 2, pad + mh);
  ctx.stroke();
  // a star on the starter corner: where the good topics land
  ctx.fillStyle = "#ffd66b";
  ctx.font = "bold 46px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("★", pad + mw * 2 - 10, pad + 6);
  for (const d of dots) {
    const cell = cells.find((c) => c[0] === d.quadrant) as [OfficeQuadrant, number, number];
    const r = 28;
    const cx = cell[1] + r + 6 + d.x * (mw - 2 * r - 12);
    const cy = cell[2] + mh - r - 6 - d.y * (mh - 2 * r - 12);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = d.tested ? QUADRANT_DOT[d.quadrant] : "#fbfcfd";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = QUADRANT_DOT[d.quadrant];
    ctx.stroke();
    ctx.fillStyle = d.tested ? "#ffffff" : QUADRANT_DOT[d.quadrant];
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(d.n), cx, cy + 1);
  }
}

export function createRoomScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean; ana: AvatarSpec; onPick: (spot: RoomSpot) => void; onHover?: (spot: RoomSpot | null) => void }): RoomScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  const reduced = options.reducedMotion;

  scene.add(new THREE.HemisphereLight(0xfffaf2, 0xd9c3a8, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
  sun.position.set(-6, 6, 2);
  scene.add(sun);

  const room = new THREE.Group();
  scene.add(room);

  // ---------- shell: floor, back wall, side wall with a window ----------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 5), toon(0xffffff, { map: planks() }));
  floor.position.set(0, -0.06, 0);
  room.add(floor);
  const back = mesh(new THREE.BoxGeometry(6, 3.2, 0.12), ROOM_THEME.wall);
  back.position.set(0, 1.6, -2.56);
  room.add(back);
  const side = mesh(new THREE.BoxGeometry(0.12, 3.2, 5), ROOM_THEME.sideWall);
  side.position.set(-3.06, 1.6, 0);
  room.add(side);
  const skirting = mesh(new THREE.BoxGeometry(6, 0.12, 0.04), ROOM_THEME.line);
  skirting.position.set(0, 0.06, -2.49);
  room.add(skirting);
  const win = new THREE.Group();
  const winFrame = mesh(new THREE.BoxGeometry(0.08, 1.15, 1.55), ROOM_THEME.trim, 1.03);
  win.add(winFrame);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.95), new THREE.MeshBasicMaterial({ map: windowView() }));
  view.rotation.y = Math.PI / 2;
  view.position.x = 0.05;
  win.add(view);
  const bar = mesh(new THREE.BoxGeometry(0.06, 0.05, 1.4), ROOM_THEME.trim);
  bar.position.x = 0.06;
  win.add(bar);
  win.position.set(-2.98, 1.7, -0.4);
  room.add(win);

  // ---------- rug, plant, shelf ----------
  const rug = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.02, 40), ROOM_THEME.rug);
  rug.scale.set(1.25, 1, 0.8);
  rug.position.set(0.5, 0.01, 0.3);
  room.add(rug);
  const rugIn = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.022, 40), ROOM_THEME.rugInner);
  rugIn.scale.set(1.25, 1, 0.8);
  rugIn.position.set(0.5, 0.012, 0.3);
  room.add(rugIn);
  const plant = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 16), ROOM_THEME.trim, 1.06);
  pot.position.y = 0.21;
  plant.add(pot);
  for (let k = 0; k < 7; k++) {
    const leaf = mesh(new THREE.SphereGeometry(0.2, 12, 8), k % 2 ? PALETTE.leaf : PALETTE.leafDark, 1.05);
    const a = (k / 7) * Math.PI * 2;
    leaf.scale.set(1, 0.45, 0.6);
    leaf.position.set(Math.cos(a) * 0.2, 0.62 + (k % 3) * 0.14, Math.sin(a) * 0.2);
    leaf.rotation.set(0, -a, 0.5);
    plant.add(leaf);
  }
  plant.position.set(2.45, 0, -2.0);
  room.add(plant);
  const shelf = new THREE.Group();
  const board = mesh(new THREE.BoxGeometry(0.28, 0.05, 1.2), ROOM_THEME.desk, 1.05);
  shelf.add(board);
  const bookColors = [ANA_BRAND.olive, ROOM_THEME.trim, ANA_BRAND.logoOlive, ROOM_THEME.highlight, ANA_BRAND.olive];
  bookColors.forEach((c, k) => {
    const b = mesh(new THREE.BoxGeometry(0.18, 0.26 + (k % 2) * 0.05, 0.07), c, 1.06);
    b.position.set(0, 0.16, -0.45 + k * 0.09);
    shelf.add(b);
  });
  const frameShell = mesh(new THREE.BoxGeometry(0.06, 0.26, 0.2), ROOM_THEME.accent, 1.06);
  frameShell.position.set(0, 0.16, 0.35);
  shelf.add(frameShell);
  shelf.position.set(-2.86, 2.35, -1.6);
  room.add(shelf);

  // ---------- desk, chair, computer, lamp ----------
  const desk = new THREE.Group();
  const top = mesh(new THREE.BoxGeometry(1.7, 0.07, 0.8), ROOM_THEME.desk, 1.03);
  top.position.y = 0.76;
  desk.add(top);
  for (const [x, z] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]] as const) {
    const leg = mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), PALETTE.woodDark);
    leg.position.set(x, 0.37, z);
    desk.add(leg);
  }
  desk.position.set(-1.25, 0, -2.0);
  room.add(desk);
  const chair = new THREE.Group();
  const seat = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.48), ROOM_THEME.accent, 1.05);
  seat.position.y = 0.47;
  chair.add(seat);
  const rest = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), ROOM_THEME.accent, 1.05);
  rest.position.set(0, 0.76, 0.22);
  chair.add(rest);
  const stem = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), PALETTE.chrome);
  stem.position.y = 0.23;
  chair.add(stem);
  const foot = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 16), PALETTE.chrome);
  foot.position.y = 0.02;
  chair.add(foot);
  chair.position.set(-1.25, 0, -1.25);
  chair.rotation.y = 0.25;
  room.add(chair);

  const computer = new THREE.Group();
  const monitor = mesh(new THREE.BoxGeometry(0.78, 0.5, 0.05), 0x2b2f38, 1.04);
  monitor.position.y = 0.32;
  computer.add(monitor);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), new THREE.MeshBasicMaterial({ map: screenTexture() }));
  screen.position.set(0, 0.32, 0.027);
  computer.add(screen);
  const neck = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.05), 0x2b2f38);
  neck.position.y = 0.04;
  computer.add(neck);
  const keys = mesh(new THREE.BoxGeometry(0.5, 0.025, 0.16), 0xe9ecf1, 1.06);
  keys.position.set(0, -0.01, 0.3);
  computer.add(keys);
  const mug = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 12), ROOM_THEME.highlight, 1.08);
  mug.position.set(0.48, 0.04, 0.22);
  computer.add(mug);
  computer.position.set(-1.4, 0.8, -2.15);
  room.add(computer);

  // ---------- Ana's banner above the desk: the original image, unchanged, in a thin olive frame ----------
  const bannerW = 1.9;
  const bannerH = bannerW * (ANA_BANNER.height / ANA_BANNER.width);
  const banner = new THREE.Group();
  banner.add(mesh(new THREE.BoxGeometry(bannerW + 0.06, bannerH + 0.06, 0.03), ROOM_THEME.line, 1.02));
  const bannerMat = new THREE.MeshBasicMaterial({ color: ROOM_THEME.trim });
  const bannerFace = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerH), bannerMat);
  bannerFace.position.z = 0.017;
  banner.add(bannerFace);
  let bannerTex: THREE.Texture | null = null;
  let disposed = false;
  new THREE.TextureLoader().load(
    ANA_BANNER.src,
    (tex) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      bannerTex = tex;
      // white, so the image keeps its own colours (a basic material is not shaded by the room light)
      bannerMat.color.setHex(0xffffff);
      bannerMat.map = tex;
      bannerMat.needsUpdate = true;
      canvas.dataset.banner = "loaded";
    },
    undefined,
    () => {
      // without the image the frame stays cream: nothing breaks, the wall just has an empty frame
      canvas.dataset.banner = "missing";
    },
  );
  banner.position.set(-1.3, 2.47, -2.485);
  room.add(banner);

  const lamp = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.04, 16), PALETTE.ink);
  lamp.add(base);
  const arm1 = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), PALETTE.ink);
  arm1.position.set(0.05, 0.22, 0);
  arm1.rotation.z = -0.25;
  lamp.add(arm1);
  const arm2 = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6), PALETTE.ink);
  arm2.position.set(-0.04, 0.5, 0);
  arm2.rotation.z = 1.0;
  lamp.add(arm2);
  const shadeMat = toon(PALETTE.glow, { emissive: PALETTE.glow, unique: true });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.18, 16, 1, true), shadeMat);
  inked(shade, 1.08);
  shade.position.set(-0.2, 0.53, 0);
  shade.rotation.z = 0.7;
  lamp.add(shade);
  const bulb = new THREE.PointLight(0xffd59a, 3.2, 3.2, 1.6);
  bulb.position.set(-0.24, 0.42, 0.05);
  lamp.add(bulb);
  lamp.position.set(-0.5, 0.8, -2.1);
  room.add(lamp);

  // ---------- the topic board ----------
  const boardGroup = new THREE.Group();
  // the board's frame draws the olive line of the brand; the four fields inside keep the colours of their quadrant
  const cork = mesh(new THREE.BoxGeometry(2.0, 1.32, 0.06), ROOM_THEME.line, 1.02);
  boardGroup.add(cork);
  const bw = 1024;
  const bh = 672;
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = bw;
  boardCanvas.height = bh;
  const boardCtx = boardCanvas.getContext("2d");
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.22), new THREE.MeshBasicMaterial({ map: boardTex }));
  face.position.z = 0.032;
  boardGroup.add(face);
  for (const [x, y] of [[-0.86, 0.55], [0.86, 0.55]] as const) {
    const pin = mesh(new THREE.SphereGeometry(0.035, 10, 8), ROOM_THEME.highlight, 1.1);
    pin.position.set(x, y, 0.05);
    boardGroup.add(pin);
  }
  boardGroup.position.set(0.9, 1.72, -2.47);
  room.add(boardGroup);

  // ---------- Ana ----------
  const ana = buildAvatar({ ...options.ana, prop: "none" });
  ana.root.scale.multiplyScalar(1.85 / Math.max(0.5, options.ana.height));
  // by the window, turned to whoever comes in (never between the camera and the board or the desk)
  ana.root.position.set(-2.1, 0, 0.9);
  ana.root.rotation.y = 0.85;
  room.add(ana.root);

  // ---------- picking and hover ----------
  const spots: Record<RoomSpot, THREE.Object3D> = { board: boardGroup, computer, lamp };
  const glow: Record<RoomSpot, THREE.Mesh> = {} as Record<RoomSpot, THREE.Mesh>;
  // a soft halo marks what can be used; it pulses gently (still under reduced motion)
  for (const s of ROOM_SPOTS) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: ROOM_THEME.highlight, transparent: true, opacity: 0.9, depthTest: false }));
    halo.renderOrder = 10;
    halo.position.copy(s === "board" ? new THREE.Vector3(0.9, 2.55, -2.4) : s === "computer" ? new THREE.Vector3(-1.5, 1.72, -2.1) : new THREE.Vector3(-0.42, 1.55, -2.0));
    room.add(halo);
    glow[s] = halo;
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: RoomSpot | null = null;
  const spotOf = (o: THREE.Object3D | null): RoomSpot | null => {
    for (let x = o; x; x = x.parent) for (const s of ROOM_SPOTS) if (spots[s] === x) return s;
    return null;
  };
  const hit = (e: PointerEvent): RoomSpot | null => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(ROOM_SPOTS.map((s) => spots[s]), true);
    return spotOf(hits[0]?.object ?? null);
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

  // ---------- camera ----------
  const camPos = POSES.room.pos.clone();
  const camLook = POSES.room.look.clone();
  let current: RoomSpot | null = null;
  let goal: Pose = POSES.room;
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  let lampOn = true;
  const setLamp = (on: boolean) => {
    lampOn = on;
    bulb.intensity = on ? 3.2 : 0;
    shadeMat.emissiveIntensity = on ? 0.9 : 0;
    canvas.dataset.lamp = on ? "on" : "off";
  };
  setLamp(true);

  const size = { w: 1, h: 1 };
  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrow screens: step back so the whole room stays in view
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
    for (const s of ROOM_SPOTS) {
      const h = glow[s];
      h.quaternion.copy(camera.quaternion);
      // the markers show what can be used; close up they step aside
      h.visible = current === null;
      const base = s === hovered ? 1.35 : 1;
      h.scale.setScalar(reduced ? base : base * (1 + Math.sin(time * 2.4 + ROOM_SPOTS.indexOf(s)) * 0.08));
    }
    if (!reduced) {
      // Ana breathes and looks around a little
      ana.body.position.y = Math.sin(time * 1.8) * 0.01;
      ana.head.rotation.y = Math.sin(time * 0.6) * 0.25;
      if (lampOn) bulb.intensity = 3.2 + Math.sin(time * 9) * 0.05;
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
    setLamp,
    setBoard(dots) {
      if (!boardCtx) return;
      drawBoard(boardCtx, bw, bh, dots);
      boardTex.needsUpdate = true;
    },
    anchors() {
      const out = {} as Record<RoomSpot, { x: number; y: number } | null>;
      for (const s of ROOM_SPOTS) {
        tmp.copy(glow[s].position).project(camera);
        out[s] = current !== null || tmp.z > 1 ? null : { x: ((tmp.x + 1) / 2) * size.w, y: ((1 - tmp.y) / 2) * size.h };
      }
      return out;
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      disposed = true;
      bannerTex?.dispose();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick as EventListener);
      disposeGeometry(scene);
      boardTex.dispose();
      renderer.dispose();
      // three keeps cached materials (shared with the world) pointing at this renderer: release the GL context itself,
      // or every visit to the office would hold one more until the browser drops the world's
      renderer.forceContextLoss();
    },
  };
}
