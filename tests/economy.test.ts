import { describe, expect, it } from 'vitest';
import { START_COINS } from '../src/config';
import { ALL_ITEMS, HATS, GLASSES, BOWS, SCARVES, FURS, getItem } from '../src/logic/catalog';
import { chestReward, chestStatus } from '../src/logic/chest';
import { buy, consumeFood, earn, equip, foodCount, setFur, setRoomStyle, unequip } from '../src/logic/economy';
import { mulberry32 } from '../src/logic/math';
import { miniGameReward } from '../src/logic/rewards';
import { defaultSave } from '../src/logic/save';
import { TIMING, MINIGAME } from '../src/config';

describe('экономика', () => {
  it('стартовый баланс 5000', () => {
    expect(START_COINS).toBe(5000);
    expect(defaultSave().coins).toBe(5000);
  });

  it('покупка шапки списывает монеты и добавляет предмет', () => {
    const s = defaultSave();
    const hat = HATS[0]!;
    expect(buy(s, hat.id)).toEqual({ ok: true });
    expect(s.coins).toBe(5000 - hat.price);
    expect(s.owned).toContain(hat.id);
  });

  it('повторная покупка того же предмета запрещена и не списывает монеты', () => {
    const s = defaultSave();
    buy(s, HATS[0]!.id);
    const coins = s.coins;
    expect(buy(s, HATS[0]!.id)).toEqual({ ok: false, reason: 'owned' });
    expect(s.coins).toBe(coins);
  });

  it('недостаток монет: отказ, баланс не меняется', () => {
    const s = defaultSave();
    s.coins = 50;
    expect(buy(s, 'hat_crown')).toEqual({ ok: false, reason: 'poor' });
    expect(s.coins).toBe(50);
    expect(s.owned).not.toContain('hat_crown');
  });

  it('ровно хватает монет — покупка проходит, баланс 0', () => {
    const s = defaultSave();
    s.coins = getItem('hat_crown')!.price;
    expect(buy(s, 'hat_crown').ok).toBe(true);
    expect(s.coins).toBe(0);
  });

  it('неизвестный предмет', () => {
    expect(buy(defaultSave(), 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('еда покупается порциями и расходуется; бесплатная неограничена', () => {
    const s = defaultSave();
    s.inventory = {};
    expect(foodCount(s, 'cake')).toBe(0);
    expect(consumeFood(s, 'cake')).toBe(false);
    expect(buy(s, 'cake').ok).toBe(true);
    expect(foodCount(s, 'cake')).toBe(getItem('cake')!.batch);
    expect(consumeFood(s, 'cake')).toBe(true);
    expect(consumeFood(s, 'apple')).toBe(true);
    expect(buy(s, 'apple')).toEqual({ ok: false, reason: 'free' });
  });

  it('надеть/снять работает только для купленного', () => {
    const s = defaultSave();
    expect(equip(s, 'hat_cap')).toBe(false);
    buy(s, 'hat_cap');
    expect(equip(s, 'hat_cap')).toBe(true);
    expect(s.equipped.hat).toBe('hat_cap');
    unequip(s, 'hat');
    expect(s.equipped.hat).toBeNull();
  });

  it('окрас и обои/пол: нужно владеть', () => {
    const s = defaultSave();
    expect(setFur(s, 'fur_gray')).toBe(false);
    buy(s, 'fur_gray');
    expect(setFur(s, 'fur_gray')).toBe(true);
    expect(setRoomStyle(s, 'wall', 'kitchen', 'wall_mint')).toBe(false);
    buy(s, 'wall_mint');
    expect(setRoomStyle(s, 'wall', 'kitchen', 'wall_mint')).toBe(true);
    expect(s.wall.kitchen).toBe('wall_mint');
    expect(setRoomStyle(s, 'floor', 'kitchen', 'wall_mint')).toBe(false);
  });

  it('earn добавляет только положительные конечные суммы', () => {
    const s = defaultSave();
    earn(s, 25);
    earn(s, -100);
    earn(s, Number.NaN);
    expect(s.coins).toBe(5025);
  });

  it('каталог: 10+ шапок, очков, бантов, шарфов, 4–6 окрасов', () => {
    expect(HATS.length).toBeGreaterThanOrEqual(10);
    expect(GLASSES.length + BOWS.length + SCARVES.length).toBeGreaterThanOrEqual(10);
    expect(FURS.length).toBeGreaterThanOrEqual(4);
    expect(FURS.length).toBeLessThanOrEqual(6);
    expect(new Set(ALL_ITEMS.map((i) => i.id)).size).toBe(ALL_ITEMS.length);
  });
});

describe('сундучок и награды', () => {
  const H4 = TIMING.chestIntervalMs;
  it('сундучок готов в первый раз, потом раз в 4 часа', () => {
    expect(chestStatus(0, 1000).ready).toBe(true);
    const t0 = 1_000_000;
    expect(chestStatus(t0, t0 + H4 - 1).ready).toBe(false);
    expect(chestStatus(t0, t0 + H4).ready).toBe(true);
    expect(chestStatus(t0, t0 + 1000).remainingMs).toBe(H4 - 1000);
  });

  it('часы назад: сундучок не открывается, отсчёт заново', () => {
    const st = chestStatus(5_000_000, 1_000_000);
    expect(st.ready).toBe(false);
    expect(st.clockWentBack).toBe(true);
  });

  it('награда сундучка в диапазоне', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const r = chestReward(rng);
      expect(r).toBeGreaterThanOrEqual(40);
      expect(r).toBeLessThanOrEqual(120);
    }
  });

  it('мини-игра: всегда не меньше 20 монет, растёт с результатом, ограничена', () => {
    expect(miniGameReward(0, 20)).toBe(MINIGAME.minReward);
    expect(miniGameReward(-5, 20)).toBe(MINIGAME.minReward);
    expect(miniGameReward(Number.NaN, 20)).toBe(MINIGAME.minReward);
    expect(miniGameReward(10, 20)).toBeGreaterThan(MINIGAME.minReward);
    expect(miniGameReward(1000, 20)).toBe(MINIGAME.maxReward);
    expect(miniGameReward(15, 20)).toBeGreaterThanOrEqual(miniGameReward(10, 20));
  });
});
