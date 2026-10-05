import {
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshToonMaterial,
  Shape,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { getItem } from '../logic/catalog';
import { boxGeo, cylGeo, ellipsoidGeo, coneGeo, gradientMap, outlined, sphereGeo, toonMat, torusGeo, flatMat } from './toon';

const m = toonMat;
type AnyObj = Object3D & { userData: Record<string, unknown> };

function add(parent: Object3D, geo: BufferGeometry, mat: MeshToonMaterial | ReturnType<typeof flatMat>, x = 0, y = 0, z = 0, outline = true): Mesh {
  const mesh = outlined(geo, mat, outline);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function heartShape(s: number): Shape {
  const sh = new Shape();
  sh.moveTo(0, -0.8 * s);
  sh.bezierCurveTo(-1.2 * s, 0, -0.8 * s, 0.9 * s, 0, 0.35 * s);
  sh.bezierCurveTo(0.8 * s, 0.9 * s, 1.2 * s, 0, 0, -0.8 * s);
  return sh;
}
function starShape(r: number): Shape {
  const sh = new Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  sh.closePath();
  return sh;
}
const extruded = new Map<string, ExtrudeGeometry>();
function extrude(key: string, shape: Shape, depth = 0.06): ExtrudeGeometry {
  let g = extruded.get(key);
  if (!g) {
    g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    extruded.set(key, g);
  }
  return g;
}

const glass = new MeshToonMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.35, gradientMap, side: DoubleSide });

