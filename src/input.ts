import { Vector3 } from 'three';
import { GESTURE, WORLD } from './config';
import { GestureTracker, TapCounter, type GestureEvent, type Part } from './logic/gestures';
import type { Cat } from './render/cat';
import type { Stage } from './render/stage';

/** Приоритет частей при перекрытии (чем больше — тем важнее). */
const PRIORITY: Record<string, number> = {
  nose: 9,
  armL: 8,
  armR: 8,
  footL: 7,
  footR: 7,
  tail: 6,
  earL: 5,
  earR: 5,
  belly: 4,
  head: 3,
  body: 2,
};

export interface InputHost {
  stage: Stage;
  cat: Cat;
  /** Вернуть произвольную «сущность» под пальцем кроме кота (мяч, холодильник, лампа…). */
  pickExtra(clientX: number, clientY: number): Part | string | null;
  canInteract(): boolean;
  onFirstGesture(): void;
  onTapPart(part: Part | null, world: Vector3, clientX: number, clientY: number): void;
  onTapExtra(id: string, world: Vector3): void;
  onSlap(dirX: number, speed: number): void;
  onGrab(world: Vector3): void;
  onDrag(world: Vector3): void;
  onRelease(vx: number, vy: number): void;
  onPet(dist: number): void;
  onPetEnd(): void;
  onTickle(): void;
  onDoubleTapFloor(): void;
}

/** Связывает указатель с котом: raycast по частям, жесты, бросок. */
export class CatInput {
  readonly tracker = new GestureTracker();
  private taps = new TapCounter();
  private active = false;
  private pointerId = -1;
  private world = new Vector3();
  private lastFloorTap = 0;
  enabled = true;
  private extraId: string | null = null;
  private lookTimer = 0;

  constructor(private host: InputHost) {}

  attach(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    el.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.up(e), { passive: false });
    el.addEventListener('pointercancel', (e) => this.cancel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Часть кота под пальцем с «прощением промахов». */
  pickPart(clientX: number, clientY: number): Part | null {
    const { stage, cat } = this.host;
    const r = stage.canvas.getBoundingClientRect();
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = -((clientY - r.top) / r.height) * 2 + 1;
    stage.raycaster.setFromCamera({ x: ndcX, y: ndcY } as never, stage.camera);
    const hits = stage.raycaster.intersectObjects(cat.pickables, false);
    if (hits.length) {
      const d0 = hits[0]!.distance;
      let best = hits[0]!;
      let bp = -1;
      for (const h of hits) {
        if (h.distance > d0 + 0.6) break;
        const p = PRIORITY[h.object.userData.part as string] ?? 0;
        if (p > bp) {
          bp = p;
          best = h;
        }
      }
      return best.object.userData.part as Part;
    }
    // прощаем промахи: круг вокруг кота на экране
    const c = cat.anchorWorld('belly', new Vector3());
    const s = stage.worldToScreen(c, { x: 0, y: 0 });
    const wpp = stage.worldPerPixel();
    const rad = (WORLD.catRadiusX * 1.1) / wpp;
    if (Math.hypot(clientX - s.x, clientY - s.y) < rad && Math.abs(clientY - s.y) < rad * 1.55) return 'body';
    return null;
  }

  private down(e: PointerEvent): void {
    this.host.onFirstGesture();
    if (!this.enabled || !this.host.canInteract()) return;
    if (this.active) return;
    e.preventDefault();
    this.active = true;
    this.pointerId = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* не критично */
    }
    const { stage, cat } = this.host;
    stage.pointerToWorld(e.clientX, e.clientY, this.world);
    cat.lookAt(this.world);
    this.lookTimer = 0;
    const extra = this.host.pickExtra(e.clientX, e.clientY);
    const part = extra && (extra === 'ball') ? 'ball' : this.pickPart(e.clientX, e.clientY);
    this.extraId = null;
    if (!part && extra) this.extraId = extra;
    this.tracker.begin(e.clientX, e.clientY, performance.now(), part as Part | null);
    if (this.extraId) {
      // объекты комнаты реагируют сразу на касание
      this.tracker.cancel();
      this.active = false;
      this.host.onTapExtra(this.extraId, this.world.clone());
      this.extraId = null;
    }
  }

  private move(e: PointerEvent): void {
    if (!this.active || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const { stage, cat } = this.host;
    stage.pointerToWorld(e.clientX, e.clientY, this.world);
    cat.lookAt(this.world);
    const events = this.tracker.move(e.clientX, e.clientY, performance.now());
    this.handle(events, e.clientX, e.clientY);
    if (this.tracker.mode === 'grab') this.host.onDrag(this.world);
  }

  private up(e: PointerEvent): void {
    if (!this.active || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const { stage } = this.host;
    stage.pointerToWorld(e.clientX, e.clientY, this.world);
    const events = this.tracker.end(e.clientX, e.clientY, performance.now());
    this.handle(events, e.clientX, e.clientY);
    this.active = false;
    this.lookTimer = 1.6;
  }

  private cancel(e: PointerEvent): void {
    if (!this.active || e.pointerId !== this.pointerId) return;
    const events = this.tracker.end(e.clientX, e.clientY, performance.now());
    // отмена касания не должна считаться тапом
    this.handle(events.filter((x) => x.type !== 'tap'), e.clientX, e.clientY);
    this.active = false;
    this.lookTimer = 0.5;
  }

  private handle(events: GestureEvent[], cx: number, cy: number): void {
    const h = this.host;
    for (const ev of events) {
      switch (ev.type) {
        case 'tap': {
          const isCat = ev.part !== null && ev.part !== 'floor';
          if (isCat) {
            const n = this.taps.register(performance.now());
            if (n >= GESTURE.tickleTaps) {
              this.taps.reset();
              h.onTickle();
              break;
            }
          } else {
            const now = performance.now();
            this.taps.register(now);
            if (now - this.lastFloorTap < GESTURE.doubleTapMs) {
              this.lastFloorTap = 0;
              h.onDoubleTapFloor();
              break;
            }
            this.lastFloorTap = now;
          }
          h.onTapPart(ev.part, this.world.clone(), cx, cy);
          break;
        }
        case 'slap':
          h.onSlap(ev.dirX, ev.speed);
          break;
        case 'grab':
          h.onGrab(this.world.clone());
          break;
        case 'pet':
          h.onPet(ev.dist);
          break;
        case 'petEnd':
          h.onPetEnd();
          break;
        case 'release': {
          const wpp = h.stage.worldPerPixel();
          h.onRelease(
            ev.vx * 1000 * wpp * GESTURE.throwSpeedScale,
            -ev.vy * 1000 * wpp * GESTURE.throwSpeedScale,
          );
          break;
        }
      }
    }
  }

  /** Каждый кадр: долгое удержание → «взять», и отпускание взгляда. */
  update(dt: number, now: number): void {
    if (this.active) {
      this.handle(this.tracker.update(now), 0, 0);
    } else if (this.lookTimer > 0) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) this.host.cat.lookAt(null);
    }
  }

  get dragging(): boolean {
    return this.active && this.tracker.mode === 'grab';
  }
}
