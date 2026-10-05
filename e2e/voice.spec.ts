import { expect, test } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers';

test.describe('повтор голоса: микрофон доступен (фейковое устройство Chromium)', () => {
  test.use({ permissions: ['microphone'] });

  test('слушает, записывает фразу, кот повторяет и стирает запись; выключение отпускает микрофон', async ({ page }) => {
    const errors = await openGame(page);
    const asked = await page.evaluate(() => (window as any).__micAsked ?? 0);
    expect(asked).toBe(0);
    await page.click('.btn-ear');
    await page.waitForFunction(() => ['listening', 'recording', 'speaking'].includes((window as any).__murzik.game.voice.state), null, { timeout: 10_000 });
    await page.waitForFunction(() => (window as any).__murzik.game.voice.repeats >= 1, null, { timeout: 60_000 });
    // после воспроизведения кот снова слушает, рот вернулся в покой
    await page.waitForFunction(() => (window as any).__murzik.game.voice.state === 'listening', null, { timeout: 10_000 });
    expect(await page.evaluate(() => (window as any).__murzik.game.cat.mouthDrive)).toBeLessThan(0.05);
    await page.click('.btn-ear');
    await page.waitForFunction(() => (window as any).__murzik.game.voice.state === 'off');
    expect(await page.evaluate(() => (window as any).__murzik.game.voice['stream'])).toBeNull();
    await expectNoErrors(errors);
  });
});

test.describe('повтор голоса: доступ к микрофону запрещён', () => {
  test.use({ permissions: [] });

  test('кот просто мяукает, игра не ломается', async ({ page, context }) => {
    await context.clearPermissions();
    const errors = await openGame(page);
    await page.evaluate(() => {
      // имитируем отказ пользователя в доступе
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await page.click('.btn-ear');
    await page.waitForFunction(() => (window as any).__murzik.game.voice.state === 'denied');
    await page.waitForFunction(() => (window as any).__murzik.game.cat.state === 'meow', null, { timeout: 3000 });
    const f1 = await page.evaluate(() => (window as any).__murzik.game.frame);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__murzik.game.frame)).toBeGreaterThan(f1);
    await page.waitForFunction(() => (window as any).__murzik.game.voice.state === 'off', null, { timeout: 4000 });
    // можно нажать снова, ничего не ломается
    await page.click('.btn-ear');
    await page.waitForFunction(() => (window as any).__murzik.game.voice.state === 'denied');
    await expectNoErrors(errors);
  });

  test('микрофон не запрашивается, пока не нажали на ушко', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__micAsked = 0;
      const md = navigator.mediaDevices;
      if (md) {
        const orig = md.getUserMedia?.bind(md);
        md.getUserMedia = (...a: any[]) => {
          (window as any).__micAsked++;
          return orig ? (orig as any)(...a) : Promise.reject(new Error('n/a'));
        };
      }
    });
    await openGame(page);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__micAsked)).toBe(0);
  });
});
