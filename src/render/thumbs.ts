import {
  AmbientLight,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { COLORS } from '../config';
import { getItem } from '../logic/catalog';
import { buildAccessory } from './accessories';
import { coneGeo, ellipsoidGeo, flatMat, outlined, sphereGeo, toonMat } from './toon';

const SIZE = 144;

/** Миниатюры предметов: рисуем аксессуар на «голове» в маленькой сцене и снимаем в картинку. */
export class Thumbs {
  private cache = new Map<string, string>();
  private scene = new Scene();
  private cam = new PerspectiveCamera(30, 1, 0.1, 50);
  private rt = new WebGLRenderTarget(SIZE, SIZE);
  private holder = new Group();
  private buf = new Uint8Array(SIZE * SIZE * 4);
  private canvas = document.createElement('canvas');

  constructor(private renderer: WebGLRenderer) {
    this.rt.texture.colorSpace = SRGBColorSpace;
    this.canvas.width = this.canvas.height = SIZE;
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, 4, 6);
    this.scene.add(sun);
    this.scene.add(this.holder);
    const head = new Group();
    head.add(outlined(ellipsoidGeo(1.05, 0.88, 0.95, 24), toonMat(COLORS.furOrange)));
    for (const s of [-1, 1]) {
      const ear = outlined(coneGeo(0.4, 0.82, 0.55), toonMat(COLORS.furOrange));
      ear.position.set(s * 0.64, 0.7, -0.04);
      ear.rotation.z = -s * 0.35;
      head.add(ear);
      const eye = outlined(ellipsoidGeo(0.3, 0.37, 0.22, 14), toonMat(0xffffff));
      eye.position.set(s * 0.4, 0.15, 0.78);
      head.add(eye);
      const pupil = new Group();
      pupil.add(outlined(sphereGeo(0.17, 8), flatMat(COLORS.pupil), false));
      pupil.position.set(s * 0.4, 0.15, 0.93);
      head.add(pupil);
    }
    this.holder.add(head);
    this.holder.userData.head = head;
  }

  /** Возвращает dataURL (PNG с прозрачностью). Для «не-предметов» — пустая строка. */
  get(id: string): string {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    const item = getItem(id);
    let url = '';
    if (item && ['hat', 'glasses', 'bow', 'scarf'].includes(item.kind)) {
      try {
        url = this.render(id, item.kind);
      } catch {
        url = '';
      }
    }
    this.cache.set(id, url);
    return url;
  }

  private render(id: string, kind: string): string {
    const obj = buildAccessory(id);
    if (!obj) return '';
    const pos = {
      hat: [0, 0.8, 0.02],
      glasses: [0, 0.15, 1.02],
      bow: [0.72, 0.62, 0.3],
      scarf: [0, -0.78, 0.02],
    }[kind]!;
    obj.position.set(pos[0]!, pos[1]!, pos[2]!);
    this.holder.add(obj);
    // кадр зависит от вида предмета
    const frame = {
      hat: { y: 0.55, d: 7.2 },
      glasses: { y: 0.1, d: 5.6 },
      bow: { y: 0.4, d: 6.4 },
      scarf: { y: -0.5, d: 7 },
    }[kind]!;
    if (id === 'hat_helmet') {
      frame.y = -0.2;
      frame.d = 8;
    }
    this.cam.position.set(0, frame.y + 0.25, frame.d);
    this.cam.lookAt(0, frame.y, 0);
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearAlpha(0);
    r.clear();
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, SIZE, SIZE, this.buf);
    r.setRenderTarget(prevTarget);
    r.setClearAlpha(prevAlpha);
    this.holder.remove(obj);
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    // переворот по вертикали
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      img.data.set(this.buf.subarray(src, src + SIZE * 4), y * SIZE * 4);
    }
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
