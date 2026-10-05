import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { WORLD } from '../config';
import { clamp, lerp } from '../logic/math';

const FOV = 38;

/** Сцена, камера и свет. Камера всегда смотрит на комнату по ширине экрана (портрет). */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 0.5, 0.5, 120);
  readonly raycaster = new Raycaster();
  private ambient = new AmbientLight(0xffffff, 1.35);
  private sun = new DirectionalLight(0xffffff, 1.9);
  private plane = new Plane(new Vector3(0, 0, 1), 0);
  private ndc = new Vector2();
  camX = 0;
  private lookY = 5.2;
  width = 1;
  height = 1;
  private night = 0;
  private shift = 0;
  private dayBg = new Color(0xffe3c7);
  private nightBg = new Color(0x141a3a);
  private bg = new Color();
  private ambDay = new Color(0xffffff);
  private ambNight = new Color(0x7f8cff);
  private sunDay = new Color(0xffffff);
  private sunNight = new Color(0x7a86ff);

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.add(this.ambient);
    this.sun.position.set(3, 9, 9);
    this.scene.add(this.sun);
    this.scene.background = this.bg.copy(this.dayBg);
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    const distW = WORLD.roomWidth / 2 / (tanHalf * this.camera.aspect);
    const distH = 15 / 2 / tanHalf;
    const dist = Math.max(distW, distH);
    this.camera.position.set(this.camX, this.lookY + dist * 0.085, dist);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camX, this.lookY, 0);
    this.camera.updateMatrixWorld(true);
    if (Math.abs(this.shift) >= 0.001) this.applyShift();
  }

  setCameraX(x: number): void {
    this.camX = x;
    this.camera.position.x = x;
    this.camera.lookAt(x, this.lookY, 0);
    this.camera.updateMatrixWorld(true);
  }

  /** 0 — день, 1 — «свет выключен» */
  setNight(n: number): void {
    n = clamp(n, 0, 1);
    if (Math.abs(n - this.night) < 0.002) return;
    this.night = n;
    this.ambient.intensity = lerp(1.35, 0.75, n);
    this.sun.intensity = lerp(1.9, 0.55, n);
    this.ambient.color.copy(this.ambDay).lerp(this.ambNight, n);
    this.sun.color.copy(this.sunDay).lerp(this.sunNight, n);
    this.bg.copy(this.dayBg).lerp(this.nightBg, n);
  }
  get nightLevel(): number {
    return this.night;
  }

  /** Точка на плоскости кота (z=0) под пальцем. */
  pointerToWorld(clientX: number, clientY: number, out: Vector3): Vector3 {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, out);
    if (!hit) out.set(0, 0, 0);
    return out;
  }

  worldToScreen(v: Vector3, out: { x: number; y: number }): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    out.x = r.left + ((p.x + 1) / 2) * r.width;
    out.y = r.top + ((1 - p.y) / 2) * r.height;
    return out;
  }

  /** Сколько мировых единиц в одном пикселе на плоскости кота. */
  worldPerPixel(): number {
    const a = this.pointerToWorld(0, 0, new Vector3());
    const b = this.pointerToWorld(this.canvas.getBoundingClientRect().width, 0, new Vector3());
    return Math.abs(b.x - a.x) / this.canvas.getBoundingClientRect().width;
  }

  /** Сдвиг кадра вверх (доля высоты) — чтобы панель снизу не закрывала кота. */
  setFocusShift(f: number): void {
    if (Math.abs(f - this.shift) < 0.0005) return;
    this.shift = f;
    this.applyShift();
  }
  private applyShift(): void {
    if (Math.abs(this.shift) < 0.001) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, 0, this.shift * this.height, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
