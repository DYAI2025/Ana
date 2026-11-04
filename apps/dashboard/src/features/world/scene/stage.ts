/**
 * Static parts of the stage: the hex-tile globe, clouds, the Berlin office with its project stations and Ana's
 * tropical spot. Everything is decoration around the data; nothing here encodes a number.
 */
import * as THREE from "three";
import type { Geo } from "../geo";
import { isLand } from "../geo";
import type { ProjectShape } from "../people";
import { basic, inked, ll, mesh, PALETTE, R, rnd, siteFrame, toon } from "./kit";

export function buildGlobe(geo: Geo): THREE.Group {
  const g = new THREE.Group();
  const ocean = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 54), toon(PALETTE.sea));
  ocean.name = "ocean";
  g.add(ocean);
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.016, 64, 48), new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide }));
  rim.raycast = () => {};
  g.add(rim);

  const N = 11000;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const tiles: Array<{ v: THREE.Vector3; lat: number; lon: number; i: number }> = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    const v = new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
    const lat = (Math.asin(v.y) * 180) / Math.PI;
    let lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180;
    if (lon < -180) lon += 360;
    if (isLand(geo.land, geo.width, geo.height, lat, lon)) tiles.push({ v, lat, lon, i });
  }
  const geom = new THREE.CylinderGeometry(0.175, 0.19, 1, 6);
  const land = new THREE.InstancedMesh(geom, toon(0xffffff), tiles.length);
  land.name = "land";
  const up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  tiles.forEach((tile, k) => {
    const a = Math.abs(tile.lat);
    const h = 0.12 + rnd(tile.i) * 0.07;
    // colour by climate band only (decoration, no data): tropics greener, high latitudes pale, poles ice
    const pick = (arr: readonly number[]) => arr[Math.floor(rnd(tile.i + 3) * arr.length)] ?? arr[0] ?? 0xffffff;
    if (a > 64) c.set(PALETTE.ice);
    else if (a > 55) c.set(pick(PALETTE.tundra));
    else if (a < 18) c.set(pick(PALETTE.tropic));
    else c.set(pick(PALETTE.land));
    q.setFromUnitVectors(up, tile.v);
    s.set(1, h, 1);
    m4.compose(tile.v.clone().multiplyScalar(R + h / 2 - 0.04), q, s);
    land.setMatrixAt(k, m4);
    land.setColorAt(k, c);
  });
  land.instanceMatrix.needsUpdate = true;
  if (land.instanceColor) land.instanceColor.needsUpdate = true;
  land.raycast = () => {};
  g.add(land);
  return g;
}

export function buildClouds(avoid: ReadonlyArray<{ lat: number; lon: number }>): THREE.Group {
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const lat = -50 + rnd(i * 3) * 110;
    const lon = -180 + rnd(i * 5) * 360;
    const p = ll(lat, lon, R + 1.7);
    if (avoid.some((a) => p.clone().normalize().angleTo(ll(a.lat, a.lon, 1).normalize()) < 0.5)) continue;
    const puff = new THREE.Group();
    const n = 3 + Math.floor(rnd(i) * 3);
    for (let j = 0; j < n; j++) {
      const b = mesh(new THREE.SphereGeometry(0.3 + rnd(i * 7 + j) * 0.22, 12, 10), PALETTE.pearl, 1.1);
      b.position.set(j * 0.36 - n * 0.18, rnd(i + j) * 0.12, rnd(j) * 0.2);
      puff.add(b);
    }
    puff.position.copy(p);
    puff.lookAt(0, 0, 0);
    puff.rotateX(Math.PI / 2);
    puff.traverse((o) => (o.raycast = () => {}));
    clouds.add(puff);
  }
  return clouds;
}

