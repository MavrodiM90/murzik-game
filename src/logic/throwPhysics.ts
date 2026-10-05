import { PHYSICS, WORLD } from '../config';
import { clamp } from './math';

export interface Bounds {
  minX: number;
  maxX: number;
  floorY: number;
  maxY: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  omega: number;
  /** true, когда тело лежит на полу и почти не движется */
  settled: boolean;
  airTime: number;
  bounces: number;
}

export type ImpactKind = 'floor' | 'wall' | 'ceiling';
export interface Impact {
  kind: ImpactKind;
  speed: number;
}

/** Границы центра кота внутри комнаты (стены, пол, потолок). */
export function makeBounds(
  halfWidth: number = WORLD.roomHalfWidth,
  rx: number = WORLD.catRadiusX,
  ry: number = WORLD.catRadiusY,
  ceiling: number = WORLD.ceiling,
): Bounds {
  const maxX = Math.max(0, halfWidth - rx);
  return { minX: -maxX, maxX, floorY: ry, maxY: Math.max(ry, ceiling - ry) };
}

export function makeBody(x = 0, y: number = WORLD.restY): Body {
  return { x, y, vx: 0, vy: 0, rot: 0, omega: 0, settled: true, airTime: 0, bounces: 0 };
}

/** Бросок: скорость обрезается до безопасного максимума, вращение зависит от горизонтальной скорости. */
export function launch(b: Body, vx: number, vy: number): void {
  const v = sanitizeVelocity(vx, vy);
  b.vx = v.vx;
  b.vy = v.vy;
  b.omega = clamp(-v.vx * 0.5 + (v.vx === 0 ? 3 : 0), -PHYSICS.maxSpin, PHYSICS.maxSpin);
  b.settled = false;
  b.airTime = 0;
  b.bounces = 0;
}

export function sanitizeVelocity(vx: number, vy: number): { vx: number; vy: number } {
  if (!Number.isFinite(vx)) vx = 0;
  if (!Number.isFinite(vy)) vy = 0;
  const sp = Math.hypot(vx, vy);
  if (sp > PHYSICS.maxSpeed) {
    const k = PHYSICS.maxSpeed / sp;
    vx *= k;
    vy *= k;
  }
  return { vx, vy };
}

/** Один шаг физики. Возвращает удары (для звука/частиц). Тело никогда не покидает bounds. */
export function stepBody(b: Body, dtRaw: number, bounds: Bounds): Impact[] {
  const impacts: Impact[] = [];
  if (!Number.isFinite(dtRaw) || dtRaw <= 0) return impacts;
  const dt = Math.min(dtRaw, 0.25);
  const n = Math.max(1, Math.ceil(dt / PHYSICS.substep));
  const h = dt / n;

  for (let i = 0; i < n && !b.settled; i++) {
    if (![b.x, b.y, b.vx, b.vy, b.rot, b.omega].every(Number.isFinite)) {
      b.x = 0;
      b.y = bounds.floorY;
      b.vx = b.vy = b.omega = 0;
      b.rot = 0;
    }
    b.vy -= PHYSICS.gravity * h;
    const drag = 1 / (1 + PHYSICS.airDrag * h);
    b.vx *= drag;
    b.vy *= drag;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > PHYSICS.maxSpeed) {
      const k = PHYSICS.maxSpeed / sp;
      b.vx *= k;
      b.vy *= k;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.rot += b.omega * h;
    b.airTime += h;

    if (b.x < bounds.minX) {
      b.x = bounds.minX;
      if (b.vx < 0) {
        impacts.push({ kind: 'wall', speed: -b.vx });
        b.vx = -b.vx * PHYSICS.restitutionWall;
        b.omega = clamp(b.omega * 0.7 + b.vy * 0.15, -PHYSICS.maxSpin, PHYSICS.maxSpin);
        b.bounces++;
      }
    } else if (b.x > bounds.maxX) {
      b.x = bounds.maxX;
      if (b.vx > 0) {
        impacts.push({ kind: 'wall', speed: b.vx });
        b.vx = -b.vx * PHYSICS.restitutionWall;
        b.omega = clamp(b.omega * 0.7 - b.vy * 0.15, -PHYSICS.maxSpin, PHYSICS.maxSpin);
        b.bounces++;
      }
    }
    if (b.y > bounds.maxY) {
      b.y = bounds.maxY;
      if (b.vy > 0) {
        impacts.push({ kind: 'ceiling', speed: b.vy });
        b.vy = -b.vy * 0.5;
      }
    }
    if (b.y <= bounds.floorY) {
      b.y = bounds.floorY;
      if (b.vy < 0) {
        const speed = -b.vy;
        impacts.push({ kind: 'floor', speed });
        b.vy = speed * PHYSICS.restitutionFloor;
        b.bounces++;
        b.omega = clamp(b.omega * 0.6, -PHYSICS.maxSpin, PHYSICS.maxSpin);
        if (b.vy < PHYSICS.settleSpeed) b.vy = 0;
      }
      const fr = Math.exp(-PHYSICS.groundFriction * h);
      b.vx *= fr;
      b.omega *= Math.exp(-3 * h);
      if (b.vy === 0 && Math.abs(b.vx) < PHYSICS.settleSpeed) {
        b.vx = 0;
        b.omega = 0;
        b.settled = true;
      }
    }
    // защита от застревания (прилип к потолку/стене, бесконечные микро-отскоки)
    if (!b.settled && b.airTime > PHYSICS.maxFlightTime) {
      b.y = bounds.floorY;
      b.vx = b.vy = b.omega = 0;
      b.settled = true;
    }
  }
  b.x = clamp(b.x, bounds.minX, bounds.maxX);
  b.y = clamp(b.y, bounds.floorY, bounds.maxY);
  return impacts;
}

/** Ближайший угол, кратный 2π, — чтобы кот вставал «на ноги». */
export function nearestUpright(rot: number): number {
  const full = Math.PI * 2;
  return Math.round(rot / full) * full;
}
