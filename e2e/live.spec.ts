import { expect, test } from '@playwright/test';
import { catPoint, expectNoErrors, openGame } from './helpers';

// Проверка боевого URL (GitHub Pages). Запуск:
//   $env:E2E_BASE_URL='https://mavrodim90.github.io/murzik-game/'; npx playwright test e2e/live.spec.ts
test.skip(!process.env.E2E_BASE_URL, 'нужен E2E_BASE_URL');

test('боевой URL: игра грузится, кот реагирует, service worker зарегистрирован, работает офлайн', async ({ page, context, baseURL }) => {
  const foreign: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin) foreign.push(u);
  });
  const errors = await openGame(page);
  await page.waitForTimeout(1000);
  // тап по животу → хихиканье
  const belly = await catPoint(page, 'belly');
  await page.mouse.click(belly.x, belly.y);
  await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'giggle', null, { timeout: 10_000 });
  // переход в комнату
  await page.click('.btn-arrow.right');
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'kitchen');

  // service worker
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  const sw = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => ({ scope: r.scope, active: !!r.active }));
  });
  expect(sw.length).toBeGreaterThanOrEqual(1);
  expect(sw[0]!.active).toBe(true);
  expect(sw[0]!.scope).toBe(baseURL);

  const manifestHref = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href);
  const manifest = await (await page.request.get(manifestHref)).json();
  expect(manifest.name).toBe('Мурзик');
  for (const icon of manifest.icons as { src: string }[]) expect((await page.request.get(new URL(icon.src, manifestHref).href)).status()).toBe(200);

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
  expect(installabilityErrors).toEqual([]);

  // офлайн после первой загрузки
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 5, null, { timeout: 30_000 });
  await context.setOffline(false);

  await page.screenshot({ path: `screenshots/live-${test.info().project.name}.png`, scale: 'css' });
  expect(foreign).toEqual([]);
  await expectNoErrors(errors);
});
