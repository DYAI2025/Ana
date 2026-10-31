/**
 * Comic character avatars, built from AvatarSpec (people.ts). Big-head proportions; the traits that make each person
 * recognisable are modelled as geometry (hair silhouette, beard, moustache, sunglasses, dress pattern, tattoo).
 * Units: about 1.0 tall at height 1. Front = +Z.
 */
import * as THREE from "three";
import type { AvatarSpec } from "../people";
import { canvasTexture, hex, inked, mesh, PALETTE } from "./kit";

export interface AvatarRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  eyes: THREE.Group;
  /** the hand-held prop, when any */
  prop: THREE.Object3D | null;
}

const HEAD_R = 0.215;

function gingham(primary: number, secondary: number): THREE.CanvasTexture {
  return canvasTexture(
    64,
    (ctx, s) => {
      ctx.fillStyle = hex(secondary);
      ctx.fillRect(0, 0, s, s);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = hex(primary);
      const b = s / 4;
      for (let i = 0; i < 4; i += 2) {
        ctx.fillRect(0, i * b, s, b);
        ctx.fillRect(i * b, 0, b, s);
      }
      ctx.globalAlpha = 1;
    },
    [5, 3],
  );
}

function saltAndPepper(base: number, grey: number): THREE.CanvasTexture {
  return canvasTexture(
    64,
    (ctx, s) => {
      ctx.fillStyle = hex(base);
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = hex(grey);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 90; i++) {
        const x = (i * 37) % s;
        const y = (i * 53) % s;
        ctx.globalAlpha = 0.45 + ((i * 7) % 5) / 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1.5, y + 5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [2, 2],
  );
}

function wingTattoo(): THREE.CanvasTexture {
  return canvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = "#2a2f38";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(s * 0.18, s * 0.42);
      ctx.quadraticCurveTo(s * (0.45 + i * 0.07), s * (0.2 + i * 0.05), s * (0.75 + i * 0.04), s * (0.32 + i * 0.09));
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * (0.4 + i * 0.12), s * 0.6);
      ctx.lineTo(s * (0.4 + i * 0.12), s * 0.82);
      ctx.stroke();
    }
  });
}

function capsule(r: number, len: number, color: number, ink = 1.12): THREE.Mesh {
  return mesh(new THREE.CapsuleGeometry(r, len, 4, 10), color, ink);
}

function arm(side: 1 | -1, spec: AvatarSpec, sleeve: number | null): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(side * (0.155 * spec.shoulders + 0.035), 0.6, 0);
  const upper = capsule(0.045 * spec.shoulders, 0.13, sleeve ?? spec.skin);
  upper.position.y = -0.085;
  pivot.add(upper);
  if (sleeve !== null) {
    // a short sleeve leaves the lower arm bare
    const fore = capsule(0.04 * spec.shoulders, 0.1, spec.skin);
    fore.position.y = -0.2;
    pivot.add(fore);
  }
  const hand = mesh(new THREE.SphereGeometry(0.047, 12, 10), spec.skin, 1.12);
  hand.position.y = -0.27;
  pivot.add(hand);
  pivot.userData.hand = hand;
  return pivot;
}

function face(spec: AvatarSpec, head: THREE.Group): THREE.Group {
  const eyes = new THREE.Group();
  const eyeGeo = new THREE.SphereGeometry(0.03, 12, 10);
  const shineGeo = new THREE.SphereGeometry(0.009, 8, 6);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-0.072, 0.072]) {
    const e = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: spec.eyes }));
    e.scale.set(0.8, 1.1, 0.45);
    e.position.set(x, 0.0, HEAD_R * 0.93);
    const s = new THREE.Mesh(shineGeo, shine);
    s.position.set(x + 0.01, 0.014, HEAD_R * 0.98);
    eyes.add(e, s);
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), spec.hair.color);
    brow.position.set(x, 0.058, HEAD_R * 0.93);
    brow.rotation.z = x < 0 ? 0.12 : -0.12;
    head.add(brow);
  }
  head.add(eyes);
  const nose = mesh(new THREE.SphereGeometry(0.022, 10, 8), spec.skin);
  nose.position.set(0, -0.035, HEAD_R * 0.99);
  head.add(nose);
  for (const x of [-0.11, 0.11]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), new THREE.MeshBasicMaterial({ color: spec.blush, transparent: true, opacity: 0.55 }));
    cheek.scale.set(1.3, 0.75, 0.3);
    cheek.position.set(x, -0.045, HEAD_R * 0.9);
    head.add(cheek);
    const ear = mesh(new THREE.SphereGeometry(0.038, 10, 8), spec.skin, 1.1);
    ear.scale.set(0.55, 1, 0.75);
    ear.position.set(x < 0 ? -HEAD_R * 0.98 : HEAD_R * 0.98, -0.01, 0);
    head.add(ear);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x7a2e2a }));
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.085, HEAD_R * 0.95);
  head.add(smile);
  return eyes;
}

