import { describe, expect, it } from 'vitest';
import { checkAnswer, makeProblem } from '../src/logic/parentalMath';
import { mulberry32 } from '../src/logic/math';
import {
  isLocked,
  lockRemainingMs,
  observeClock,
  parentBypass,
  pauseDurationMs,
  remainingPlayMs,
  resumeSession,
  startLock,
  tickPlay,
} from '../src/logic/playTimer';
import { defaultSave, migrate, type TimerState } from '../src/logic/save';

const MIN = 60_000;
const T0 = new Date(2026, 5, 10, 15, 0, 0).getTime(); // 10 июня 2026, 15:00 местного

function timer(limitMin = 20, pause: TimerState['pause'] = '1h', now = T0): TimerState {
  const t = defaultSave(now).timer;
  t.limitMin = limitMin;
  t.pause = pause;
  return t;
}

/** Играем указанное число минут «шагами» по секунде. */
function play(t: TimerState, minutes: number, startNow: number): { now: number; locked: boolean } {
  let now = startNow;
  let locked = false;
  for (let i = 0; i < minutes * 60; i++) {
    now += 1000;
    if (tickPlay(t, 1000, now)) locked = true;
  }
  return { now, locked };
}

describe('таймер игры и пауза', () => {
  it('таймер выключен — никогда не блокирует', () => {
    const t = timer(0);
    const r = play(t, 120, T0);
    expect(r.locked).toBe(false);
    expect(isLocked(t, r.now)).toBe(false);
  });

  it('после лимита включается пауза нужной длины', () => {
    const t = timer(20, '1h');
    const r = play(t, 21, T0);
    expect(r.locked).toBe(true);
    expect(isLocked(t, r.now)).toBe(true);
    expect(lockRemainingMs(t, r.now)).toBeGreaterThan(55 * MIN);
    expect(lockRemainingMs(t, r.now)).toBeLessThanOrEqual(60 * MIN);
  });

  it('в паузе время игры не копится, по её окончании окно начинается заново', () => {
    const t = timer(10, '30m');
    const r = play(t, 11, T0);
    expect(r.locked).toBe(true);
    expect(isLocked(t, r.now + 28 * MIN)).toBe(true);
    expect(isLocked(t, r.now + 31 * MIN)).toBe(false);
    expect(t.playedMs).toBe(0);
    expect(remainingPlayMs(t)).toBe(10 * MIN);
  });

  it('варианты паузы: 30 мин, 1 ч, 2 ч, до завтра (до 6:00)', () => {
    expect(pauseDurationMs('30m', T0)).toBe(30 * MIN);
    expect(pauseDurationMs('1h', T0)).toBe(60 * MIN);
    expect(pauseDurationMs('2h', T0)).toBe(120 * MIN);
    const tomorrow = pauseDurationMs('tomorrow', T0);
    const end = new Date(T0 + tomorrow);
    expect(end.getHours()).toBe(6);
    expect(end.getDate()).toBe(11);
  });

  it('перезагрузка страницы: накопленное время и пауза переживают сохранение', () => {
    const t = timer(20, '1h');
    const r = play(t, 12, T0);
    const saved = JSON.parse(JSON.stringify({ ...defaultSave(r.now), timer: t }));
    const t2 = migrate(saved, r.now + 5000).timer;
    resumeSession(t2, r.now + 5000);
    expect(t2.playedMs).toBeGreaterThan(11 * MIN);
    expect(isLocked(t2, r.now + 5000)).toBe(false);
    // доигрываем до конца окна
    const r2 = play(t2, 9, r.now + 5000);
    expect(r2.locked).toBe(true);
    // и снова «перезагружаемся» посреди паузы
    const t3 = migrate(JSON.parse(JSON.stringify({ ...defaultSave(r2.now), timer: t2 })), r2.now + 10 * MIN).timer;
    resumeSession(t3, r2.now + 10 * MIN);
    expect(isLocked(t3, r2.now + 10 * MIN)).toBe(true);
    expect(isLocked(t3, r2.now + 61 * MIN)).toBe(false);
  });

  it('долгое отсутствие обнуляет окно игры, короткое — нет', () => {
    const t = timer(20, '1h');
    const r = play(t, 15, T0);
    resumeSession(t, r.now + 10 * MIN);
    expect(t.playedMs).toBeGreaterThan(14 * MIN);
    resumeSession(t, r.now + 10 * MIN + 61 * MIN);
    expect(t.playedMs).toBe(0);
  });

  it('перевод часов назад во время паузы: пауза отсчитывается заново', () => {
    const t = timer(10, '1h');
    const r = play(t, 11, T0);
    const lockEndBefore = t.lockUntil;
    // родитель/ребёнок перевёл часы на 3 часа назад
    const back = r.now - 3 * 60 * MIN;
    expect(observeClock(t, back)).toBe(true);
    expect(isLocked(t, back)).toBe(true);
    expect(t.lockUntil).toBe(back + 60 * MIN);
    expect(t.lockUntil).toBeLessThan(lockEndBefore);
    // «бесконечной игры» нет: через 59 минут от нового времени всё ещё спит
    expect(isLocked(t, back + 59 * MIN)).toBe(true);
    expect(isLocked(t, back + 61 * MIN)).toBe(false);
  });

  it('часы назад на несколько секунд (NTP) не сбрасывают паузу', () => {
    const t = timer(10, '1h');
    const r = play(t, 11, T0);
    const end = t.lockUntil;
    observeClock(t, r.now - 5000);
    expect(t.lockUntil).toBe(end);
  });

  it('часы назад вне паузы не дают лишнего игрового времени и не ломают счёт', () => {
    const t = timer(20, '1h');
    const r = play(t, 5, T0);
    const before = t.playedMs;
    tickPlay(t, 1000, r.now - 3 * 60 * MIN);
    expect(t.playedMs).toBeGreaterThanOrEqual(before);
    const r2 = play(t, 16, r.now - 3 * 60 * MIN);
    expect(r2.locked).toBe(true);
  });

  it('родительская проверка снимает паузу', () => {
    const t = timer(10, '2h');
    const r = play(t, 11, T0);
    expect(isLocked(t, r.now)).toBe(true);
    parentBypass(t);
    expect(isLocked(t, r.now)).toBe(false);
    expect(t.playedMs).toBe(0);
  });

  it('startLock запоминает исходную длительность', () => {
    const t = timer(10, '30m');
    startLock(t, T0);
    expect(t.lockDurationMs).toBe(30 * MIN);
    expect(t.lockUntil).toBe(T0 + 30 * MIN);
  });
});

describe('родительская проверка (пример на умножение)', () => {
  it('двузначное × однозначное, ответ проверяется цифрами', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const p = makeProblem(rng);
      expect(p.a).toBeGreaterThanOrEqual(10);
      expect(p.a).toBeLessThanOrEqual(99);
      expect(p.b).toBeGreaterThanOrEqual(2);
      expect(p.b).toBeLessThanOrEqual(9);
      expect(checkAnswer(p, String(p.answer))).toBe(true);
      expect(checkAnswer(p, String(p.answer + 1))).toBe(false);
    }
    const p = { a: 23, b: 4, answer: 92 };
    expect(checkAnswer(p, '92')).toBe(true);
    expect(checkAnswer(p, '')).toBe(false);
    expect(checkAnswer(p, '9a')).toBe(false);
    expect(checkAnswer(p, '-92')).toBe(false);
    expect(checkAnswer(p, '0092')).toBe(true);
  });
});