function palm(h: number): THREE.Group {
  const p = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const seg = mesh(new THREE.CylinderGeometry(0.05, 0.065, h / 5, 8), PALETTE.wood, 1.12);
    seg.position.set(k * 0.025, h / 10 + (k * h) / 5, 0);
    seg.rotation.z = -k * 0.05;
    p.add(seg);
  }
  for (let k = 0; k < 7; k++) {
    const leaf = mesh(new THREE.ConeGeometry(0.1, 0.62, 4), k % 2 ? PALETTE.leaf : PALETTE.leafDark, 1.08);
    leaf.scale.z = 0.35;
    leaf.position.set(0.12, h, 0);
    leaf.rotation.set(0, (k * Math.PI * 2) / 7, Math.PI / 2 - 0.35);
    leaf.translateY(0.24);
    p.add(leaf);
  }
  return p;
}

function hexPlatform(r: number, color: number): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.2, 6), color, 1.04);
}

export interface Office {
  frame: THREE.Group;
  windows: THREE.MeshBasicMaterial;
  benSpot: THREE.Vector3;
  vinceSpot: THREE.Vector3;
  laptopScreen: THREE.Mesh;
  monitorScreen: THREE.Mesh;
  stationAnchor: THREE.Group;
}

export function buildOffice(lat: number, lon: number): Office {
  const frame = siteFrame(lat, lon, 0.45);
  frame.scale.setScalar(0.8);
  frame.add(hexPlatform(1.5, 0xb9dca4));
  const path = mesh(new THREE.BoxGeometry(0.5, 0.02, 1.2), PALETTE.sand);
  path.position.set(0, 0.11, 0.5);
  frame.add(path);
  const house = mesh(new THREE.BoxGeometry(1.2, 0.95, 0.62), 0xf4efe6, 1.05);
  house.position.set(0, 0.58, -0.78);
  frame.add(house);
  const roof = mesh(new THREE.ConeGeometry(0.9, 0.5, 4), PALETTE.coral, 1.06);
  roof.position.set(0, 1.3, -0.78);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.62;
  frame.add(roof);
  const windows = new THREE.MeshBasicMaterial({ color: 0xaab8c8 });
  for (const [x, y] of [[-0.32, 0.8], [0.32, 0.8], [-0.32, 0.46], [0.32, 0.46]] as const) {
    const w = inked(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.02), windows), 1.15);
    w.position.set(x, y, -0.465);
    frame.add(w);
  }
  const door = mesh(new THREE.BoxGeometry(0.2, 0.34, 0.02), PALETTE.woodDark, 1.1);
  door.position.set(0, 0.28, -0.465);
  frame.add(door);
  // Ben's desk with laptop
  const desk = new THREE.Group();
  const top = mesh(new THREE.BoxGeometry(0.66, 0.05, 0.36), PALETTE.wood, 1.08);
  top.position.y = 0.44;
  desk.add(top);
  for (const [a, b] of [[-0.29, -0.14], [0.29, -0.14], [-0.29, 0.14], [0.29, 0.14]] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6), PALETTE.woodDark);
    leg.position.set(a, 0.27, b);
    desk.add(leg);
  }
  const base = mesh(new THREE.BoxGeometry(0.34, 0.02, 0.22), 0x2b2f38);
  base.position.set(0, 0.48, -0.02);
  desk.add(base);
  const laptopScreen = inked(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.02), new THREE.MeshBasicMaterial({ color: 0x9cc0ff })), 1.1);
  laptopScreen.position.set(0, 0.56, 0.1);
  laptopScreen.rotation.x = 0.35;
  desk.add(laptopScreen);
  desk.position.set(-0.42, 0.1, 0.42);
  desk.rotation.y = 0.55;
  frame.add(desk);
  const chair = mesh(new THREE.BoxGeometry(0.32, 0.05, 0.3), 0x3a3f47, 1.1);
  chair.position.set(-0.78, 0.32, 0.02);
  chair.rotation.y = 0.55;
  frame.add(chair);
  // Vince's standing table with the website on a monitor
  const stand = new THREE.Group();
  const sTop = mesh(new THREE.BoxGeometry(0.46, 0.04, 0.3), PALETTE.wood, 1.08);
  sTop.position.y = 0.62;
  stand.add(sTop);
  const sLeg = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.56, 8), PALETTE.woodDark);
  sLeg.position.y = 0.34;
  stand.add(sLeg);
  const monitorScreen = inked(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.02), new THREE.MeshBasicMaterial({ color: 0xe9e4f6 })), 1.1);
  monitorScreen.position.set(0, 0.8, -0.06);
  stand.add(monitorScreen);
  const bar = basic(new THREE.BoxGeometry(0.36, 0.04, 0.025), 0x8a5cf6);
  bar.position.set(0, 0.9, -0.06);
  stand.add(bar);
  stand.position.set(0.78, 0.1, 0.0);
  stand.rotation.y = -0.5;
  frame.add(stand);
  // a Berlin linden instead of a palm: round crown
  const linden = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 8), PALETTE.woodDark, 1.1);
  trunk.position.y = 0.4;
  linden.add(trunk);
  for (const [x, y, z, r] of [[0, 0.85, 0, 0.32], [0.18, 0.75, 0.05, 0.22], [-0.17, 0.78, -0.03, 0.24]] as const) {
    const crown = mesh(new THREE.SphereGeometry(r, 14, 10), 0x7cbf6a, 1.06);
    crown.position.set(x, y, z);
    linden.add(crown);
  }
  linden.position.set(-1.05, 0.1, -0.35);
  frame.add(linden);
  const stationAnchor = new THREE.Group();
  stationAnchor.position.set(0, 0, -0.55);
  frame.add(stationAnchor);
  return { frame, windows, benSpot: new THREE.Vector3(-0.72, 0.1, 0.08), vinceSpot: new THREE.Vector3(0.58, 0.1, 0.32), laptopScreen, monitorScreen, stationAnchor };
}

