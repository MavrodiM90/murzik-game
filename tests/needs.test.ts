import { describe, expect, it } from 'vitest';
import { HEALTH_LOW_NEED_THRESHOLD, NEED_DECAY_PER_MIN, OFFLINE_FLOOR } from '../src/config';
import { decayNeeds, fullNeeds, gain, lowestNeed, moodFromNeeds, needColor, offlineDecay, sanitizeNeeds } from '../src/logic/needs';

describe('шкалы: падение во время игры', () => {
  it('полная шкала падает до ~30% примерно за 2–3 часа', () => {
    for (const id of Object.keys(NEED_DECAY_PER_MIN) as (keyof typeof NEED_DECAY_PER_MIN)[]) {
      const minutesTo30 = 70 / NEED_DECAY_PER_MIN[id];
      expect(minutesTo30).toBeGreaterThanOrEqual(120);
      expect(minutesTo30).toBeLessThanOrEqual(185);
    }
  });

  it('за 2.5 часа игры шкалы в районе 30%', () => {
    const n = decayNeeds(fullNeeds(), 150);
    expect(n.food).toBeLessThan(40);
    expect(n.sleep).toBeGreaterThan(25);
    expect(n.sleep).toBeLessThan(50);
  });

  it('здоровье не падает, пока другие шкалы в порядке', () => {
    const n = decayNeeds(fullNeeds(), 100);
    expect(Math.min(n.food, n.sleep, n.toilet, n.clean, n.fun)).toBeGreaterThan(HEALTH_LOW_NEED_THRESHOLD);
    expect(n.health).toBe(100);
  });

  it('здоровье падает, когда другие шкалы низкие', () => {
    const n = fullNeeds();
    n.food = 10;
    n.fun = 5;
    n.clean = 20;
    decayNeeds(n, 10);
    expect(n.health).toBeLessThan(100);
  });

  it('шкалы не уходят ниже 0 и не ломаются от мусора', () => {
    const n = decayNeeds(fullNeeds(), 1e6);
    for (const v of Object.values(n)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(decayNeeds(fullNeeds(), Number.NaN).food).toBe(100);
    expect(decayNeeds(fullNeeds(), -5).food).toBe(100);
  });

  it('во сне другие шкалы падают медленнее, сон не падает', () => {
    const a = decayNeeds(fullNeeds(), 60, false);
    const b = decayNeeds(fullNeeds(), 60, true);
    expect(b.food).toBeGreaterThan(a.food);
    expect(b.sleep).toBe(100);
  });

  it('gain ограничен 100', () => {
    const n = fullNeeds();
    n.food = 90;
    gain(n, 'food', 50);
    expect(n.food).toBe(100);
  });
});

describe('шкалы: пока игра закрыта', () => {
  it('падают, но не ниже 40%', () => {
    const n = offlineDecay(fullNeeds(), 7 * 24 * 3600_000);
    for (const id of ['food', 'sleep', 'toilet', 'clean', 'fun'] as const) expect(n[id]).toBe(OFFLINE_FLOOR);
  });

  it('здоровье офлайн не меняется', () => {
    expect(offlineDecay(fullNeeds(), 7 * 24 * 3600_000).health).toBe(100);
  });

  it('если шкала уже ниже 40%, офлайн её не трогает', () => {
    const n = fullNeeds();
    n.food = 15;
    offlineDecay(n, 10 * 3600_000);
    expect(n.food).toBe(15);
  });

  it('короткий отъезд даёт пропорциональное падение', () => {
    const n = offlineDecay(fullNeeds(), 60 * 60_000);
    expect(n.food).toBeCloseTo(100 - NEED_DECAY_PER_MIN.food * 60, 5);
  });

  it('часы ушли назад (отрицательное время) — ничего не меняется', () => {
    expect(offlineDecay(fullNeeds(), -1e9).food).toBe(100);
    expect(offlineDecay(fullNeeds(), Number.NaN).food).toBe(100);
  });
});

describe('шкалы: интерфейс', () => {
  it('самая низкая потребность определяется, когда она ниже порога', () => {
    const n = fullNeeds();
    expect(lowestNeed(n)).toBeNull();
    n.toilet = 30;
    n.fun = 45;
    expect(lowestNeed(n)).toBe('toilet');
  });

  it('цвет: красный → жёлтый → зелёный', () => {
    expect(needColor(0)).toContain('hsl(0');
    expect(needColor(50)).toContain('hsl(60');
    expect(needColor(100)).toContain('hsl(120');
  });

  it('грусть мягкая: максимум 0.6, при сытом коте ноль', () => {
    expect(moodFromNeeds(fullNeeds())).toBe(0);
    const n = decayNeeds(fullNeeds(), 1e6);
    expect(moodFromNeeds(n)).toBeLessThanOrEqual(0.6);
    expect(moodFromNeeds(n)).toBeGreaterThan(0);
  });

  it('sanitizeNeeds чинит мусор', () => {
    const n = sanitizeNeeds({ food: 'x', sleep: 500, toilet: -4, clean: NaN });
    expect(n.food).toBe(100);
    expect(n.sleep).toBe(100);
    expect(n.toilet).toBe(0);
    expect(n.clean).toBe(100);
  });
});
