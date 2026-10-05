import { PARENTAL } from '../config';
import type { PauseKey, TimerState } from './save';

const MIN = 60_000;

/** Длительность паузы. «До завтра» — до 6:00 следующего дня по местному времени. */
export function pauseDurationMs(key: PauseKey, now: number): number {
  switch (key) {
    case '30m':
      return 30 * MIN;
    case '1h':
      return 60 * MIN;
    case '2h':
      return 120 * MIN;
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(PARENTAL.tomorrowHour, 0, 0, 0);
      return Math.max(MIN, d.getTime() - now);
    }
  }
}

/** После такого отсутствия окно игрового времени обнуляется. */
function awayResetMs(key: PauseKey): number {
  return key === 'tomorrow' ? 8 * 60 * MIN : pauseDurationMs(key, 0);
}

/**
 * Сверка с часами. Если время ушло назад больше допуска и идёт пауза — пауза начинается заново
 * (иначе перевод часов даёт бесконечную игру). Возвращает true, если это произошло.
 */
export function observeClock(t: TimerState, now: number): boolean {
  let restarted = false;
  if (now < t.lastSeen - PARENTAL.clockBackTolerationMs) {
    if (t.lockUntil > 0) {
      t.lockStartedAt = now;
      t.lockUntil = now + t.lockDurationMs;
      restarted = true;
    }
    t.lastSeen = now;
  } else if (now > t.lastSeen) {
    t.lastSeen = now;
  }
  if (t.lockUntil > 0 && now >= t.lockUntil) {
    t.lockUntil = 0;
    t.playedMs = 0;
    t.lockDurationMs = 0;
    t.lockStartedAt = 0;
  }
  return restarted;
}

export function isLocked(t: TimerState, now: number): boolean {
  observeClock(t, now);
  return t.lockUntil > now;
}

export function lockRemainingMs(t: TimerState, now: number): number {
  return t.lockUntil > now ? t.lockUntil - now : 0;
}

export function startLock(t: TimerState, now: number): void {
  const dur = pauseDurationMs(t.pause, now);
  t.lockStartedAt = now;
  t.lockDurationMs = dur;
  t.lockUntil = now + dur;
  t.playedMs = 0;
}

/** Вызывать при старте/возврате в игру: сброс окна, если ребёнок долго не играл. */
export function resumeSession(t: TimerState, now: number): void {
  const away = now - t.lastSeen;
  const wasLocked = t.lockUntil > 0;
  observeClock(t, now);
  if (!wasLocked && away >= awayResetMs(t.pause)) t.playedMs = 0;
}

/** Добавляет время игры. Возвращает true, если таймер только что вышел и началась пауза. */
export function tickPlay(t: TimerState, dtMs: number, now: number): boolean {
  observeClock(t, now);
  if (t.lockUntil > now) return false;
  if (t.limitMin <= 0 || !(dtMs > 0)) return false;
  t.playedMs += Math.min(dtMs, 5000);
  if (t.playedMs >= t.limitMin * MIN) {
    startLock(t, now);
    return true;
  }
  return false;
}

export function remainingPlayMs(t: TimerState): number {
  return t.limitMin > 0 ? Math.max(0, t.limitMin * MIN - t.playedMs) : Infinity;
}

/** Родитель прошёл проверку: снять паузу и начать окно заново. */
export function parentBypass(t: TimerState): void {
  t.lockUntil = 0;
  t.lockStartedAt = 0;
  t.lockDurationMs = 0;
  t.playedMs = 0;
}
