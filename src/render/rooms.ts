import { BufferGeometry, CanvasTexture, Group, Material, Mesh, MeshToonMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from 'three';
import { WORLD } from '../config';
import {
  boxGeo,
  capsuleGeo,
  coneGeo,
  cylGeo,
  ellipsoidGeo,
  flatMat,
  gradientMap,
  outlined,
  ownToonMat,
  sphereGeo,
  toonMat,
  torusGeo,
} from './toon';

export type RoomId = 'living' | 'kitchen' | 'bath' | 'bedroom';
export const ROOM_ORDER: RoomId[] = ['living', 'kitchen', 'bath', 'bedroom'];

export type PatternKind = 'stripes' | 'dots' | 'planks' | 'tiles' | 'plain';

function patternTexture(kind: PatternKind): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,0,0,0.09)';
  g.fillStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 4;
  switch (kind) {
    case 'stripes':
      g.fillRect(0, 0, 128, 256);
      break;
    case 'dots':
      for (let y = 32; y < 256; y += 64) for (let x = 32 + ((y / 64) % 2) * 32; x < 256; x += 64) {
        g.beginPath();
        g.arc(x, y, 10, 0, 7);
        g.fill();
      }
      break;
    case 'planks':
      for (let y = 0; y < 256; y += 64) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y);
        g.stroke();
        const off = (y / 64) % 2 ? 64 : 160;
        g.beginPath();
        g.moveTo(off, y);
        g.lineTo(off, y + 64);
        g.stroke();
      }
      break;
    case 'tiles':
      g.lineWidth = 6;
      for (let i = 0; i <= 256; i += 128) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 256);
        g.moveTo(0, i);
        g.lineTo(256, i);
        g.stroke();
      }
      break;
    default:
      break;
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

const patternCache = new Map<PatternKind, CanvasTexture>();
function pattern(kind: PatternKind, rx: number, ry: number): CanvasTexture {
  let base = patternCache.get(kind);
  if (!base) {
    base = patternTexture(kind);
    patternCache.set(kind, base);
  }
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return t;
}