export interface Station {
  group: THREE.Group;
  icon: THREE.Object3D;
  lamp: THREE.Mesh;
}

export function buildStation(shape: ProjectShape, color: number): Station {
  const group = new THREE.Group();
  const ped = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.09, 6), PALETTE.pearl, 1.12);
  group.add(ped);
  let icon: THREE.Object3D;
  if (shape === "screen") {
    icon = mesh(new THREE.BoxGeometry(0.42, 0.28, 0.04), color, 1.1);
  } else if (shape === "film") {
    const g = new THREE.Group();
    const reel = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 18), color, 1.1);
    reel.rotation.x = Math.PI / 2;
    g.add(reel);
    for (let k = 0; k < 5; k++) {
      const hole = basic(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8), PALETTE.pearl);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(Math.cos((k * Math.PI * 2) / 5) * 0.1, Math.sin((k * Math.PI * 2) / 5) * 0.1, 0);
      g.add(hole);
    }
    icon = g;
  } else if (shape === "crystal") {
    icon = mesh(new THREE.OctahedronGeometry(0.19, 0), color, 1.12);
  } else if (shape === "bubble") {
    const g = new THREE.Group();
    const b = mesh(new THREE.SphereGeometry(0.17, 16, 12), color, 1.1);
    b.scale.set(1.25, 0.9, 0.6);
    g.add(b);
    const tail = mesh(new THREE.ConeGeometry(0.07, 0.14, 6), color);
    tail.position.set(-0.1, -0.16, 0);
    tail.rotation.z = 0.6;
    g.add(tail);
    icon = g;
  } else if (shape === "globe") {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.16, 16, 12), color, 1.1));
    const ring = basic(new THREE.TorusGeometry(0.22, 0.012, 6, 32), PALETTE.ink);
    ring.rotation.x = 1.2;
    g.add(ring);
    icon = g;
  } else {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.3, 0.04), color, 1.1));
    const bar = basic(new THREE.BoxGeometry(0.42, 0.06, 0.05), PALETTE.ink);
    bar.position.y = 0.12;
    g.add(bar);
    icon = g;
  }
  icon.position.y = 0.38;
  group.add(icon);
  const lamp = inked(new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshBasicMaterial({ color: PALETTE.idle })), 1.3);
  lamp.position.set(0.22, 0.08, 0.1);
  group.add(lamp);
  return { group, icon, lamp };
}

