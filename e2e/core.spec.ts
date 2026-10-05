import { expect, test } from '@playwright/test';
import { catPoint, catState, expectNoErrors, openGame } from './helpers';

test('игра грузится без ошибок в консоли и рисует сцену', async ({ page }) => {
  const errors = await openGame(page);
  const px = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  expect(px.w).toBeGreaterThan(200);
  await page.waitForTimeout(800);
  await expectNoErrors(errors);
});

test('тап по коту меняет его состояние (живот → хихиканье, нос → чихание)', async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForTimeout(500);
  const before = await catState(page);
  const belly = await catPoint(page, 'belly');
  await page.mouse.click(belly.x, belly.y);
  await page.waitForTimeout(150);
  const after = await catState(page);
  expect(after).not.toBe(before);
  expect(after).toBe('giggle');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'idle', null, { timeout: 8000 });
  const nose = await catPoint(page, 'nose');
  await page.mouse.click(nose.x, nose.y);
  await page.waitForTimeout(150);
  expect(await catState(page)).toBe('sneeze');
  await expectNoErrors(errors);
});

test('drag-бросок: кот летит, остаётся в комнате, приземляется и встаёт', async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForTimeout(500);
  const belly = await catPoint(page, 'belly');
  await page.mouse.move(belly.x, belly.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  expect(await catState(page)).toBe('held');
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(belly.x + i * 25, belly.y - i * 35);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
  const flying = await page.evaluate(() => (window as any).__murzik.game.cat.mode);
  expect(flying).toBe('flying');
  let maxX = 0;
  for (let i = 0; i < 25; i++) {
    const b = await page.evaluate(() => {
      const g = (window as any).__murzik.game;
      return { x: g.cat.body.x, y: g.cat.body.y, min: g.cat.bounds.minX, max: g.cat.bounds.maxX, top: g.cat.bounds.maxY };
    });
    maxX = Math.max(maxX, Math.abs(b.x));
    expect(Math.abs(b.x)).toBeLessThanOrEqual(b.max + 1e-6);
    expect(b.y).toBeLessThanOrEqual(b.top + 1e-6);
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'stand', null, { timeout: 15000 });
  expect(await catState(page)).toMatch(/dizzy|getup|idle/);
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'idle', null, { timeout: 15000 });
  await expectNoErrors(errors);
});

test('быстрый свайп по коту — шлепок, кот кувыркается', async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForTimeout(500);
  const belly = await catPoint(page, 'belly');
  await page.mouse.move(belly.x - 60, belly.y);
  await page.mouse.down();
  await page.mouse.move(belly.x + 40, belly.y, { steps: 2 });
  await page.mouse.move(belly.x + 140, belly.y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect(await catState(page)).toBe('tumble');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'idle', null, { timeout: 15000 });
  await expectNoErrors(errors);
});
