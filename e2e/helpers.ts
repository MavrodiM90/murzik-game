import { expect, type Page } from '@playwright/test';

export interface Pt {
  x: number;
  y: number;
}

export async function openGame(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`./?test${extra}`);
  await page.waitForFunction(() => !!(window as any).__murzik?.game?.frame && (window as any).__murzik.game.frame > 5, null, { timeout: 30_000 });
  return errors;
}

/** Экранные координаты опорной точки кота. */
export async function catPoint(page: Page, anchor: 'head' | 'belly' | 'nose' | 'pawR' | 'pawL' | 'mouth' | 'feet'): Promise<Pt> {
  return page.evaluate((a) => {
    const g = (window as any).__murzik.game;
    const THREE = g.cat.anchorWorld('head', new g.tmp.constructor());
    void THREE;
    const v = g.cat.anchorWorld(a, new g.tmp.constructor());
    return g.stage.worldToScreen(v, { x: 0, y: 0 });
  }, anchor);
}

export const catState = (page: Page): Promise<string> => page.evaluate(() => (window as any).__murzik.game.cat.state);

export async function expectNoErrors(errors: string[]): Promise<void> {
  expect(errors.filter((e) => !/favicon|manifest|Failed to load resource.*(404)/i.test(e))).toEqual([]);
}

/**
 * Свайп/жест из последовательных PointerEvent'ов, отправленных внутри одной страницы за миллисекунды.
 * Игра классифицирует жесты по реальному времени, а на медленном CI «живая» мышь Playwright
 * может растянуть свайп на секунды — поэтому быстрые жесты в тестах отправляем синтетически.
 */
export async function syntheticSwipe(page: Page, from: Pt, to: Pt, opts: { steps?: number; holdMs?: number } = {}): Promise<void> {
  await page.evaluate(
    async ({ from, to, steps, holdMs }) => {
      const c = document.getElementById('stage')!;
      const fire = (type: string, x: number, y: number): void => {
        c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      };
      fire('pointerdown', from.x, from.y);
      if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
      for (let i = 1; i <= steps; i++) fire('pointermove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      fire('pointerup', to.x, to.y);
    },
    { from, to, steps: opts.steps ?? 4, holdMs: opts.holdMs ?? 0 },
  );
}