export interface AnaSpot {
  frame: THREE.Group;
  anaSpot: THREE.Vector3;
  hammock: THREE.Group;
  /** the hut with the blue roof: the door to Ana's office */
  hut: THREE.Group;
}

export function buildAnaSpot(lat: number, lon: number): AnaSpot {
  const frame = siteFrame(lat, lon, 0.62);
  frame.scale.setScalar(0.8);
  frame.add(hexPlatform(1.3, PALETTE.sand));
  const grass = mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.04, 6), 0x8ccf74);
  grass.position.set(-0.3, 0.11, -0.35);
  frame.add(grass);
  const p1 = palm(1.25);
  p1.position.set(-0.75, 0.1, -0.3);
  frame.add(p1);
  const p2 = palm(1.0);
  p2.position.set(0.72, 0.1, -0.5);
  p2.rotation.y = 2;
  frame.add(p2);
  // the small hut with the blue roof from Ana's photo
  const hut = new THREE.Group();
  const floor = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.5), PALETTE.pearl, 1.08);
  floor.position.y = 0.16;
  hut.add(floor);
  for (const [x, z] of [[-0.27, -0.21], [0.27, -0.21], [-0.27, 0.21], [0.27, 0.21]] as const) {
    const post = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), PALETTE.wood);
    post.position.set(x, 0.42, z);
    hut.add(post);
  }
  const roof = mesh(new THREE.ConeGeometry(0.52, 0.42, 4), 0x3d63b8, 1.06);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.86;
  hut.add(roof);
  const door = mesh(new THREE.BoxGeometry(0.16, 0.3, 0.02), 0xf2b84b, 1.1);
  door.position.set(0, 0.34, 0.205);
  hut.add(door);
  const wall = mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), 0xfbf3e6, 1.04);
  wall.position.y = 0.4;
  hut.add(wall);
  hut.position.set(0.1, 0.06, -0.72);
  frame.add(hut);
  // camera on a tripod (she films)
  const tripod = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), PALETTE.ink);
    const a = (k * Math.PI * 2) / 3;
    leg.position.set(Math.cos(a) * 0.08, 0.3, Math.sin(a) * 0.08);
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    tripod.add(leg);
  }
  const cam = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.11), 0x2b2f38, 1.12);
  cam.position.y = 0.63;
  tripod.add(cam);
  const lens = mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.08, 12), PALETTE.ink);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.63, 0.09);
  tripod.add(lens);
  tripod.position.set(0.62, 0.1, 0.45);
  tripod.rotation.y = -2.3;
  frame.add(tripod);
  // hammock between the palms, used at night
  const hammock = new THREE.Group();
  const sling = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.62, 0.62, -0.31), new THREE.Vector3(-0.3, 0.44, -0.36), new THREE.Vector3(0.1, 0.4, -0.41), new THREE.Vector3(0.45, 0.46, -0.46), new THREE.Vector3(0.66, 0.64, -0.49)]);
  const cloth = mesh(new THREE.TubeGeometry(sling, 32, 0.13, 10), 0xe9c98a, 1.06);
  cloth.scale.set(1, 0.55, 1);
  cloth.position.y = 0.2;
  hammock.add(cloth);
  frame.add(hammock);
  return { frame, anaSpot: new THREE.Vector3(-0.1, 0.1, 0.25), hammock, hut };
}

export interface Scooter {
  group: THREE.Group;
  wheels: THREE.Object3D[];
}

