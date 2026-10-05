import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers';

const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__murzik.game.save)));
const setCoins = (page: Page, n: number) => page.evaluate((v) => { (window as any).__murzik.game.save.coins = v; (window as any).__murzik.game.emit('coins'); }, n);
const hatCount = (page: Page) => page.evaluate(() => (window as any).__murzik.game.cat.anchors.hat.children.length);

test('магазин: примерка не списывает монеты, покупка списывает и надевает', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('.btn-shop');
  await expect(page.locator('.shop')).toBeVisible();
  await page.click('.card[data-item="hat_crown"]');
  expect(await hatCount(page)).toBe(1);
  expect((await save(page)).coins).toBe(5000);
  expect((await save(page)).equipped.hat).toBeNull();
  await page.click('.btn-buy');
  const s = await save(page);
  expect(s.coins).toBe(4600);
  expect(s.owned).toContain('hat_crown');
  expect(s.equipped.hat).toBe('hat_crown');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'newClothes');
  // закрыли магазин — шапка осталась, непокупная примерка исчезла
  await page.click('.card[data-item="hat_top"]');
  await page.click('.shop-close');
  expect(await hatCount(page)).toBe(1);
  expect((await save(page)).equipped.hat).toBe('hat_crown');
  await expectNoErrors(errors);
});

test('магазин: не хватает монет — покупка отклоняется, баланс не меняется', async ({ page }) => {
  await openGame(page);
  await setCoins(page, 50);
  await page.click('.btn-shop');
  await page.click('.card[data-item="hat_crown"]');
  await page.click('.btn-buy');
  const s = await save(page);
  expect(s.coins).toBe(50);
  expect(s.owned).not.toContain('hat_crown');
  await expect(page.locator('.coins')).toHaveClass(/shake/);
});

test('гардероб: показывает только купленное, надеть и снять', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__murzik.game;
    g.buyItem('hat_cap');
    g.buyItem('gl_sun');
  });
  await page.click('.btn-wardrobe');
  expect(await page.locator('.card').count()).toBe(1);
  // после покупки предмет сразу надет — тап снимает, ещё тап надевает
  expect((await save(page)).equipped.hat).toBe('hat_cap');
  await page.click('.card[data-item="hat_cap"]');
  expect((await save(page)).equipped.hat).toBeNull();
  expect(await hatCount(page)).toBe(0);
  await page.click('.card[data-item="hat_cap"]');
  expect((await save(page)).equipped.hat).toBe('hat_cap');
  expect(await hatCount(page)).toBe(1);
  await page.click('.shop-tab[data-kind="glasses"]');
  await page.click('.card[data-item="gl_sun"]');
  expect((await save(page)).equipped.glasses).toBeNull();
});

test('магазин: еда покупается порциями, окрас и обои применяются', async ({ page }) => {
  await openGame(page);
  const before = (await save(page)).inventory.cookie ?? 0;
  await page.click('.btn-shop');
  await page.click('.shop-tab[data-kind="food"]');
  await page.click('.card[data-item="cookie"]');
  const s1 = await save(page);
  expect(s1.inventory.cookie).toBe(before + 5);
  expect(s1.coins).toBe(4990);
  await page.click('.shop-tab[data-kind="fur"]');
  await page.click('.card[data-item="fur_gray"]');
  await page.click('.btn-buy');
  expect((await save(page)).fur).toBe('fur_gray');
  await page.click('.shop-tab[data-kind="wall"]');
  await page.click('.card[data-item="wall_mint"]');
  await page.click('.btn-buy');
  expect((await save(page)).wall.living).toBe('wall_mint');
  await page.click('.shop-tab[data-kind="floor"]');
  await page.click('.card[data-item="floor_green"]');
  await page.click('.btn-buy');
  expect((await save(page)).floor.living).toBe('floor_green');
});

test('сундучок: раз в 4 часа, награда в монетах, повтор сразу не работает', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('.tool-chest')).toHaveClass(/ready/);
  await page.click('.tool-chest');
  const s = await save(page);
  expect(s.coins).toBeGreaterThanOrEqual(5040);
  expect(s.coins).toBeLessThanOrEqual(5120);
  expect(s.lastChestAt).toBeGreaterThan(0);
  await page.waitForTimeout(700);
  await expect(page.locator('.tool-chest')).toHaveClass(/wait/);
  const c = s.coins;
  await page.click('.tool-chest');
  expect((await save(page)).coins).toBe(c);
  // через 4 часа снова готов
  await page.evaluate(() => { (window as any).__murzik.game.save.lastChestAt = Date.now() - 4 * 3600_000 - 1000; });
  await page.waitForTimeout(800);
  await expect(page.locator('.tool-chest')).toHaveClass(/ready/);
});

test('покупки переживают перезагрузку', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { (window as any).__murzik.game.buyItem('hat_party'); });
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 3);
  const s = await save(page);
  expect(s.equipped.hat).toBe('hat_party');
  expect(s.coins).toBe(5000 - 150);
  expect(await hatCount(page)).toBe(1);
});