function hair(spec: AvatarSpec, head: THREE.Group): void {
  const { style, color, shine } = spec.hair;
  if (style === "buzz") {
    const cap = mesh(new THREE.SphereGeometry(HEAD_R * 1.025, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), color, 1.03);
    cap.rotation.x = -0.18;
    head.add(cap);
    return;
  }
  if (style === "swept-back") {
    const cap = mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), color, 1.04);
    cap.rotation.x = -0.32;
    cap.position.set(0, 0.01, -0.012);
    head.add(cap);
    // the swept-back crown: volume on top, combed towards the back
    const crown = mesh(new THREE.SphereGeometry(0.15, 16, 12), color, 1.06);
    crown.scale.set(1.15, 0.55, 1.35);
    crown.position.set(0, HEAD_R * 0.86, -0.04);
    crown.rotation.x = -0.35;
    head.add(crown);
    for (const x of [-0.06, 0, 0.06]) {
      const streak = mesh(new THREE.CapsuleGeometry(0.012, 0.16, 3, 6), shine);
      streak.rotation.x = Math.PI / 2 - 0.5;
      streak.position.set(x, HEAD_R * 0.95, -0.02);
      head.add(streak);
    }
    return;
  }
  // long wavy hair with a middle parting, falling over the shoulders and back
  const cap = mesh(new THREE.SphereGeometry(HEAD_R * 1.07, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), color, 1.04);
  // tilted back so the hairline sits above the brows
  cap.rotation.x = -0.5;
  head.add(cap);
  const part = mesh(new THREE.BoxGeometry(0.008, 0.01, 0.16), shine);
  part.position.set(0, HEAD_R * 1.05, 0.05);
  head.add(part);
  const locks = 13;
  for (let i = 0; i < locks; i++) {
    const a = -Math.PI * 0.78 + (i / (locks - 1)) * Math.PI * 1.56; // around the back, leaving the face free
    const angle = a + Math.PI; // 0 = back of the head
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const pts: THREE.Vector3[] = [];
    const length = 0.5 + (Math.abs(sx) < 0.5 ? 0.06 : 0);
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const wave = Math.sin(t * Math.PI * 3 + i) * 0.022;
      const spread = 1 + t * 0.35;
      pts.push(new THREE.Vector3(sx * (HEAD_R * 0.98 * spread + wave), 0.03 - t * length, sz * (HEAD_R * 0.98 * spread + wave) - t * 0.03));
    }
    const lock = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04 - (i % 3) * 0.004, 8), i % 4 === 0 ? shine : color);
    head.add(lock);
  }
  if (spec.sunglassesOnHead) {
    const frame = 0x3a2418;
    const glasses = new THREE.Group();
    for (const x of [-0.07, 0.07]) {
      const lens = mesh(new THREE.SphereGeometry(0.046, 14, 10), 0x1d1d24, 1.12);
      lens.scale.set(1, 0.78, 0.35);
      lens.position.x = x;
      glasses.add(lens);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), frame);
    glasses.add(bridge);
    glasses.position.set(0, HEAD_R * 0.93, 0.07);
    glasses.rotation.x = -0.65;
    head.add(glasses);
  }
}

