import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers';

const answer = (page: Page): Promise<number> => page.evaluate(() => (window as any).__murzik.hud.parental.problemText.answer);
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__murzik.game.save)));
const shortHold = (page: Page) => page.evaluate(() => { (window as any).__murzik.hud.parental.gearHoldMs = 250; });

async function holdGear(page: Page, ms: number, sel = '.hud-gear'): Promise<void> {
  const box = (await page.locator(sel).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function typeAnswer(page: Page, n: number | string): Promise<void> {
  for (const ch of String(n)) await page.click(`.pkey[data-key="${ch}"]`);
  await page.click('.pkey[data-key="ok"]');
}

async function enterSettings(page: Page, sel = '.hud-gear'): Promise<void> {
  await shortHold(page);
  await holdGear(page, 600, sel);
  await expect(page.locator('.pcheck')).toBeVisible();
  await typeAnswer(page, await answer(page));
  await expect(page.locator('.pset')).toBeVisible();
}

test('вход в настройки: удержание шестерёнки 3 секунды, потом пример на умножение', async ({ page }) => {
  const errors = await openGame(page);
  await holdGear(page, 1200);
  await expect(page.locator('.pcheck')).toHaveCount(0); // слишком коротко
  await holdGear(page, 3300);
  await expect(page.locator('.pcheck')).toBeVisible();
  const text = await page.locator('.ptitle').textContent();
  expect(text).toMatch(/^\d{2} × \d = \?$/);
  await expectNoErrors(errors);
});

test('без правильного ответа настройки не открываются; крестик закрывает проверку', async ({ page }) => {
  await openGame(page);
  await shortHold(page);
  await holdGear(page, 600);
  await expect(page.locator('.pcheck')).toBeVisible();
  const right = await answer(page);
  await typeAnswer(page, right + 1);
  await expect(page.locator('.pset')).toHaveCount(0);
  await expect(page.locator('.pcheck')).toBeVisible();
  await page.click('.pkey[data-key="ok"]'); // пустой ответ
  await expect(page.locator('.pset')).toHaveCount(0);
  await typeAnswer(page, '0');
  await expect(page.locator('.pset')).toHaveCount(0);
  await page.click('.pcheck .pclose');
  await expect(page.locator('.pcheck')).toHaveCount(0);
  await expect(page.locator('.pset')).toHaveCount(0);
});

test('настройки: таймер, пауза, громкость, повтор голоса сохраняются', async ({ page }) => {
  await openGame(page);
  await enterSettings(page);
  await page.click('.pset .seg button[data-v="20"]');
  await page.click('.pset .seg button[data-v="2h"]');
  await page.click('.pset .seg button[data-v="0.5"]');
  await page.click('.pset .seg button[data-v="off"]');
  const s = await save(page);
  expect(s.timer.limitMin).toBe(20);
  expect(s.timer.pause).toBe('2h');
  expect(s.settings.volume).toBe(0.5);
  expect(s.settings.voiceRepeat).toBe(false);
  await expect(page.locator('.btn-ear')).toBeHidden();
  await page.click('.pset .pclose');
  await expect(page.locator('.pset')).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 3);
  expect((await save(page)).timer.limitMin).toBe(20);
  // варианты таймера
  await enterSettings(page);
  for (const v of ['0', '10', '15', '20', '30', '45']) await expect(page.locator(`.pset .seg button[data-v="${v}"]`).first()).toBeVisible();
  for (const v of ['30m', '1h', '2h', 'tomorrow']) await expect(page.locator(`.pset .seg button[data-v="${v}"]`)).toBeVisible();
});

test('когда таймер вышел: кот зевает и засыпает, экран «Мурзик спит», играть нельзя; родитель снимает паузу', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__murzik.game;
    g.save.timer.limitMin = 10;
    g.save.timer.pause = '1h';
    g.save.timer.playedMs = 10 * 60_000 - 1500;
  });
  await page.waitForFunction(() => (window as any).__murzik.hud.parental.isLockedNow, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'bedroom');
  await expect(page.locator('.lock')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.lock-title')).toHaveText('Мурзик спит');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'lying', null, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as any).__murzik.game.lampOn)).toBe(false);
  // тапы только сонно «Zzz»
  const before = await page.evaluate(() => (window as any).__murzik.game.save.needs.fun);
  await page.mouse.click(200, 400);
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'grumble', null, { timeout: 20000 });
  expect(await page.evaluate(() => (window as any).__murzik.game.save.needs.fun)).toBeLessThanOrEqual(before);
  // кнопки под экраном недоступны
  const hit = await page.evaluate(() => document.elementFromPoint(40, 60)?.className ?? '');
  expect(String(hit)).not.toContain('btn-home');
  // сохранилась пауза
  const s = await save(page);
  expect(s.timer.lockUntil).toBeGreaterThan(Date.now());
  expect(s.timer.lockUntil - Date.now()).toBeLessThanOrEqual(3600_000 + 5000);
  // обход — только через родительскую проверку
  await shortHold(page);
  await holdGear(page, 600, '.lock-gear');
  await expect(page.locator('.pcheck')).toBeVisible();
  await typeAnswer(page, (await answer(page)) + 1);
  await expect(page.locator('.lock')).toBeVisible();
  await typeAnswer(page, await answer(page));
  await expect(page.locator('.pset')).toBeVisible();
  await expect(page.locator('.lock')).toHaveCount(0);
  expect((await save(page)).timer.lockUntil).toBe(0);
  await page.click('.pset .pclose');
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'stand', null, { timeout: 30000 });
  await expectNoErrors(errors);
});