function mk(
  parent: Group,
  geo: BufferGeometry,
  mat: Material,
  x: number,
  y: number,
  z: number,
  outline = true,
): Mesh {
  const m = outlined(geo, mat, outline);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export interface Interactive {
  id: string;
  mesh: Mesh;
}

/** Комната: стена, пол и обстановка из примитивов. */
export class Room {
  readonly group = new Group();
  readonly wallMat: MeshToonMaterial;
  readonly floorMat: MeshToonMaterial;
  readonly interactives: Interactive[] = [];
  /** Точки, куда кот идёт по делам (локальные X) */
  spots: Record<string, number> = {};
  lampShade: Mesh | null = null;
  private lampOn = true;
  private lampMats: { on: Material; off: Material } | null = null;
  private seconds = 0;
  private bob: { m: Mesh; y: number; ph: number }[] = [];

  constructor(
    readonly id: RoomId,
    index: number,
    wallPattern: PatternKind,
    floorPattern: PatternKind,
    wallColor: number,
    floorColor: number,
  ) {
    this.group.position.x = index * WORLD.roomSpacing;
    this.wallMat = new MeshToonMaterial({ color: wallColor, map: pattern(wallPattern, wallPattern === 'tiles' ? 6 : 6, wallPattern === 'tiles' ? 8 : 1), gradientMap });
    this.floorMat = new MeshToonMaterial({ color: floorColor, map: pattern(floorPattern, 3, 4), gradientMap });
    const wall = new Mesh(new PlaneGeometry(WORLD.roomSpacing, 18), this.wallMat);
    wall.position.set(0, 9, -2.6);
    this.group.add(wall);
    const floor = new Mesh(new PlaneGeometry(WORLD.roomSpacing, 14), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 4.4);
    this.group.add(floor);
    const board = new Mesh(boxGeo(WORLD.roomSpacing, 0.55, 0.2), toonMat(0xffffff));
    board.position.set(0, 0.28, -2.5);
    this.group.add(board);
    // зазор между комнатами — вертикальный молдинг
    for (const s of [-1, 1]) {
      const mold = new Mesh(boxGeo(0.18, 18, 0.3), toonMat(0xfff4e0));
      mold.position.set(s * (WORLD.roomSpacing / 2), 9, -2.5);
      this.group.add(mold);
    }
    this.build();
  }

  setWall(color: number): void {
    this.wallMat.color.setHex(color);
  }
  setFloor(color: number): void {
    this.floorMat.color.setHex(color);
  }

  setLamp(on: boolean): void {
    this.lampOn = on;
    if (this.lampShade && this.lampMats) this.lampShade.material = on ? this.lampMats.on : this.lampMats.off;
  }
  get lamp(): boolean {
    return this.lampOn;
  }

  private tag(id: string, mesh: Mesh): void {
    this.interactives.push({ id, mesh });
  }

  update(dt: number): void {
    this.seconds += dt;
    for (const b of this.bob) b.m.position.y = b.y + Math.sin(this.seconds * 1.6 + b.ph) * 0.12;
  }

  private build(): void {
    switch (this.id) {
      case 'living':
        return this.buildLiving();
      case 'kitchen':
        return this.buildKitchen();
      case 'bath':
        return this.buildBath();
      case 'bedroom':
        return this.buildBedroom();
    }
  }

  private windowFrame(x: number, y: number, w: number, h: number, sky: number, night = false): void {
    const g = this.group;
    mk(g, boxGeo(w + 0.5, h + 0.5, 0.2), toonMat(0xffffff), x, y, -2.45);
    mk(g, boxGeo(w, h, 0.1), flatMat(sky), x, y, -2.3, false);
    mk(g, boxGeo(0.12, h, 0.12), toonMat(0xffffff), x, y, -2.25, false);
    mk(g, boxGeo(w, 0.12, 0.12), toonMat(0xffffff), x, y, -2.25, false);
    if (night) {
      mk(g, sphereGeo(0.55, 18), flatMat(0xfff3b0), x - w * 0.22, y + h * 0.22, -2.2, false);
      mk(g, sphereGeo(0.46, 18), flatMat(sky), x - w * 0.22 + 0.2, y + h * 0.22 + 0.1, -2.18, false);
      for (const [dx, dy, s] of [[0.25, 0.25, 0.12], [0.3, -0.15, 0.09], [-0.05, -0.28, 0.1], [0.05, 0.05, 0.07]] as const) {
        mk(g, sphereGeo(s, 8), flatMat(0xffffff), x + dx * w, y + dy * h, -2.2, false);
      }
    } else {
      mk(g, sphereGeo(0.55, 18), flatMat(0xffe066), x + w * 0.2, y + h * 0.2, -2.2, false);
      mk(g, ellipsoidGeo(0.7, 0.28, 0.1, 14), flatMat(0xffffff), x - w * 0.2, y - h * 0.05, -2.2, false);
      mk(g, ellipsoidGeo(0.5, 0.2, 0.1, 14), flatMat(0xffffff), x - w * 0.05, y - h * 0.15, -2.2, false);
    }
  }

  private buildLiving(): void {
    const g = this.group;
    // ковёр
    mk(g, cylGeo(2.7, 2.7, 0.06, 40), toonMat(0xff9fb8), 0, 0.04, 1.2, false).scale.set(1, 1, 0.55);
    mk(g, cylGeo(1.9, 1.9, 0.08, 40), toonMat(0xffd1dc), 0, 0.05, 1.2, false).scale.set(1, 1, 0.55);
    // окно
    this.windowFrame(-1.9, 8.6, 3.0, 3.4, 0x8fd3ff);
    mk(g, boxGeo(0.9, 4.2, 0.25), toonMat(0xff8fa3), -3.9, 8.3, -2.2);
    mk(g, boxGeo(0.9, 4.2, 0.25), toonMat(0xff8fa3), 0.1, 8.3, -2.2);
    // картины
    mk(g, boxGeo(1.7, 1.3, 0.12), toonMat(0xffffff), 2.5, 9.2, -2.45);
    mk(g, boxGeo(1.4, 1.0, 0.1), flatMat(0xbfe6ff), 2.5, 9.2, -2.37, false);
    mk(g, sphereGeo(0.28, 12), flatMat(0xffd23f), 2.3, 9.35, -2.3, false);
    mk(g, coneGeo(0.5, 0.6, 0.2), flatMat(0x7bd88f), 2.7, 8.95, -2.3, false);
    // диван
    const sofa = toonMat(0x4cc9c0);
    mk(g, boxGeo(4.4, 1.1, 1.3), sofa, -1.2, 0.8, -1.7);
    mk(g, boxGeo(4.4, 1.9, 0.5), sofa, -1.2, 1.7, -2.15);
    mk(g, boxGeo(0.6, 1.5, 1.3), toonMat(0x3ab3aa), -3.3, 1.1, -1.7);
    mk(g, boxGeo(0.6, 1.5, 1.3), toonMat(0x3ab3aa), 0.9, 1.1, -1.7);
    mk(g, boxGeo(1.4, 0.35, 1.0), toonMat(0xffd166), -1.9, 1.5, -1.6).rotation.z = 0.05;
    mk(g, boxGeo(1.3, 0.35, 1.0), toonMat(0xff8fa3), -0.5, 1.5, -1.6).rotation.z = -0.04;
    // телевизор — вход в мини-игры
    mk(g, boxGeo(0.35, 1.7, 0.35), toonMat(0x8a6a4f), 2.8, 0.9, -1.8);
    mk(g, boxGeo(1.5, 0.12, 1.0), toonMat(0x8a6a4f), 2.8, 0.1, -1.8);
    const tv = mk(g, boxGeo(2.7, 1.9, 0.3), toonMat(0x2b2f4a), 2.8, 2.9, -1.9);
    mk(g, boxGeo(2.3, 1.5, 0.05), flatMat(0x6ee7b7), 2.8, 2.9, -1.72, false);
    mk(g, sphereGeo(0.28, 12), flatMat(0xffd23f), 2.4, 3.1, -1.68, false);
    mk(g, sphereGeo(0.18, 12), flatMat(0xff6b81), 3.1, 2.8, -1.68, false);
    mk(g, boxGeo(0.5, 0.5, 0.05), flatMat(0x6a5acd), 2.9, 2.5, -1.68, false);
    this.tag('tv', tv);
    // торшер
    mk(g, cylGeo(0.5, 0.5, 0.12, 20), toonMat(0x6b5b95), -3.3, 0.08, -0.6);
    mk(g, cylGeo(0.08, 0.08, 4.8, 8), toonMat(0x6b5b95), -3.3, 2.5, -0.6, false);
    mk(g, cylGeo(0.45, 0.8, 0.9, 20), flatMat(0xffe9a8), -3.3, 5.1, -0.6);
    // растение
    mk(g, cylGeo(0.5, 0.38, 0.8, 16), toonMat(0xff7f50), 3.2, 0.4, 0.6);
    mk(g, sphereGeo(0.7, 14), toonMat(0x4cbb6b), 3.2, 1.3, 0.6);
    mk(g, sphereGeo(0.5, 12), toonMat(0x5ed07c), 2.9, 1.8, 0.6);
    mk(g, sphereGeo(0.45, 12), toonMat(0x5ed07c), 3.5, 1.7, 0.5);
    this.spots = { tv: 2.6, rug: 0, ball: 0 };
  }

  private buildKitchen(): void {
    const g = this.group;
    // шкафчики
    mk(g, boxGeo(4.6, 1.8, 1.4), toonMat(0xfff1c9), -2.0, 0.9, -1.7);
    mk(g, boxGeo(4.8, 0.2, 1.5), toonMat(0xc9b8a0), -2.0, 1.9, -1.7);
    for (let i = 0; i < 3; i++) {
      mk(g, boxGeo(1.4, 1.5, 0.06), toonMat(0xffe39a), -3.2 + i * 1.5, 0.95, -0.98, false);
      mk(g, sphereGeo(0.08, 8), toonMat(0x8a6a4f), -2.7 + i * 1.5, 1.2, -0.92, false);
    }
    mk(g, boxGeo(4.4, 1.7, 0.9), toonMat(0xffe39a), -2.0, 7.4, -2.1);
    for (let i = 0; i < 3; i++) mk(g, boxGeo(1.35, 1.5, 0.06), toonMat(0xfff1c9), -3.3 + i * 1.5, 7.4, -1.62, false);
    // плита и кастрюля
    mk(g, cylGeo(0.5, 0.5, 0.06, 20), flatMat(0x333333), -3.2, 2.03, -1.6, false);
    mk(g, cylGeo(0.5, 0.5, 0.06, 20), flatMat(0x333333), -2.0, 2.03, -1.6, false);
    mk(g, cylGeo(0.5, 0.45, 0.6, 16), toonMat(0xb0b8c4), -2.0, 2.4, -1.6);
    mk(g, sphereGeo(0.08, 8), toonMat(0x333333), -2.0, 2.78, -1.6, false);
    // окно и часы
    this.windowFrame(-1.8, 5.0, 2.2, 2.0, 0x8fd3ff);
    mk(g, cylGeo(0.7, 0.7, 0.12, 24), toonMat(0xffffff), 0.3, 6.4, -2.4).rotation.x = Math.PI / 2;
    mk(g, boxGeo(0.06, 0.4, 0.04), flatMat(0x222222), 0.3, 6.5, -2.3, false);
    mk(g, boxGeo(0.3, 0.06, 0.04), flatMat(0x222222), 0.45, 6.4, -2.3, false);
    // холодильник — вход в «покормить»
    const fridge = mk(g, boxGeo(2.1, 5.4, 1.5), toonMat(0xd7f3ff), 2.75, 2.7, -1.5);
    mk(g, boxGeo(2.0, 0.08, 0.05), flatMat(0x7aa7bd), 2.75, 3.9, -0.73, false);
    mk(g, boxGeo(0.12, 1.1, 0.14), toonMat(0x8aa4b4), 2.05, 4.6, -0.7, false);
    mk(g, boxGeo(0.12, 1.5, 0.14), toonMat(0x8aa4b4), 2.05, 2.7, -0.7, false);
    mk(g, boxGeo(0.45, 0.45, 0.05), flatMat(0xff6b81), 3.2, 4.8, -0.72, false);
    mk(g, boxGeo(0.4, 0.4, 0.05), flatMat(0xffd23f), 3.3, 4.1, -0.72, false);
    this.tag('fridge', fridge);
    // коврик
    mk(g, boxGeo(3.0, 0.05, 1.4), toonMat(0xff9fb8), 0, 0.04, 1.7, false);
    this.spots = { fridge: 1.5 };
  }

  private buildBath(): void {
    const g = this.group;
    // ванна
    mk(g, boxGeo(4.4, 1.5, 2.0), toonMat(0xffffff), -1.5, 0.85, -1.2);
    mk(g, boxGeo(3.9, 0.2, 1.5), flatMat(0x9fdcff), -1.5, 1.55, -1.2, false);
    for (const x of [-3.4, 0.4]) mk(g, cylGeo(0.12, 0.2, 0.3, 8), toonMat(0xb0b8c4), x, 0.1, -0.6, false);
    mk(g, cylGeo(0.07, 0.07, 0.9, 8), toonMat(0xb0b8c4), -3.4, 2.1, -2.1, false);
    mk(g, cylGeo(0.07, 0.07, 0.6, 8), toonMat(0xb0b8c4), -3.1, 2.6, -2.1, false).rotation.z = Math.PI / 2;
    // уточка
    const duck = new Group();
    mk(duck, sphereGeo(0.34, 14), toonMat(0xffd23f), 0, 0, 0);
    mk(duck, sphereGeo(0.22, 12), toonMat(0xffd23f), 0.22, 0.28, 0);
    mk(duck, coneGeo(0.09, 0.2, 0.5, 8), toonMat(0xff8c42), 0.45, 0.26, 0, false).rotation.z = -Math.PI / 2;
    duck.position.set(-0.4, 1.95, -1.0);
    g.add(duck);
    // зеркало
    mk(g, cylGeo(1.2, 1.2, 0.1, 28), toonMat(0xffb3c6), 0.3, 7.5, -2.45).rotation.x = Math.PI / 2;
    mk(g, cylGeo(1.0, 1.0, 0.08, 28), flatMat(0xcfeeff), 0.3, 7.5, -2.38, false).rotation.x = Math.PI / 2;
    // полотенце
    mk(g, boxGeo(1.2, 0.08, 0.12), toonMat(0xb0b8c4), -3.2, 6.2, -2.4, false);
    mk(g, boxGeo(0.9, 1.7, 0.1), toonMat(0xff8fa3), -3.2, 5.4, -2.3);
    // душ
    mk(g, cylGeo(0.09, 0.09, 8, 8), toonMat(0xb0b8c4), 3.4, 4, -2.2, false);
    mk(g, cylGeo(0.09, 0.09, 1.5, 8), toonMat(0xb0b8c4), 2.7, 8, -2.2, false).rotation.z = Math.PI / 2;
    const head = mk(g, coneGeo(0.5, 0.6, 1, 16), toonMat(0xdfe6ee), 2.0, 7.6, -2.0);
    head.rotation.x = Math.PI;
    head.position.y = 8.1;
    this.tag('shower', head);
    // горшок
    const potty = new Group();
    mk(potty, cylGeo(0.7, 0.8, 0.7, 20), toonMat(0x7fd1ff), 0, 0.35, 0);
    mk(potty, cylGeo(0.62, 0.62, 0.1, 20), toonMat(0xffffff), 0, 0.75, 0);
    mk(potty, boxGeo(1.1, 0.9, 0.35), toonMat(0x7fd1ff), 0, 0.85, -0.55);
    potty.position.set(2.6, 0, 0.5);
    g.add(potty);
    this.tag('potty', potty.children[0] as Mesh);
    // ковёр
    mk(g, cylGeo(1.6, 1.6, 0.05, 30), toonMat(0xc9b8ff), -0.4, 0.04, 1.4, false).scale.set(1, 1, 0.5);
    // пузыри-декор
    for (let i = 0; i < 4; i++) {
      const b = mk(g, sphereGeo(0.14 + i * 0.03, 10), flatMat(0xdff6ff), -2.5 + i * 0.7, 2.8 + (i % 2) * 0.6, -1.0, false);
      this.bob.push({ m: b, y: b.position.y, ph: i * 1.3 });
    }
    this.spots = { shower: 0, potty: 2.4 };
  }

  private buildBedroom(): void {
    const g = this.group;
    // кровать
    mk(g, boxGeo(5.2, 0.9, 2.6), toonMat(0x9b6b4a), 0, 0.6, -1.2);
    mk(g, boxGeo(0.3, 2.6, 2.6), toonMat(0x7a5238), -2.75, 1.5, -1.2);
    mk(g, boxGeo(0.3, 1.7, 2.6), toonMat(0x7a5238), 2.75, 1.1, -1.2);
    mk(g, boxGeo(4.8, 0.7, 2.3), toonMat(0xfff7ec), 0, 1.3, -1.2);
    mk(g, boxGeo(3.0, 0.45, 2.4), toonMat(0x6ec6ff), 1.0, 1.75, -1.2);
    mk(g, ellipsoidGeo(0.95, 0.35, 0.7, 16), toonMat(0xffffff), -1.8, 1.85, -1.1);
    // звёздочки на одеяле
    for (const [x, z] of [[0.3, -1.6], [1.5, -0.8], [2.0, -1.8]] as const) mk(g, sphereGeo(0.12, 8), flatMat(0xffe066), x, 2.0, z, false);
    // окно с луной
    this.windowFrame(-2.0, 7.4, 3.0, 3.4, 0x1b2a6b, true);
    // тумба и лампа
    mk(g, boxGeo(1.6, 1.6, 1.3), toonMat(0xc89b6d), 3.1, 0.8, -1.4);
    mk(g, boxGeo(1.4, 0.06, 1.1), toonMat(0xa8794d), 3.1, 1.2, -0.76, false);
    mk(g, cylGeo(0.35, 0.45, 0.25, 16), toonMat(0xb48cff), 3.1, 1.75, -1.4);
    mk(g, cylGeo(0.07, 0.07, 0.8, 8), toonMat(0xb48cff), 3.1, 2.25, -1.4, false);
    const onMat = flatMat(0xffe27a);
    const offMat = flatMat(0x8a7a50);
    this.lampMats = { on: onMat, off: offMat };
    const shade = mk(g, cylGeo(0.45, 0.75, 0.9, 20), onMat, 3.1, 3.0, -1.4);
    this.lampShade = shade;
    this.tag('lamp', shade);
    // ковёр и мишка
    mk(g, cylGeo(2.4, 2.4, 0.05, 36), toonMat(0xb3a1ff), 0, 0.04, 1.8, false).scale.set(1, 1, 0.5);
    const bear = new Group();
    mk(bear, sphereGeo(0.5, 14), toonMat(0xc79a6d), 0, 0.5, 0);
    mk(bear, sphereGeo(0.34, 14), toonMat(0xc79a6d), 0, 1.1, 0.05);
    mk(bear, sphereGeo(0.13, 8), toonMat(0xc79a6d), -0.25, 1.4, 0.0);
    mk(bear, sphereGeo(0.13, 8), toonMat(0xc79a6d), 0.25, 1.4, 0.0);
    mk(bear, sphereGeo(0.06, 8), flatMat(0x222222), -0.11, 1.15, 0.36, false);
    mk(bear, sphereGeo(0.06, 8), flatMat(0x222222), 0.11, 1.15, 0.36, false);
    bear.position.set(-3.1, 0, 0.9);
    bear.scale.setScalar(0.9);
    g.add(bear);
    // мобиль-звёзды
    for (let i = 0; i < 3; i++) {
      mk(g, cylGeo(0.02, 0.02, 1.0 + i * 0.5, 4), flatMat(0xffffff), 0.9 + i * 1.1, 9.4 - i * 0.25, -2.0, false);
      const s = mk(g, sphereGeo(0.22, 8), flatMat(0xffe066), 0.9 + i * 1.1, 8.9 - i * 0.5, -2.0, false);
      this.bob.push({ m: s, y: s.position.y, ph: i * 2 });
    }
    void capsuleGeo;
    void ownToonMat;
    void torusGeo;
    this.spots = { bed: 0, lamp: 3.0 };
  }
}

export function createRooms(
  wall: Record<RoomId, number>,
  floor: Record<RoomId, number>,
): Record<RoomId, Room> {
  return {
    living: new Room('living', 0, 'stripes', 'planks', wall.living, floor.living),
    kitchen: new Room('kitchen', 1, 'tiles', 'tiles', wall.kitchen, floor.kitchen),
    bath: new Room('bath', 2, 'tiles', 'tiles', wall.bath, floor.bath),
    bedroom: new Room('bedroom', 3, 'dots', 'planks', wall.bedroom, floor.bedroom),
  };
}

export const roomCenterX = (id: RoomId): number => ROOM_ORDER.indexOf(id) * WORLD.roomSpacing;