function facialHair(spec: AvatarSpec, head: THREE.Group): void {
  if (spec.beard?.full) {
    const tex = saltAndPepper(spec.beard.color, spec.beard.grey);
    const jaw = mesh(new THREE.SphereGeometry(HEAD_R * 1.04, 24, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.52, Math.PI * 0.42), 0xffffff, 0, { map: tex });
    jaw.position.z = 0.012;
    head.add(jaw);
    // the long chin part of the beard
    const chin = mesh(new THREE.SphereGeometry(0.1, 16, 12), 0xffffff, 1.06, { map: tex });
    chin.scale.set(1, 1.25, 0.7);
    chin.position.set(0, -HEAD_R * 0.98, 0.08);
    head.add(chin);
    const stache = mesh(new THREE.CapsuleGeometry(0.018, 0.09, 3, 8), spec.beard.color, 0, { map: tex });
    stache.rotation.z = Math.PI / 2;
    stache.position.set(0, -0.06, HEAD_R * 0.97);
    head.add(stache);
  }
  if (spec.stubble) {
    const stubble = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R * 1.008, 24, 16, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.56, Math.PI * 0.36),
      new THREE.MeshBasicMaterial({ color: spec.hair.color, transparent: true, opacity: 0.22 }),
    );
    head.add(stubble);
  }
  if (spec.moustache !== null) {
    for (const side of [-1, 1]) {
      const m = mesh(new THREE.CapsuleGeometry(0.017, 0.05, 3, 8), spec.moustache, 1.12);
      m.rotation.z = Math.PI / 2 + side * 0.32;
      m.position.set(side * 0.032, -0.058, HEAD_R * 0.97);
      head.add(m);
    }
  }
}

function torso(spec: AvatarSpec, body: THREE.Group): void {
  const s = spec.shoulders;
  const kind = spec.outfit.kind;
  if (kind === "sundress") {
    const dress = mesh(new THREE.CylinderGeometry(0.125, 0.245, 0.44, 22, 1, true), 0xffffff, 0, { map: gingham(spec.outfit.primary, spec.outfit.secondary), side: THREE.DoubleSide });
    inked(dress, 1.04);
    dress.position.y = 0.36;
    body.add(dress);
    const smock = mesh(new THREE.CylinderGeometry(0.128, 0.13, 0.07, 22), spec.outfit.primary, 1.06);
    smock.position.y = 0.55;
    body.add(smock);
    // strapless: bare shoulders above the dress
    const chest = mesh(new THREE.SphereGeometry(0.13 * s, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), spec.skin, 1.05);
    chest.scale.set(1.15, 0.55, 0.9);
    chest.position.y = 0.585;
    body.add(chest);
    for (const x of [-0.06, 0.06]) {
      const leg = capsule(0.042, 0.1, spec.skin);
      leg.position.set(x, 0.1, 0);
      body.add(leg);
      const sandal = mesh(new THREE.BoxGeometry(0.07, 0.02, 0.1), PALETTE.woodDark);
      sandal.position.set(x, 0.01, 0.015);
      body.add(sandal);
    }
    return;
  }
  for (const x of [-0.065, 0.065]) {
    const leg = capsule(0.05, 0.14, 0x2b2f38);
    leg.position.set(x, 0.14, 0);
    body.add(leg);
    const shoe = mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), 0x1b1d22, 1.1);
    shoe.position.set(x, 0.02, 0.02);
    body.add(shoe);
  }
  const top = mesh(new THREE.CylinderGeometry(0.165 * s, 0.14, 0.34, 20), spec.outfit.primary, 1.05);
  top.position.y = 0.43;
  body.add(top);
  const shoulders = mesh(new THREE.SphereGeometry(0.165 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), spec.outfit.primary, 1.05);
  shoulders.scale.y = 0.45;
  shoulders.position.y = 0.6;
  body.add(shoulders);
  if (kind === "open-shirt") {
    const v = mesh(new THREE.ConeGeometry(0.05, 0.12, 3), spec.skin);
    v.rotation.x = Math.PI;
    v.position.set(0, 0.56, 0.135);
    body.add(v);
    for (const x of [-1, 1]) {
      const collar = mesh(new THREE.BoxGeometry(0.06, 0.035, 0.02), spec.outfit.secondary, 1.15);
      collar.position.set(x * 0.045, 0.615, 0.13);
      collar.rotation.z = x * 0.5;
      body.add(collar);
    }
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshBasicMaterial({ color: 0x5a5f68 }));
      button.position.set(0, 0.46 - i * 0.07, 0.15);
      body.add(button);
    }
  }
  if (kind === "tee") {
    const neckline = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 18), new THREE.MeshBasicMaterial({ color: spec.outfit.secondary }));
    neckline.rotation.x = Math.PI / 2;
    neckline.position.y = 0.645;
    body.add(neckline);
  }
}