test('пауза переживает перезагрузку страницы и заканчивается сама', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__murzik.game;
    const now = Date.now();
    g.save.timer.limitMin = 10;
    g.save.timer.lockStartedAt = now;
    g.save.timer.lockDurationMs = 3_000_000;
    g.save.timer.lockUntil = now + 3_000_000;
    g.persist();
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.hud?.parental?.isLockedNow === true, null, { timeout: 15_000 });
  await expect(page.locator('.lock')).toBeVisible({ timeout: 15_000 });
  // конец паузы: через 2 секунды
  await page.evaluate(() => { (window as any).__murzik.game.save.timer.lockUntil = Date.now() + 2000; });
  await page.waitForFunction(() => (window as any).__murzik.hud.parental.isLockedNow === false, null, { timeout: 15_000 });
  await expect(page.locator('.lock')).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__murzik.game.cat.mode === 'stand', null, { timeout: 10_000 });
});

test('перевод часов назад не даёт бесконечную игру: пауза начинается заново', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__murzik.game;
    const now = Date.now();
    g.save.timer.limitMin = 10;
    g.save.timer.lockDurationMs = 3_600_000;
    g.save.timer.lockStartedAt = now - 3_000_000;
    g.save.timer.lockUntil = now + 600_000; // оставалось 10 минут
    g.save.timer.lastSeen = now + 3 * 3_600_000; // «последний раз видели» в будущем = часы ушли назад
    localStorage.setItem('murzik.save', JSON.stringify(g.save));
    g.resetting = true; // не даём pagehide перезаписать
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.hud?.parental?.isLockedNow === true, null, { timeout: 15_000 });
  const left = await page.evaluate(() => (window as any).__murzik.game.save.timer.lockUntil - Date.now());
  expect(left).toBeGreaterThan(3_500_000);
  expect(left).toBeLessThanOrEqual(3_600_000);
});

test('сброс прогресса с двойным подтверждением', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { (window as any).__murzik.game.save.coins = 1234; (window as any).__murzik.game.persist(); });
  await enterSettings(page);
  // отмена на первом шаге
  await page.click('.preset');
  await page.click('.pbtn[data-act="no"]');
  expect((await save(page)).coins).toBe(1234);
  // отмена на втором шаге
  await page.click('.preset');
  await page.click('.pbtn[data-act="yes1"]');
  await expect(page.locator('.pbtn[data-act="yes2"]')).toBeVisible();
  await page.click('.pbtn[data-act="no"]');
  expect((await save(page)).coins).toBe(1234);
  // подтверждение дважды — всё стирается
  await page.click('.preset');
  await page.click('.pbtn[data-act="yes1"]');
  await Promise.all([page.waitForEvent('load'), page.click('.pbtn[data-act="yes2"]')]);
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 3);
  expect((await save(page)).coins).toBe(5000);
});
