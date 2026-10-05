import { GESTURE } from '../config';

export type Part =
  | 'head'
  | 'belly'
  | 'body'
  | 'nose'
  | 'armL'
  | 'armR'
  | 'footL'
  | 'footR'
  | 'tail'
  | 'earL'
  | 'earR'
  | 'floor'
  | 'ball';

export type GestureEvent =
  | { type: 'tap'; part: Part | null; x: number; y: number }
  | { type: 'slap'; dirX: number; dirY: number; speed: number }
  | { type: 'grab' }
  | { type: 'pet'; dist: number }
  | { type: 'petEnd' }
  | { type: 'release'; vx: number; vy: number; speed: number };

interface Sample {
  x: number;
  y: number;
  t: number;
}

type Mode = 'idle' | 'pending' | 'pet' | 'grab' | 'slapped' | 'ignored';

/**
 * Классификатор жестов без привязки к DOM/three — чтобы тестировать.
 * Скорости в пикселях за миллисекунду.
 */
export class GestureTracker {
  mode: Mode = 'idle';
  part: Part | null = null;
  private start: Sample = { x: 0, y: 0, t: 0 };
  private samples: Sample[] = [];
  private petLast: Sample | null = null;
  private slapWindowMs = 300;

  begin(x: number, y: number, t: number, part: Part | null): void {
    this.mode = part === null ? 'ignored' : 'pending';
    this.part = part;
    this.start = { x, y, t };
    this.samples = [{ x, y, t }];
    this.petLast = { x, y, t };
  }

  private push(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    const cutoff = t - 400;
    while (this.samples.length > 2 && this.samples[0]!.t < cutoff) this.samples.shift();
  }

  move(x: number, y: number, t: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    if (this.mode === 'idle' || this.mode === 'ignored' || this.mode === 'slapped') return out;
    this.push(x, y, t);
    if (this.mode === 'pending') {
      const dx = x - this.start.x;
      const dy = y - this.start.y;
      const dist = Math.hypot(dx, dy);
      if (dist > GESTURE.tapMaxMove) {
        const elapsed = Math.max(1, t - this.start.t);
        const speed = dist / elapsed;
        if (elapsed < this.slapWindowMs && speed >= GESTURE.slapSpeed && dist >= GESTURE.slapMinDist) {
          this.mode = 'slapped';
          out.push({ type: 'slap', dirX: dx / dist, dirY: dy / dist, speed });
        } else if (this.part === 'head') {
          this.mode = 'pet';
        } else {
          this.mode = 'grab';
          out.push({ type: 'grab' });
        }
      }
    }
    if (this.mode === 'pet' && this.petLast) {
      const d = Math.hypot(x - this.petLast.x, y - this.petLast.y);
      this.petLast = { x, y, t };
      if (d > 0) out.push({ type: 'pet', dist: d });
    }
    return out;
  }

  /** Вызывать каждый кадр: долгое удержание без движения = «взять кота». */
  update(t: number): GestureEvent[] {
    if (this.mode === 'pending' && t - this.start.t >= GESTURE.grabHoldMs && this.part !== null) {
      this.mode = 'grab';
      return [{ type: 'grab' }];
    }
    return [];
  }

  end(x: number, y: number, t: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    const mode = this.mode;
    if (mode === 'pending' || mode === 'ignored') {
      const dist = Math.hypot(x - this.start.x, y - this.start.y);
      if (t - this.start.t <= GESTURE.tapMaxMs + 150 && dist <= GESTURE.tapMaxMove * 1.5) {
        out.push({ type: 'tap', part: mode === 'ignored' ? null : this.part, x, y });
      }
    } else if (mode === 'pet') {
      out.push({ type: 'petEnd' });
    } else if (mode === 'grab') {
      this.push(x, y, t);
      const v = this.velocity(t);
      out.push({ type: 'release', vx: v.vx, vy: v.vy, speed: Math.hypot(v.vx, v.vy) });
    }
    this.mode = 'idle';
    this.part = null;
    this.samples = [];
    return out;
  }

  cancel(): void {
    this.mode = 'idle';
    this.part = null;
    this.samples = [];
  }

  /** Скорость пальца по последним кадрам drag (px/мс). */
  velocity(now: number): { vx: number; vy: number } {
    const w = GESTURE.velocityWindowMs;
    const recent = this.samples.filter((s) => now - s.t <= w);
    if (recent.length < 2) return { vx: 0, vy: 0 };
    const a = recent[0]!;
    const b = recent[recent.length - 1]!;
    const dt = b.t - a.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }
}

/** Счётчик быстрых тапов (щекотка) и двойного тапа. */
export class TapCounter {
  private times: number[] = [];
  register(t: number): number {
    this.times.push(t);
    const cutoff = t - GESTURE.tickleWindowMs;
    this.times = this.times.filter((x) => x >= cutoff);
    return this.times.length;
  }
  isDoubleTap(): boolean {
    const n = this.times.length;
    return n >= 2 && this.times[n - 1]! - this.times[n - 2]! <= GESTURE.doubleTapMs;
  }
  isTickle(): boolean {
    return this.times.length >= GESTURE.tickleTaps;
  }
  reset(): void {
    this.times = [];
  }
}
