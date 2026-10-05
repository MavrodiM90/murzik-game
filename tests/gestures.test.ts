import { describe, expect, it } from 'vitest';
import { GestureTracker, TapCounter } from '../src/logic/gestures';

describe('жесты', () => {
  it('короткое касание — тап по части', () => {
    const g = new GestureTracker();
    g.begin(100, 100, 0, 'belly');
    const ev = g.end(102, 101, 120);
    expect(ev).toEqual([{ type: 'tap', part: 'belly', x: 102, y: 101 }]);
  });

  it('быстрый свайп — шлепок', () => {
    const g = new GestureTracker();
    g.begin(100, 100, 0, 'body');
    const ev = g.move(260, 100, 60);
    expect(ev[0]?.type).toBe('slap');
    expect(g.end(300, 100, 90)).toEqual([]);
  });

  it('медленный свайп по голове — поглаживание', () => {
    const g = new GestureTracker();
    g.begin(100, 100, 0, 'head');
    const e1 = g.move(130, 100, 200);
    expect(e1.some((e) => e.type === 'pet')).toBe(true);
    expect(g.end(160, 100, 400)).toEqual([{ type: 'petEnd' }]);
  });

  it('медленное перетаскивание за тело — взять и бросить со скоростью пальца', () => {
    const g = new GestureTracker();
    g.begin(100, 400, 0, 'belly');
    const e1 = g.move(120, 380, 350);
    expect(e1[0]?.type).toBe('grab');
    g.move(200, 300, 400);
    g.move(320, 200, 440);
    const ev = g.end(380, 150, 460);
    const rel = ev[0];
    expect(rel?.type).toBe('release');
    if (rel?.type === 'release') {
      expect(rel.vx).toBeGreaterThan(0);
      expect(rel.vy).toBeLessThan(0);
      expect(rel.speed).toBeGreaterThan(1);
    }
  });

  it('удержание без движения берёт кота', () => {
    const g = new GestureTracker();
    g.begin(100, 100, 0, 'body');
    expect(g.update(100)).toEqual([]);
    expect(g.update(600)[0]?.type).toBe('grab');
  });

  it('если палец остановился перед отпусканием, скорость броска нулевая', () => {
    const g = new GestureTracker();
    g.begin(100, 100, 0, 'body');
    g.move(150, 100, 350);
    g.move(300, 100, 400);
    const ev = g.end(300, 100, 900);
    const rel = ev[0];
    expect(rel?.type === 'release' && rel.speed).toBe(0);
  });

  it('касание мимо кота не даёт тап по части', () => {
    const g = new GestureTracker();
    g.begin(5, 5, 0, null);
    const ev = g.end(5, 5, 100);
    expect(ev[0]).toMatchObject({ type: 'tap', part: null });
  });

  it('щекотка: много быстрых тапов; двойной тап', () => {
    const t = new TapCounter();
    for (let i = 0; i < 5; i++) t.register(i * 200);
    expect(t.isTickle()).toBe(false);
    t.register(1000);
    expect(t.isTickle()).toBe(true);
    t.reset();
    t.register(0);
    t.register(200);
    expect(t.isDoubleTap()).toBe(true);
    t.register(900);
    expect(t.isDoubleTap()).toBe(false);
  });
});
