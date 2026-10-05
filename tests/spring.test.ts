import { describe, expect, it } from 'vitest';
import { Spring, SpringChain } from '../src/logic/spring';

describe('пружины', () => {
  it('сходятся к цели без взрыва даже при большом dt', () => {
    const s = new Spring(120, 9, 0);
    s.target = 1;
    for (let i = 0; i < 300; i++) s.step(1 / 60);
    expect(s.value).toBeCloseTo(1, 2);
    s.kick(1e9);
    for (let i = 0; i < 10; i++) s.step(5);
    expect(Number.isFinite(s.value)).toBe(true);
  });

  it('цепочка отстаёт от первого сегмента (волна)', () => {
    const c = new SpringChain(7, 80, 6, 0.8);
    const rest = new Array(7).fill(0);
    c.step(1 / 60, 1, rest);
    c.step(1 / 60, 1, rest);
    expect(Math.abs(c.springs[0]!.value)).toBeGreaterThan(Math.abs(c.springs[6]!.value));
  });
});
