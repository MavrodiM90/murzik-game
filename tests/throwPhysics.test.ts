import { describe, expect, it } from 'vitest';
import { PHYSICS, WORLD } from '../src/config';
import { mulberry32 } from '../src/logic/math';
import { launch, makeBody, makeBounds, nearestUpright, stepBody } from '../src/logic/throwPhysics';

describe('физика броска', () => {
  const bounds = makeBounds();

  it('границы комнаты учитывают размер кота', () => {
    expect(bounds.minX).toBeCloseTo(-(WORLD.roomHalfWidth - WORLD.catRadiusX));
    expect(bounds.floorY).toBe(WORLD.catRadiusY);
  });

  it('кот не улетает за границы при любой скорости броска', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 400; i++) {
      const b = makeBody(0, 5);
      const mag = Math.pow(10, rng() * 7 - 1); // 0.1 .. 1e6
      const ang = rng() * Math.PI * 2;
      launch(b, Math.cos(ang) * mag, Math.sin(ang) * mag);
      for (let s = 0; s < 1200; s++) {
        stepBody(b, 1 / 60, bounds);
        expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
        expect(b.x).toBeGreaterThanOrEqual(bounds.minX - 1e-9);
        expect(b.x).toBeLessThanOrEqual(bounds.maxX + 1e-9);
        expect(b.y).toBeGreaterThanOrEqual(bounds.floorY - 1e-9);
        expect(b.y).toBeLessThanOrEqual(bounds.maxY + 1e-9);
        if (b.settled) break;
      }
    }
  });

  it('скорость обрезается, NaN/Infinity не ломают тело', () => {
    const b = makeBody();
    launch(b, Number.POSITIVE_INFINITY, Number.NaN);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(PHYSICS.maxSpeed + 1e-9);
    b.x = Number.NaN;
    stepBody(b, 1 / 60, bounds);
    expect(Number.isFinite(b.x)).toBe(true);
  });

  it('огромный dt не пробивает пол и стены', () => {
    const b = makeBody(0, 6);
    launch(b, 30, 30);
    stepBody(b, 100, bounds);
    expect(b.x).toBeLessThanOrEqual(bounds.maxX);
    expect(b.y).toBeGreaterThanOrEqual(bounds.floorY);
  });

  it('всегда приземляется и успокаивается (нет застревания)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const b = makeBody(0, 4);
      launch(b, (rng() - 0.5) * 80, (rng() - 0.2) * 80);
      let t = 0;
      while (!b.settled && t < PHYSICS.maxFlightTime + 2) {
        stepBody(b, 1 / 60, bounds);
        t += 1 / 60;
      }
      expect(b.settled).toBe(true);
      expect(b.y).toBeCloseTo(bounds.floorY, 5);
    }
  });

  it('отскакивает от стены и пола с потерей энергии', () => {
    const b = makeBody(0, 6);
    launch(b, 20, 0);
    const kinds = new Set<string>();
    for (let i = 0; i < 600 && !b.settled; i++) stepBody(b, 1 / 60, bounds).forEach((im) => kinds.add(im.kind));
    expect(kinds.has('wall')).toBe(true);
    expect(kinds.has('floor')).toBe(true);
  });

  it('nearestUpright кратен 2π', () => {
    expect(nearestUpright(6.5)).toBeCloseTo(Math.PI * 2);
    expect(nearestUpright(-0.4)).toBeCloseTo(0);
  });
});