function hat(id: string): Group {
  const g = new Group();
  switch (id) {
    case 'hat_cap': {
      add(g, ellipsoidGeo(0.78, 0.55, 0.78, 20), m(0xe8453c), 0, 0.05, 0);
      add(g, ellipsoidGeo(0.5, 0.07, 0.55, 16), m(0xc23229), 0, 0.0, 0.85).rotation.x = 0.15;
      add(g, sphereGeo(0.1, 8), m(0xffffff), 0, 0.58, 0, false);
      break;
    }
    case 'hat_beanie': {
      add(g, ellipsoidGeo(0.8, 0.6, 0.8, 20), m(0x4da3ff), 0, 0.1, 0);
      add(g, cylGeo(0.8, 0.82, 0.2, 20), m(0xffffff), 0, 0.0, 0);
      add(g, sphereGeo(0.2, 12), m(0xffffff), 0, 0.72, 0);
      break;
    }
    case 'hat_party': {
      const c = add(g, coneGeo(0.5, 1.15, 1, 18), m(0xff6fb5), 0, 0.0, 0);
      c.rotation.z = -0.12;
      for (let i = 0; i < 3; i++) add(c, torusGeo(0.42 - i * 0.13, 0.04, Math.PI * 2, 18), m(0xffe066), 0, 0.22 + i * 0.3, 0, false).rotation.x = Math.PI / 2;
      add(c, sphereGeo(0.14, 10), m(0xffe066), 0, 1.17, 0);
      break;
    }
    case 'hat_crown': {
      add(g, cylGeo(0.62, 0.66, 0.3, 20), m(0xffd23f), 0, 0.12, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.cos(a) * 0.55;
        const z = Math.sin(a) * 0.55;
        add(g, coneGeo(0.14, 0.36, 1, 8), m(0xffd23f), x, 0.25, z);
        add(g, sphereGeo(0.07, 8), m(i % 2 ? 0xff4d6d : 0x4da3ff), x, 0.66, z, false);
      }
      add(g, sphereGeo(0.09, 8), m(0xff4d6d), 0, 0.12, 0.66, false);
      break;
    }
    case 'hat_top': {
      add(g, cylGeo(0.5, 0.52, 0.95, 22), m(0x2c2c3a), 0, 0.5, 0);
      add(g, cylGeo(0.9, 0.9, 0.08, 24), m(0x2c2c3a), 0, 0.02, 0);
      add(g, cylGeo(0.53, 0.53, 0.2, 22), m(0xe8453c), 0, 0.22, 0, false);
      break;
    }
    case 'hat_chef': {
      add(g, cylGeo(0.55, 0.55, 0.45, 22), m(0xffffff), 0, 0.15, 0);
      add(g, sphereGeo(0.52, 14), m(0xffffff), 0, 0.62, 0);
      add(g, sphereGeo(0.34, 12), m(0xffffff), 0.35, 0.5, 0.2);
      add(g, sphereGeo(0.34, 12), m(0xffffff), -0.35, 0.5, -0.1);
      break;
    }
    case 'hat_wizard': {
      const c = add(g, coneGeo(0.68, 1.5, 1, 20), m(0x6a4ccf), 0, 0.0, 0);
      c.rotation.z = 0.12;
      add(g, cylGeo(1.0, 1.0, 0.06, 24), m(0x5a3cbf), 0, 0.0, 0);
      for (const [x, y, z] of [[0.3, 0.35, 0.45], [-0.25, 0.7, 0.3], [0.1, 1.0, 0.2]] as const) add(c, sphereGeo(0.09, 8), flatMat(0xffe066), x * 0.9, y, z * 0.6, false);
      break;
    }
    case 'hat_cowboy': {
      add(g, cylGeo(1.0, 1.0, 0.06, 26), m(0xb5733a), 0, 0.0, 0).scale.set(1, 1, 0.9);
      add(g, cylGeo(0.5, 0.56, 0.5, 20), m(0xc88544), 0, 0.28, 0);
      add(g, cylGeo(0.57, 0.57, 0.1, 20), m(0x6b3f1d), 0, 0.12, 0, false);
      break;
    }
    case 'hat_flower': {
      add(g, torusGeo(0.78, 0.07, Math.PI * 2, 28), m(0x4cbb6b), 0, 0.05, 0.02).rotation.x = Math.PI / 2;
      const cols = [0xff6fb5, 0xffe066, 0xffffff, 0xff9f43, 0xb48cff, 0xff6fb5, 0xffe066, 0xffffff];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(g, sphereGeo(0.16, 8), m(cols[i]!), Math.cos(a) * 0.78, 0.12, Math.sin(a) * 0.78 + 0.02);
      }
      break;
    }
    case 'hat_propeller': {
      add(g, ellipsoidGeo(0.62, 0.45, 0.62, 18), m(0x4da3ff), 0, 0.08, 0);
      add(g, cylGeo(0.63, 0.63, 0.12, 18), m(0xff4d6d), 0, 0.0, 0, false);
      add(g, cylGeo(0.05, 0.05, 0.3, 6), m(0x555555), 0, 0.55, 0, false);
      const blades = new Group();
      blades.position.y = 0.72;
      add(blades, boxGeo(0.9, 0.04, 0.16), m(0xffd23f), 0, 0, 0);
      add(blades, boxGeo(0.16, 0.04, 0.9), m(0xff4d6d), 0, 0.01, 0);
      g.add(blades);
      (g as AnyObj).userData.tick = (t: number): void => {
        blades.rotation.y = t * 14;
      };
      break;
    }
    case 'hat_helmet': {
      const bubble = new Mesh(ellipsoidGeo(1.25, 1.1, 1.2, 28), glass);
      bubble.position.set(0, -0.8, 0);
      g.add(bubble);
      add(g, torusGeo(0.95, 0.14, Math.PI * 2, 28), m(0xe9eef7), 0, -1.55, 0).rotation.x = Math.PI / 2;
      add(g, boxGeo(0.34, 0.2, 0.2), m(0xff4d6d), 0.95, -1.3, 0.2);
      break;
    }
    default:
      break;
  }
  return g;
}

