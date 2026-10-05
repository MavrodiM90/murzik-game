import { expect, test, type Page } from '@playwright/test';
import { catPoint, expectNoErrors, openGame, syntheticSwipe } from './helpers';

const roomId = (page: Page): Promise<string> => page.evaluate(() => (window as any).__murzik.game.roomId);
const need = (page: Page, id: string): Promise<number> => page.evaluate((i) => (window as any).__murzik.game.save.needs[i], id);
const setNeed = (page: Page, id: string, v: number): Promise<void> =>
  page.evaluate(([i, val]) => {
    (window as any).__murzik.game.save.needs[i as string] = val;
  }, [id, v] as const);
const goRoom = async (page: Page, r: string): Promise<void> => {
  await page.evaluate((x) => (window as any).__murzik.game.goToRoom(x), r);
  await page.waitForTimeout(700);
};
const catState = (page: Page, s: string, timeout = 5000): Promise<unknown> =>
  page.waitForFunction((x) => (window as any).__murzik.game.cat.state === x, s, { timeout });

test('переход по всем 4 комнатам стрелками, домиком и по иконке шкалы', async ({ page }) => {
  const errors = await openGame(page);
  expect(await roomId(page)).toBe('living');
  for (const r of ['kitchen', 'bath', 'bedroom']) {
    await page.click('.btn-arrow.right');
    await page.waitForFunction((x) => (window as any).__murzik.game.roomId === x, r);
    await page.waitForTimeout(500);
  }
  expect(await page.locator('.btn-arrow.right').isHidden()).toBe(true);
  for (const r of ['bath', 'kitchen', 'living']) {
    await page.click('.btn-arrow.left');
    await page.waitForFunction((x) => (window as any).__murzik.game.roomId === x, r);
  }
  await page.click('.btn-arrow.right');
  await page.click('.btn-arrow.right');
  await page.click('.btn-home');
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'living');
  await page.click('.need[data-need="food"]');
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'kitchen');
  await expectNoErrors(errors);
});

test('свайп по пустому месту листает комнаты', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(400);
  const vp = page.viewportSize()!;
  const y = Math.round(vp.height * 0.3);
  await syntheticSwipe(page, { x: vp.width * 0.55, y }, { x: vp.width * 0.1, y }, { steps: 5 });
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'kitchen');
  await syntheticSwipe(page, { x: vp.width * 0.2, y }, { x: vp.width * 0.8, y }, { steps: 5 });
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'living');
});

