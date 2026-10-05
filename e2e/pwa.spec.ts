import { expect, test } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers';

test('манифест, иконки и service worker: приложение устанавливается и работает офлайн', async ({ page, context, baseURL }) => {
  const errors = await openGame(page);
  const manifestHref = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? '');
  expect(manifestHref).toContain('manifest.webmanifest');
  const manifest = await (await page.request.get(manifestHref)).json();
  expect(manifest.name).toBe('Мурзик');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('portrait');
  expect(manifest.start_url).toBeTruthy();
  const purposes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
  expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await page.request.get(new URL(icon.src, manifestHref).href);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  const apple = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? '');
  expect((await page.request.get(apple)).status()).toBe(200);

  // service worker зарегистрирован и управляет страницей
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
  const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  expect(regs).toBeGreaterThanOrEqual(1);

  // критерии установки по версии самого Chromium
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] };
  expect(installabilityErrors).toEqual([]);

  // полный офлайн после первой загрузки
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as any).__murzik?.game?.frame > 5, null, { timeout: 30_000 });
  await page.click('.btn-arrow.right');
  await page.waitForFunction(() => (window as any).__murzik.game.roomId === 'kitchen');
  await context.setOffline(false);
  void baseURL;
  await expectNoErrors(errors);
});

test('никаких сетевых запросов, кроме загрузки самой игры (тот же origin)', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (new URL(u).origin !== origin) foreign.push(u);
  });
  await openGame(page);
  // немного поиграем: комнаты, магазин, мини-игра, настройки
  await page.click('.btn-shop');
  await page.click('.shop-close');
  await page.click('.tool-games');
  await page.click('.mg-pick[data-game="memory"]');
  await page.click('.mg-x');
  await page.click('.btn-arrow.right');
  await page.waitForTimeout(1500);
  expect(foreign).toEqual([]);
});

test('нет внешних ссылок и рекламных/аналитических скриптов в разметке', async ({ page }) => {
  await openGame(page);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('a[href]').forEach((a) => out.push('a:' + (a as HTMLAnchorElement).href));
    document.querySelectorAll('script[src], iframe[src], img[src], link[href]').forEach((e) => {
      const u = (e.getAttribute('src') ?? e.getAttribute('href')) as string;
      if (/^https?:\/\//.test(u) && new URL(u).origin !== location.origin) out.push(u);
    });
    return out;
  });
  expect(bad).toEqual([]);
});

test('защита от зума, выделения и pull-to-refresh', async ({ page }) => {
  await openGame(page);
  const info = await page.evaluate(() => {
    const vp = document.querySelector('meta[name="viewport"]')!.getAttribute('content')!;
    const cs = getComputedStyle(document.body);
    const stage = getComputedStyle(document.getElementById('stage')!);
    const prevented = (() => {
      const e = new Event('contextmenu', { cancelable: true });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    })();
    return { vp, overscroll: cs.overscrollBehaviorY, userSelect: cs.userSelect, touchAction: stage.touchAction, prevented, orientation: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') as HTMLMetaElement).content };
  });
  expect(info.vp).toContain('user-scalable=no');
  expect(info.vp).toContain('viewport-fit=cover');
  expect(info.overscroll).toBe('none');
  expect(info.userSelect).toBe('none');
  expect(info.touchAction).toBe('none');
  expect(info.prevented).toBe(true);
});