/** A comic step-through scooter, front = +Z, about 0.85 long. The rider sits at `seat` (local coordinates). */
export function buildScooter(color: number): Scooter & { seat: THREE.Vector3 } {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  for (const z of [0.3, -0.28]) {
    const w = new THREE.Group();
    const tyre = mesh(new THREE.TorusGeometry(0.09, 0.035, 8, 20), 0x24272d, 1.12);
    tyre.rotation.y = Math.PI / 2;
    w.add(tyre);
    const hub = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), 0xc4c9d2, 0);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
    w.position.set(0, 0.125, z);
    g.add(w);
    wheels.push(w);
  }
  const board = mesh(new THREE.BoxGeometry(0.17, 0.045, 0.4), color, 1.08);
  board.position.set(0, 0.17, 0.02);
  g.add(board);
  const rear = mesh(new THREE.SphereGeometry(0.16, 18, 12), color, 1.06);
  rear.scale.set(0.95, 0.8, 1.45);
  rear.position.set(0, 0.27, -0.22);
  g.add(rear);
  const seat = mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 10), 0x5a3a28, 1.1);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(0, 0.4, -0.18);
  g.add(seat);
  const shield = mesh(new THREE.BoxGeometry(0.2, 0.36, 0.045), color, 1.08);
  shield.rotation.x = -0.28;
  shield.position.set(0, 0.34, 0.25);
  g.add(shield);
  const stem = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), 0x9aa1ab, 1.1);
  stem.position.set(0, 0.56, 0.3);
  g.add(stem);
  const bar = mesh(new THREE.CapsuleGeometry(0.02, 0.32, 3, 8), 0x24272d, 1.12);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.66, 0.29);
  g.add(bar);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  lamp.position.set(0, 0.6, 0.35);
  g.add(lamp);
  const mud = mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16, Math.PI), color, 1.08);
  mud.rotation.y = Math.PI / 2;
  mud.position.set(0, 0.14, 0.3);
  g.add(mud);
  return { group: g, wheels, seat: new THREE.Vector3(0, 0.43, -0.16) };
}

/** A round beach rock for the mermaid to sit on; its top is at `top`. */
export function buildRock(): { group: THREE.Group; top: THREE.Vector3 } {
  const g = new THREE.Group();
  const rock = mesh(new THREE.DodecahedronGeometry(0.26, 0), 0x9aa3ad, 1.06);
  rock.scale.set(1.25, 0.8, 1);
  rock.position.y = 0.12;
  g.add(rock);
  const pebble = mesh(new THREE.DodecahedronGeometry(0.09, 0), 0xb7bec7, 1.08);
  pebble.position.set(0.3, 0.05, 0.12);
  g.add(pebble);
  const star = mesh(new THREE.ConeGeometry(0.05, 0.02, 5), 0xf2955e, 1.1);
  star.position.set(-0.28, 0.03, 0.18);
  g.add(star);
  return { group: g, top: new THREE.Vector3(0, 0.3, 0) };
}

// ---------- activity props (decoration; sizes in avatar units, a hand sits at y -0.27 below the shoulder pivot) ----------

/** A noodle bowl held level in the left hand, with chopsticks for the right and three steam puffs. */
export function buildBowl(): { bowl: THREE.Group; chopsticks: THREE.Group; steam: THREE.Mesh[] } {
  const bowl = new THREE.Group();
  const cup = mesh(new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xf4f6fb, 1.08, { side: THREE.DoubleSide });
  bowl.add(cup);
  const rim = mesh(new THREE.TorusGeometry(0.073, 0.008, 6, 20), 0xd8566f, 0);
  rim.rotation.x = Math.PI / 2;
  bowl.add(rim);
  const noodles = mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.012, 16), 0xf2c35b, 0);
  noodles.position.y = -0.012;
  bowl.add(noodles);
  const steam: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    puff.position.set((i - 1) * 0.025, 0.04, 0);
    bowl.add(puff);
    steam.push(puff);
  }
  const chopsticks = new THREE.Group();
  for (const x of [-0.008, 0.008]) {
    const stick = mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.2, 5), PALETTE.wood, 0);
    stick.position.set(x, -0.06, 0.03);
    stick.rotation.x = 0.5;
    chopsticks.add(stick);
  }
  return { bowl, chopsticks, steam };
}

