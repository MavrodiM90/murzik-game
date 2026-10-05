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
