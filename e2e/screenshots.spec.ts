import { test, type Page } from '@playwright/test';
import { catPoint, openGame } from './helpers';

/** Скриншоты всех экранов в /screenshots — для визуальной проверки вёрстки. */
test('скриншоты всех экранов', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const dev = testInfo.project.name;
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `screenshots/${dev}-${name}.png`, scale: 'css' });
  };
  const g = <T>(fn: (game: any, hud: any) => T): Promise<T> =>
    page.evaluate(`(${fn.toString()})(window.__murzik.game, window.__murzik.hud)`) as Promise<T>;
  const room = async (r: string): Promise<void> => {
    await g((game) => game.goToRoom('__R__'.replace('__R__', 'living')));
    await page.evaluate((x) => (window as any).__murzik.game.goToRoom(x), r);
    await page.waitForTimeout(900);
  };

  await openGame(page);
  await page.waitForTimeout(800);
  await shot('01-living');

  // реакции кота
  const nose = await catPoint(page, 'nose');
  await page.mouse.click(nose.x, nose.y);
  await page.waitForTimeout(1050);
  await shot('02-sneeze');
  await page.waitForTimeout(1500);
  const belly = await catPoint(page, 'belly');
  await page.mouse.click(belly.x, belly.y);
  await page.waitForTimeout(500);
  await shot('03-giggle');
  await page.waitForTimeout(1500);
  await page.mouse.move(belly.x, belly.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.move(belly.x + 60, belly.y - 120, { steps: 6 });
  await shot('04-held');
  await page.mouse.move(belly.x + 140, belly.y - 260, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await shot('05-thrown');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'dizzy', null, { timeout: 20_000 });
  await page.waitForTimeout(500);
  await shot('06-dizzy-stars');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'idle', null, { timeout: 20_000 });

  await room('kitchen');
  await shot('07-kitchen');
  await page.click('.tool-fridge');
  await shot('08-kitchen-tray');
  await page.click('.tray .btn-close');

  await room('bath');
  await shot('09-bath');
  await page.click('.tool-sponge');
  const c = await catPoint(page, 'belly');
  await page.mouse.move(c.x - 60, c.y);
  await page.mouse.down();
  for (let k = 0; k < 16; k++) await page.mouse.move(c.x + (k % 2 ? 60 : -60), c.y + (k % 3) * 10, { steps: 4 });
  await shot('10-bath-foam');
  await page.mouse.up();
  await page.click('.tool-sponge');

  await room('bedroom');
  await shot('11-bedroom');
  await page.click('.tool-lamp');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'lying', null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot('12-bedroom-sleep');
  await page.click('.tool-lamp');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'stand', null, { timeout: 10_000 });
  await room('living');

  // магазин и гардероб
  await page.click('.btn-shop');
  await page.click('.card[data-item="hat_wizard"]');
  await shot('13-shop-hats');
  await page.click('.btn-buy');
  await page.click('.shop-tab[data-kind="glasses"]');
  await shot('14-shop-glasses');
  await page.click('.card[data-item="gl_star"]');
  await page.click('.btn-buy');
  await page.click('.shop-tab[data-kind="scarf"]');
  await page.click('.card[data-item="sc_stripe"]');
  await page.click('.btn-buy');
  await page.click('.shop-tab[data-kind="bow"]');
  await page.click('.card[data-item="bow_red"]');
  await page.click('.btn-buy');
  await page.click('.shop-tab[data-kind="fur"]');
  await shot('15-shop-fur');
  await page.click('.shop-tab[data-kind="wall"]');
  await shot('16-shop-walls');
  await page.click('.shop-tab[data-kind="food"]');
  await shot('17-shop-food');
  await page.click('.shop-close');
  await page.waitForTimeout(900);
  await shot('18-dressed');
  await page.click('.btn-wardrobe');
  await shot('19-wardrobe');
  await page.click('.shop-close');

  // сундучок
  await page.click('.tool-chest');
  await page.waitForTimeout(400);
  await shot('20-chest');

  // мини-игры
  await page.click('.tool-games');
  await shot('21-games-menu');
  await playGame(page, 'fish', shot, '22-game-fish');
  await playGame(page, 'balloons', shot, '23-game-balloons');
  await playGame(page, 'runner', shot, '24-game-runner');
  await playGame(page, 'memory', shot, '25-game-memory');

  // родительский контроль
  await page.evaluate(() => { (window as any).__murzik.hud.parental.gearHoldMs = 250; });
  const box = (await page.locator('.hud-gear').boundingBox())!;
  await page.mouse.move(box.x + 32, box.y + 32);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await shot('26-parent-check');
  const ans = await page.evaluate(() => (window as any).__murzik.hud.parental.problemText.answer);
  for (const ch of String(ans)) await page.click(`.pkey[data-key="${ch}"]`);
  await page.click('.pkey[data-key="ok"]');
  await shot('27-parent-settings');
  await page.click('.pset .pclose');

  // экран сна по таймеру
  await page.evaluate(() => {
    const game = (window as any).__murzik.game;
    game.save.timer.limitMin = 10;
    game.save.timer.playedMs = 10 * 60_000 - 500;
  });
  await page.waitForSelector('.lock', { timeout: 40_000 });
  await page.waitForTimeout(1500);
  await shot('28-lock-screen');
  await page.evaluate(() => { (window as any).__murzik.hud.parental.exitLock(true); });
});

async function playGame(page: Page, id: string, shot: (n: string) => Promise<void>, name: string): Promise<void> {
  await page.click(`.mg-pick[data-game="${id}"]`);
  await page.waitForTimeout(id === 'runner' ? 3000 : 2200);
  if (id === 'memory') await page.locator('.mem-card').first().click();
  await shot(name);
  await page.evaluate(() => (window as any).__murzik.hud.minigames.finishNow());
  await page.waitForTimeout(900);
  if (id === 'fish') await shot('22b-game-result');
  await page.click('.mg-ok');
  await page.click('.tool-games');
}