test('кнопки и цели не меньше 64×64', async ({ page }) => {
  await openGame(page);
  for (const room of ['living', 'kitchen', 'bath', 'bedroom']) {
    await goRoom(page, room);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll<HTMLElement>('#ui button').forEach((b) => {
        if (b.hidden || b.offsetParent === null) return;
        const r = b.getBoundingClientRect();
        if (r.width < 63.5 || r.height < 63.5) bad.push(`${b.className}:${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return bad;
    });
    expect(small, room).toEqual([]);
  }
});

test('кухня: кормление из холодильника, брокколи морщит, любимая еда радует', async ({ page }) => {
  const errors = await openGame(page);
  await goRoom(page, 'kitchen');
  await setNeed(page, 'food', 20);
  await page.click('.tool-fridge');
  await expect(page.locator('.tray')).toBeVisible();
  await page.click('.tray-item[data-item="apple"]');
  await catState(page, 'eat');
  expect(await need(page, 'food')).toBeGreaterThan(35);
  await catState(page, 'idle', 8000);
  const before = await need(page, 'food');
  await page.click('.tray-item[data-item="broccoli"]');
  await catState(page, 'eatDisliked');
  expect(await need(page, 'food')).toBeGreaterThan(before);
  await catState(page, 'idle', 8000);
  const f0 = await page.evaluate(() => (window as any).__murzik.game.save.inventory.fish);
  const n0 = await need(page, 'food');
  await page.click('.tray-item[data-item="fish"]');
  await catState(page, 'eatFavorite');
  expect(await need(page, 'food')).toBeGreaterThan(n0 + 25);
  expect(await page.evaluate(() => (window as any).__murzik.game.save.inventory.fish)).toBe(f0 - 1);
  await page.click('.tray .btn-close');
  await expect(page.locator('.tray')).toHaveCount(0);
  await expectNoErrors(errors);
});

test('кормление перетаскиванием ко рту: кот открывает рот', async ({ page }) => {
  await openGame(page);
  await goRoom(page, 'kitchen');
  await setNeed(page, 'food', 10);
  await page.click('.tool-fridge');
  const item = await page.locator('.tray-item[data-item="milk"]').boundingBox();
  const mouth = await catPoint(page, 'mouth');
  await page.mouse.move(item!.x + 30, item!.y + 30);
  await page.mouse.down();
  await page.mouse.move(mouth.x, mouth.y + 52, { steps: 12 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__murzik.game.cat.mouthHint)).toBe(1);
  await page.mouse.up();
  await catState(page, 'eat', 4000);
  expect(await need(page, 'food')).toBeGreaterThan(25);
});

test('ванная: губка пенит, душ смывает, горшок заполняет шкалу туалета', async ({ page }) => {
  const errors = await openGame(page);
  await goRoom(page, 'bath');
  await setNeed(page, 'clean', 10);
  await page.click('.tool-sponge');
  const c = await catPoint(page, 'belly');
  await page.mouse.move(c.x - 60, c.y);
  await page.mouse.down();
  for (let k = 0; k < 14; k++) await page.mouse.move(c.x + (k % 2 ? 60 : -60), c.y + (k % 3) * 8, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__murzik.game.cat.foam)).toBeGreaterThan(0.2);
  expect(await need(page, 'clean')).toBeGreaterThan(30);
  await page.click('.tool-shower');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForFunction(() => (window as any).__murzik.game.cat.foam < 0.01, null, { timeout: 25000 });
  await page.mouse.up();
  expect(await need(page, 'clean')).toBeGreaterThan(60);
  await page.click('.tool-shower');
  await setNeed(page, 'toilet', 15);
  await page.click('.tool-potty');
  await catState(page, 'potty', 20000);
  await page.waitForFunction(() => (window as any).__murzik.game.save.needs.toilet > 95, null, { timeout: 30000 });
  await expectNoErrors(errors);
});

test('аптечка: витаминка лечит здоровье', async ({ page }) => {
  await openGame(page);
  await goRoom(page, 'bath');
  await setNeed(page, 'health', 20);
  await page.click('.tool-cabinet');
  await page.click('.tray-item[data-item="vitamin"]');
  await page.waitForFunction(() => (window as any).__murzik.game.save.needs.health > 70, null, { timeout: 4000 });
});

test('спальня: лампа выкл → сон, тап ворчит, лампа вкл → просыпается', async ({ page }) => {
  const errors = await openGame(page);
  await goRoom(page, 'bedroom');
  await setNeed(page, 'sleep', 30);
  await page.click('.tool-lamp');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'lying', null, { timeout: 10000 });
  await page.waitForTimeout(2000);
  expect(await need(page, 'sleep')).toBeGreaterThan(31);
  expect(await page.locator('.btn-arrow.left').isHidden()).toBe(true);
  const p = await catPoint(page, 'belly');
  await page.mouse.click(p.x, p.y);
  await catState(page, 'grumble', 3000);
  await page.click('.tool-lamp');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'stand', null, { timeout: 5000 });
  await expectNoErrors(errors);
});

test('сохранение: шкалы переживают перезагрузку; офлайн падение не ниже 40%', async ({ page }) => {
  await openGame(page);
  await setNeed(page, 'fun', 55);
  await page.evaluate(() => (window as any).__murzik.game.persist());
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 3);
  expect(await need(page, 'fun')).toBeGreaterThan(50);
  expect(await need(page, 'fun')).toBeLessThan(56);
  await page.evaluate(() => {
    const g = (window as any).__murzik.game;
    const s = JSON.parse(JSON.stringify(g.save));
    s.needs.food = 100;
    s.lastSeen = Date.now() - 3 * 24 * 3600_000;
    localStorage.setItem('murzik.save', JSON.stringify(s));
    g.pause();
    window.onpagehide = null;
  });
  // не даём pagehide перезаписать подготовленное сохранение
  await page.addInitScript(() => undefined);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'murzik.save' && (window as any).__block) return;
      return orig.call(this, k, v);
    };
    (window as any).__block = true;
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 3);
  const food = await need(page, 'food');
  expect(food).toBeGreaterThanOrEqual(39.9);
  expect(food).toBeLessThanOrEqual(41);
});