function prop(kind: AvatarSpec["prop"]): THREE.Object3D {
  if (kind === "coconut") {
    const c = new THREE.Group();
    const nut = mesh(new THREE.SphereGeometry(0.085, 16, 12), 0x9cc33b, 1.08);
    nut.scale.set(1, 1.1, 1);
    c.add(nut);
    const spot = mesh(new THREE.SphereGeometry(0.03, 8, 6), 0x6f8f2a);
    spot.position.set(0, 0.085, 0.02);
    c.add(spot);
    return c;
  }
  if (kind === "phone") {
    const p = mesh(new THREE.BoxGeometry(0.045, 0.09, 0.012), 0x1b1d22, 1.12);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.075), new THREE.MeshBasicMaterial({ color: 0x9cc0ff }));
    screen.position.z = 0.007;
    p.add(screen);
    return p;
  }
  return new THREE.Group();
}

export function buildAvatar(spec: AvatarSpec): AvatarRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  torso(spec, body);
  const sleeve = spec.outfit.kind === "tee" ? spec.outfit.primary : spec.outfit.kind === "open-shirt" ? spec.outfit.primary : null;
  const armL = arm(-1, spec, spec.outfit.kind === "open-shirt" ? null : sleeve);
  const armR = arm(1, spec, spec.outfit.kind === "open-shirt" ? null : sleeve);
  if (spec.outfit.kind === "open-shirt") {
    // long sleeves rolled to the forearm (as in the reference): sleeve on the whole upper arm
    for (const a of [armL, armR]) {
      const s = capsule(0.05, 0.15, spec.outfit.primary);
      s.position.y = -0.1;
      a.add(s);
    }
  }
  body.add(armL, armR);
  if (spec.armTattoo) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshBasicMaterial({ map: wingTattoo(), transparent: true }));
    decal.position.set(-0.03, -0.2, 0.025);
    decal.rotation.y = -0.6;
    armL.add(decal);
  }
  if (spec.bracelet) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 16), new THREE.MeshBasicMaterial({ color: 0x5f6f8f }));
    b.rotation.x = Math.PI / 2;
    b.position.y = -0.23;
    armR.add(b);
  }
  const neck = mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.07, 12), spec.skin, 1.1);
  neck.position.y = 0.665;
  body.add(neck);
  if (spec.necklace) {
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.005, 6, 20), new THREE.MeshBasicMaterial({ color: 0x2a2a2a }));
    cord.rotation.x = Math.PI / 2 + 0.35;
    cord.position.set(0, 0.63, 0.02);
    body.add(cord);
    const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb8a37a }));
    pendant.position.set(0, 0.585, 0.08);
    body.add(pendant);
  }
  const head = new THREE.Group();
  head.position.y = 0.88;
  const skull = mesh(new THREE.SphereGeometry(HEAD_R, 28, 20), spec.skin, 1.05);
  skull.scale.set(1, 1.02, 0.95);
  head.add(skull);
  const eyes = face(spec, head);
  hair(spec, head);
  facialHair(spec, head);
  body.add(head);
  let held: THREE.Object3D | null = null;
  if (spec.prop === "coconut" || spec.prop === "phone") {
    held = prop(spec.prop);
    held.position.set(0, -0.33, 0.04);
    armR.add(held);
  }
  root.scale.setScalar(spec.height);
  return { root, body, head, armL, armR, eyes, prop: held };
}