/** A phone held up for a selfie; `flash` blinks when she takes a picture. */
export function buildSelfiePhone(): { phone: THREE.Group; flash: THREE.Mesh } {
  const phone = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.05, 0.095, 0.012), 0x1b1d22, 1.12);
  phone.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.08), new THREE.MeshBasicMaterial({ color: 0x9cc0ff }));
  screen.position.z = -0.007;
  screen.rotation.y = Math.PI;
  phone.add(screen);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  flash.position.set(0, 0.03, 0.012);
  phone.add(flash);
  return { phone, flash };
}

/** An open book held in both hands; `page` turns. */
export function buildBook(): { book: THREE.Group; page: THREE.Group } {
  const book = new THREE.Group();
  for (const s of [-1, 1]) {
    const half = mesh(new THREE.BoxGeometry(0.1, 0.13, 0.012), 0x2fa39a, 1.1);
    half.position.x = s * 0.05;
    half.rotation.y = -s * 0.25;
    book.add(half);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.118), new THREE.MeshBasicMaterial({ color: 0xfbf7ee, side: THREE.DoubleSide }));
    paper.position.set(s * 0.05, 0, 0.008);
    paper.rotation.y = -s * 0.25;
    book.add(paper);
  }
  const page = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.118), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  leaf.position.x = 0.044;
  page.add(leaf);
  page.position.z = 0.01;
  book.add(page);
  return { book, page };
}

/** A striped beach lounger; she sits at `seat`, leaning back. Front = +Z. */
export function buildLounger(): { group: THREE.Group; seat: THREE.Vector3 } {
  const g = new THREE.Group();
  const stripes = [0xf27d72, 0xfbf7ee, 0xf27d72];
  stripes.forEach((c, i) => {
    const seat = mesh(new THREE.BoxGeometry(0.42, 0.03, 0.12), c, 1.06);
    seat.position.set(0, 0.22, 0.16 - i * 0.12);
    g.add(seat);
    const back = mesh(new THREE.BoxGeometry(0.42, 0.03, 0.12), c, 1.06);
    back.rotation.x = 1.0;
    back.position.set(0, 0.31 + i * 0.1, -0.2 - i * 0.065);
    g.add(back);
  });
  for (const [x, z] of [[-0.18, 0.18], [0.18, 0.18], [-0.18, -0.2], [0.18, -0.2]] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), PALETTE.wood, 1.1);
    leg.position.set(x, 0.11, z);
    g.add(leg);
  }
  return { group: g, seat: new THREE.Vector3(0, 0.235, -0.02) };
}

/** Floating music notes and a small speaker for dancing. */
export function buildMusic(): { group: THREE.Group; notes: THREE.Group[] } {
  const group = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.12), 0x24272d, 1.1);
  box.position.set(0.42, 0.2, 0.3);
  group.add(box);
  for (const y of [0.25, 0.15]) {
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: 0x9aa1ab }));
    cone.position.set(0.42, y, 0.362);
    group.add(cone);
  }
  const notes: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const n = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd8566f : 0x5b7fd6, transparent: true }));
    head.scale.set(1.2, 0.9, 0.6);
    n.add(head);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.008), head.material);
    stem.position.set(0.03, 0.045, 0);
    n.add(stem);
    group.add(n);
    notes.push(n);
  }
  return { group, notes };
}

// ---------- Berlin office day (decoration) ----------