function glasses(id: string): Group {
  const g = new Group();
  const frame = m(0x2a2a35);
  switch (id) {
    case 'gl_round': {
      for (const s of [-1, 1]) {
        add(g, torusGeo(0.3, 0.045, Math.PI * 2, 24), frame, s * 0.4, 0, 0, false);
        add(g, ellipsoidGeo(0.28, 0.28, 0.01, 14), glass, s * 0.4, 0, 0, false);
      }
      add(g, boxGeo(0.2, 0.05, 0.05), frame, 0, 0.08, 0, false);
      break;
    }
    case 'gl_sun': {
      for (const s of [-1, 1]) add(g, ellipsoidGeo(0.33, 0.27, 0.05, 16), m(0x15151c), s * 0.4, 0, 0.01);
      add(g, boxGeo(0.25, 0.06, 0.05), frame, 0, 0.1, 0, false);
      add(g, boxGeo(1.6, 0.05, 0.05), frame, 0, 0.14, -0.05, false);
      break;
    }
    case 'gl_heart': {
      for (const s of [-1, 1]) add(g, extrude('heart', heartShape(0.3)), m(0xff4d6d), s * 0.4, 0.02, 0.0);
      add(g, boxGeo(0.2, 0.05, 0.05), frame, 0, 0.1, 0, false);
      break;
    }
    case 'gl_star': {
      for (const s of [-1, 1]) add(g, extrude('star', starShape(0.36)), m(0xffd23f), s * 0.4, 0.0, 0.0);
      add(g, boxGeo(0.2, 0.05, 0.05), frame, 0, 0.1, 0, false);
      break;
    }
    case 'gl_goggles': {
      for (const s of [-1, 1]) {
        add(g, torusGeo(0.3, 0.09, Math.PI * 2, 22), m(0x8a5a2b), s * 0.4, 0, 0.0);
        add(g, cylGeo(0.3, 0.3, 0.05, 16), m(0x7fd1ff), s * 0.4, 0, 0.0, false).rotation.x = Math.PI / 2;
      }
      add(g, boxGeo(0.22, 0.09, 0.07), m(0x8a5a2b), 0, 0, 0, false);
      break;
    }
    default:
      break;
  }
  return g;
}

function bow(id: string): Group {
  const g = new Group();
  const color = getItem(id)?.color ?? 0xff4d6d;
  const mat = m(color);
  for (const s of [-1, 1]) {
    const wing = add(g, coneGeo(0.3, 0.6, 0.5, 12), mat, s * 0.62, 0, 0);
    wing.rotation.z = s * (Math.PI / 2);
  }
  add(g, sphereGeo(0.16, 12), mat, 0, 0, 0.02);
  if (id === 'bow_dots') {
    for (const [x, y] of [[0.4, 0.1], [0.5, -0.08], [-0.4, 0.1], [-0.5, -0.08]] as const) add(g, sphereGeo(0.05, 6), m(0xffffff), x, y, 0.12, false);
  }
  g.rotation.z = -0.35;
  g.scale.setScalar(1.05);
  return g;
}

function scarf(id: string): Group {
  const g = new Group();
  const color = getItem(id)?.color ?? 0xff4d4d;
  const mat = m(color);
  const ring = add(g, torusGeo(0.6, 0.2, Math.PI * 2, 28), mat, 0, 0, 0.0);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1.05, 0.85, 1);
  const tail = add(g, boxGeo(0.34, 0.8, 0.12), mat, 0.28, -0.42, 0.55);
  tail.rotation.z = 0.12;
  if (id === 'sc_stripe') {
    for (let i = 0; i < 3; i++) add(tail, boxGeo(0.36, 0.1, 0.14), m(0xffffff), 0, -0.25 + i * 0.25, 0, false);
    const white = add(g, torusGeo(0.6, 0.205, Math.PI * 0.4, 12), m(0xffffff), 0, 0.01, 0, false);
    white.rotation.x = Math.PI / 2;
    white.rotation.z = Math.PI * 0.8;
    white.scale.set(1.05, 0.85, 1);
  }
  return g;
}

export function buildAccessory(id: string): Object3D | null {
  const kind = getItem(id)?.kind;
  switch (kind) {
    case 'hat':
      return hat(id);
    case 'glasses':
      return glasses(id);
    case 'bow':
      return bow(id);
    case 'scarf':
      return scarf(id);
    default:
      return null;
  }
}
