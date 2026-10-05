import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers';

const mg = (page: Page) => (fn: string) => page.evaluate(`(() => { const m = window.__murzik.hud.minigames; return ${fn}; })()`);
const coins = (page: Page): Promise<number> => page.evaluate(() => (window as any).__murzik.game.save.coins);

async function openMenuAndStart(page: Page, id: string): Promise<void> {
  await page.click('.tool-games');
  await expect(page.locator('.mg-menu')).toBeVisible();
  expect(await page.locator('.mg-pick').count()).toBe(4);
  await page.click(`.mg-pick[data-game="${id}"]`);
  await expect(page.locator(`.game-${id}`)).toBeVisible();
}

async function finishAndCheck(page: Page, minScoreCoins = 20): Promise<void> {
  const before = await coins(page);
  await mg(page)('m.finishNow()');
  await expect(page.locator('.mg-result')).toBeVisible();
  const gained = (await coins(page)) - before;
  expect(gained).toBeGreaterThanOrEqual(minScoreCoins);
  expect(gained).toBeLessThanOrEqual(100);
  // салют: частицы активны
  expect(await page.evaluate(() => (window as any).__murzik.game.particles.activeCount)).toBeGreaterThan(0);
  await page.click('.mg-ok');
  await expect(page.locator('.mg-result')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__murzik.game.inputLocks)).toBe(0);
}

test('меню мини-игр: 4 игры, закрывается крестиком, вход через телевизор', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('.tool-games');
  await expect(page.locator('.mg-menu')).toBeVisible();
  await page.click('.mg-menu-x');
  await expect(page.locator('.mg-menu')).toHaveCount(0);
  await page.evaluate(() => (window as any).__murzik.hud.handleExtra('tv'));
  await expect(page.locator('.mg-menu')).toBeVisible();
  await page.click('.btn-home');
  await expect(page.locator('.mg-menu')).toHaveCount(0);
  await expectNoErrors(errors);
});

test('«Поймай рыбку»: корзинка ловит рыбок, в конце салют и ≥20 монет', async ({ page }) => {
  const errors = await openGame(page);
  await openMenuAndStart(page, 'fish');
  await page.mouse.move(200, 600);
  await page.mouse.down();
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const x = await page.evaluate(() => {
      const f = Array.from(document.querySelectorAll('.mg-fish')) as HTMLElement[];
      const b = document.querySelector('.mg-basket')!.getBoundingClientRect();
      const cand = f.map((e) => e.getBoundingClientRect()).filter((r) => r.top < b.top).sort((a, c) => c.top - a.top)[0];
      return cand ? cand.left + cand.width / 2 : null;
    });
    if (x !== null) await page.mouse.move(x, 700, { steps: 2 });
    if ((await mg(page)('m.activeGame.score')) as number >= 1) break;
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  expect(await mg(page)('m.activeGame.score')).toBeGreaterThanOrEqual(1);
  await finishAndCheck(page);
  await expectNoErrors(errors);
});

test('«Лопни шарики»: тап лопает шарик', async ({ page }) => {
  const errors = await openGame(page);
  await openMenuAndStart(page, 'balloons');
  await page.waitForSelector('.mg-balloon', { timeout: 10_000 });
  await page.locator('.mg-balloon').first().click({ force: true });
  expect(await mg(page)('m.activeGame.score')).toBe(1);
  await finishAndCheck(page);
  await expectNoErrors(errors);
});

test('«Прыг-скок»: тап — прыжок, задел препятствие — спотыкается, но игра идёт дальше', async ({ page }) => {
  const errors = await openGame(page);
  await openMenuAndStart(page, 'runner');
  await page.waitForTimeout(500);
  await page.mouse.click(200, 500);
  await page.waitForTimeout(200);
  expect(await mg(page)('m.activeGame.jumps')).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => (window as any).__murzik.game.cat.running)).toBe(true);
  // не прыгаем вообще: кот должен споткнуться и продолжить бежать, а не «проиграть»
  await page.waitForFunction(() => (window as any).__murzik.hud.minigames.activeGame.stumbles >= 1, null, { timeout: 40_000 });
  expect(await mg(page)('m.playing')).toBe(true);
  await finishAndCheck(page);
  expect(await page.evaluate(() => (window as any).__murzik.game.cat.running)).toBe(false);
  await expectNoErrors(errors);
});

test('«Найди пару»: 6 карточек, пары открываются и остаются', async ({ page }) => {
  const errors = await openGame(page);
  await openMenuAndStart(page, 'memory');
  expect(await page.locator('.mem-card').count()).toBe(6);
  const icons = await page.$$eval('.mem-card', (els) => els.map((e) => (e as HTMLElement).dataset.icon));
  expect(new Set(icons).size).toBe(3);
  // неверная пара закрывается
  const first = icons[0]!;
  const wrong = icons.findIndex((x, i) => i > 0 && x !== first);
  await page.locator('.mem-card').nth(0).click();
  await page.locator('.mem-card').nth(wrong).click();
  await page.waitForFunction(() => document.querySelectorAll('.mem-card.open').length === 0, null, { timeout: 4000 });
  // верная пара остаётся открытой
  const mate = icons.findIndex((x, i) => i > 0 && x === first);
  await page.locator('.mem-card').nth(0).click();
  await page.locator('.mem-card').nth(mate).click();
  await page.waitForTimeout(900);
  expect(await page.locator('.mem-card.matched').count()).toBe(2);
  expect(await mg(page)('m.activeGame.score')).toBe(1);
  await finishAndCheck(page);
  await expectNoErrors(errors);
});

test('выход из игры домиком не даёт награды и снимает блокировку', async ({ page }) => {
  await openGame(page);
  await openMenuAndStart(page, 'balloons');
  const before = await coins(page);
  await page.click('.mg-x');
  await expect(page.locator('.mg')).toHaveCount(0);
  expect(await coins(page)).toBe(before);
  expect(await page.evaluate(() => (window as any).__murzik.game.inputLocks)).toBe(0);
});