/** A futon with pillow and blanket, long side along X; a sleeper's feet go at +X. */
export function buildFuton(blanket: number): THREE.Group {
  const g = new THREE.Group();
  const mat = mesh(new THREE.BoxGeometry(0.95, 0.06, 0.38), 0xf4efe6, 1.06);
  mat.position.y = 0.03;
  g.add(mat);
  const pillow = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.28), 0xffffff, 1.08);
  pillow.position.set(-0.36, 0.08, 0);
  g.add(pillow);
  const cover = mesh(new THREE.BoxGeometry(0.55, 0.05, 0.4), blanket, 1.06);
  cover.position.set(0.16, 0.09, 0);
  g.add(cover);
  return g;
}

/** A small outdoor gym corner: rubber mat, bench and a dumbbell rack. */
export function buildGymCorner(): THREE.Group {
  const g = new THREE.Group();
  const mat = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.5), 0x2b2f38, 1.06);
  mat.position.y = 0.01;
  g.add(mat);
  const bench = mesh(new THREE.BoxGeometry(0.14, 0.05, 0.42), 0xd8566f, 1.08);
  bench.position.set(-0.36, 0.17, 0);
  g.add(bench);
  for (const z of [-0.15, 0.15]) {
    const leg = mesh(new THREE.BoxGeometry(0.1, 0.15, 0.04), 0x24272d, 1.1);
    leg.position.set(-0.36, 0.075, z);
    g.add(leg);
  }
  const rack = mesh(new THREE.BoxGeometry(0.06, 0.24, 0.3), 0x9aa1ab, 1.08);
  rack.position.set(0.36, 0.12, -0.1);
  g.add(rack);
  for (const y of [0.08, 0.18]) {
    const db = buildDumbbell();
    db.rotation.y = Math.PI / 2;
    db.position.set(0.4, y, -0.1);
    g.add(db);
  }
  return g;
}

/** A dumbbell, bar along X. */
export function buildDumbbell(): THREE.Group {
  const g = new THREE.Group();
  const bar = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), 0x9aa1ab, 0);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    const plate = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 10), 0x24272d, 1.1);
    plate.rotation.z = Math.PI / 2;
    plate.position.x = s * 0.07;
    g.add(plate);
  }
  return g;
}

/** A wine glass with red wine. */
export function buildWineGlass(): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.MeshBasicMaterial({ color: 0xdfeaf3, transparent: true, opacity: 0.8 });
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12), glass);
  g.add(foot);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 6), glass);
  stem.position.y = 0.035;
  g.add(stem);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), glass);
  bowl.position.y = 0.1;
  g.add(bowl);
  const wine = mesh(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), 0x7a1f2b, 0);
  wine.position.y = 0.1;
  g.add(wine);
  return g;
}

/** A floating AI orb with a ring and two speech bubbles (one at the orb, one for the person talking to it). */
export function buildAiOrb(): { group: THREE.Group; orb: THREE.Mesh; ring: THREE.Mesh; bubbles: THREE.Group[] } {
  const group = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
  group.add(orb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25 }));
  orb.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.008, 6, 32), new THREE.MeshBasicMaterial({ color: 0x5b7fd6 }));
  ring.rotation.x = Math.PI / 2.4;
  group.add(ring);
  const bubbles: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const cloud = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), white);
    cloud.scale.set(1.35, 0.85, 1);
    b.add(cloud);
    const tailTri = new THREE.Mesh(new THREE.CircleGeometry(0.025, 3), white);
    tailTri.position.set(i ? 0.05 : -0.05, -0.06, 0);
    b.add(tailTri);
    for (let k = 0; k < 3; k++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.01, 8), new THREE.MeshBasicMaterial({ color: i ? 0x5b7fd6 : 0x24272d, transparent: true }));
      dot.position.set((k - 1) * 0.028, 0, 0.001);
      b.add(dot);
    }
    group.add(b);
    bubbles.push(b);
  }
  return { group, orb, ring, bubbles };
}
