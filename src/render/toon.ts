import {
  BackSide,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  type Material,
  type Object3D,
} from 'three';
import { COLORS } from '../config';

// ---- общие ресурсы (геометрии и материалы переиспользуются) ----
const gradientData = new Uint8Array([110, 190, 255]);
export const gradientMap = new DataTexture(gradientData, gradientData.length, 1, RedFormat);
gradientMap.minFilter = NearestFilter;
gradientMap.magFilter = NearestFilter;
gradientMap.needsUpdate = true;

const toonCache = new Map<number, MeshToonMaterial>();
export function toonMat(color: number): MeshToonMaterial {
  let m = toonCache.get(color);
  if (!m) {
    m = new MeshToonMaterial({ color, gradientMap });
    toonCache.set(color, m);
  }
  return m;
}

/** Собственный (не из кэша) материал — когда цвет будет меняться (окрас кота, обои). */
export function ownToonMat(color: number): MeshToonMaterial {
  return new MeshToonMaterial({ color, gradientMap });
}

export const OUTLINE_THICKNESS = 0.035;
export const outlineMat = new MeshBasicMaterial({ color: COLORS.outline, side: BackSide });
outlineMat.onBeforeCompile = (shader) => {
  shader.uniforms.uThick = { value: OUTLINE_THICKNESS };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uThick;')
    .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normalize(normal) * uThick;');
};
outlineMat.customProgramCacheKey = () => 'murzik-outline';

export const basicMat = (color: number): MeshBasicMaterial => new MeshBasicMaterial({ color });
const basicCache = new Map<number, MeshBasicMaterial>();
export function flatMat(color: number): MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) {
    m = new MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

const geoCache = new Map<string, BufferGeometry>();
function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function ellipsoidGeo(rx: number, ry: number, rz: number, seg = 24): BufferGeometry {
  return cached(`e:${rx}:${ry}:${rz}:${seg}`, () => {
    const g = new SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.65)));
    g.scale(rx, ry, rz);
    return g;
  });
}
export function coneGeo(r: number, h: number, flatZ = 0.6, seg = 16): BufferGeometry {
  return cached(`c:${r}:${h}:${flatZ}:${seg}`, () => {
    const g = new ConeGeometry(r, h, seg);
    g.translate(0, h / 2, 0);
    g.scale(1, 1, flatZ);
    return g;
  });
}
export function capsuleGeo(r: number, len: number, seg = 12): BufferGeometry {
  return cached(`k:${r}:${len}:${seg}`, () => new CapsuleGeometry(r, len, 6, seg));
}
export function cylGeo(rt: number, rb: number, h: number, seg = 20): BufferGeometry {
  return cached(`y:${rt}:${rb}:${h}:${seg}`, () => new CylinderGeometry(rt, rb, h, seg));
}
export function boxGeo(w: number, h: number, d: number): BufferGeometry {
  return cached(`b:${w}:${h}:${d}`, () => new BoxGeometry(w, h, d));
}
export function torusGeo(r: number, tube: number, arc = Math.PI * 2, seg = 28): BufferGeometry {
  return cached(`t:${r}:${tube}:${arc}:${seg}`, () => new TorusGeometry(r, tube, 10, seg, arc));
}
export function sphereGeo(r: number, seg = 16): BufferGeometry {
  return ellipsoidGeo(r, r, r, seg);
}

const noRaycast = (): void => undefined;

/** Меш с контуром (инвертированная оболочка). Контур не участвует в raycast. */
export function outlined(geo: BufferGeometry, mat: Material, outline = true): Mesh {
  const m = new Mesh(geo, mat);
  if (outline) {
    const o = new Mesh(geo, outlineMat);
    o.raycast = noRaycast;
    o.name = 'outline';
    m.add(o);
  }
  return m;
}

export function at<T extends Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

export function group(...children: Object3D[]): Group {
  const g = new Group();
  children.forEach((c) => g.add(c));
  return g;
}
