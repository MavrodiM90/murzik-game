import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, migrate, SAVE_KEY, SAVE_VERSION, writeSave, type StorageLike } from '../src/logic/save';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

describe('сохранение и миграции', () => {
  const now = 1_700_000_000_000;

  it('новое сохранение: версия, 5000 монет, полные шкалы', () => {
    const s = defaultSave(now);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.coins).toBe(5000);
    expect(s.needs.food).toBe(100);
  });

  it('миграция v1 → текущая: шкалы сохраняются, остальное — значения по умолчанию', () => {
    const v1 = { version: 1, needs: { food: 42, sleep: 77 }, lastSeen: 123 };
    const s = migrate(v1, now);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.needs.food).toBe(42);
    expect(s.needs.sleep).toBe(77);
    expect(s.needs.toilet).toBe(100);
    expect(s.coins).toBe(5000);
    expect(s.lastSeen).toBe(123);
    expect(s.settings.volume).toBeGreaterThan(0);
    expect(s.timer.limitMin).toBe(0);
  });

  it('миграция v2 → текущая: монеты и покупки сохраняются, появляются таймер и настройки', () => {
    const v2 = { version: 2, needs: { food: 10 }, coins: 1234, owned: ['hat_cap', 'fur_gray'], equipped: { hat: 'hat_cap' }, fur: 'fur_gray' };
    const s = migrate(v2, now);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.coins).toBe(1234);
    expect(s.owned).toContain('hat_cap');
    expect(s.equipped.hat).toBe('hat_cap');
    expect(s.fur).toBe('fur_gray');
    expect(s.timer.pause).toBe('1h');
  });

  it('сохранение без поля version считается v1', () => {
    const s = migrate({ needs: { food: 5 } }, now);
    expect(s.needs.food).toBe(5);
    expect(s.version).toBe(SAVE_VERSION);
  });

  it('мусор вместо сохранения → значения по умолчанию', () => {
    for (const bad of [null, undefined, 42, 'x', [], true]) {
      expect(migrate(bad, now).coins).toBe(5000);
    }
  });

  it('чинит подделанные значения: отрицательные монеты, чужие предметы, несуществующая шапка', () => {
    const s = migrate(
      {
        version: SAVE_VERSION,
        coins: -50,
        owned: ['hat_cap', 'нет_такого', 5],
        equipped: { hat: 'hat_crown', glasses: 'hat_cap' },
        fur: 'fur_pink',
        inventory: { fish: 'x', apple: 5, cake: 7 },
        settings: { volume: 9, micSensitivity: 7 },
        timer: { limitMin: 17, pause: 'forever', playedMs: -3 },
      },
      now,
    );
    expect(s.coins).toBe(0);
    expect(s.owned).not.toContain('нет_такого');
    expect(s.equipped.hat).toBeNull(); // не куплена
    expect(s.equipped.glasses).toBeNull(); // не тот слот
    expect(s.fur).toBe('fur_orange'); // не куплен
    expect(s.inventory.cake).toBe(7);
    expect(s.inventory.apple).toBeUndefined();
    expect(s.settings.volume).toBe(1);
    expect(s.settings.micSensitivity).toBe(2);
    expect(s.timer.limitMin).toBe(0);
    expect(s.timer.pause).toBe('1h');
    expect(s.timer.playedMs).toBe(0);
  });

  it('save → load возвращает то же самое', () => {
    const st = new MemStorage();
    const s = defaultSave(now);
    s.coins = 777;
    s.needs.fun = 12;
    expect(writeSave(s, st)).toBe(true);
    expect(loadSave(now, st).coins).toBe(777);
    expect(loadSave(now, st).needs.fun).toBe(12);
  });

  it('битый JSON и недоступный localStorage не ломают игру', () => {
    const st = new MemStorage();
    st.setItem(SAVE_KEY, '{not json');
    expect(loadSave(now, st).coins).toBe(5000);
    expect(loadSave(now, null).coins).toBe(5000);
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(loadSave(now, throwing).coins).toBe(5000);
    expect(writeSave(defaultSave(now), throwing)).toBe(false);
    expect(writeSave(defaultSave(now), null)).toBe(false);
  });
});
