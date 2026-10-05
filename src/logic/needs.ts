import {
  HEALTH_DECAY_PER_LOW_NEED_PER_MIN,
  HEALTH_LOW_NEED_THRESHOLD,
  NEED_DECAY_PER_MIN,
  NEED_IDS,
  OFFLINE_DECAY_MULT,
  OFFLINE_FLOOR,
  SLEEP_DECAY_MULT,
  type NeedId,
} from '../config';
import { clamp } from './math';

export type Needs = Record<NeedId, number>;
type DecayId = Exclude<NeedId, 'health'>;
const DECAY_IDS = Object.keys(NEED_DECAY_PER_MIN) as DecayId[];

export const fullNeeds = (): Needs => ({ food: 100, sleep: 100, toilet: 100, clean: 100, health: 100, fun: 100 });

export const cloneNeeds = (n: Needs): Needs => ({ ...n });

export function sanitizeNeeds(raw: unknown): Needs {
  const out = fullNeeds();
  if (raw && typeof raw === 'object') {
    for (const id of NEED_IDS) {
      const v = (raw as Record<string, unknown>)[id];
      if (typeof v === 'number' && Number.isFinite(v)) out[id] = clamp(v, 0, 100);
    }
  }
  return out;
}

/** Падение шкал за время игры (минуты). Здоровье падает только если другие шкалы низкие. */
export function decayNeeds(n: Needs, minutes: number, sleeping = false): Needs {
  if (!(minutes > 0)) return n;
  const mult = sleeping ? SLEEP_DECAY_MULT : 1;
  for (const id of DECAY_IDS) {
    if (id === 'sleep' && sleeping) continue;
    n[id] = clamp(n[id] - NEED_DECAY_PER_MIN[id] * minutes * mult, 0, 100);
  }
  const low = DECAY_IDS.filter((id) => n[id] < HEALTH_LOW_NEED_THRESHOLD).length;
  if (low > 0) n.health = clamp(n.health - HEALTH_DECAY_PER_LOW_NEED_PER_MIN * low * minutes, 0, 100);
  return n;
}

/**
 * Пока игра закрыта: шкалы падают не ниже OFFLINE_FLOOR (40%). Если шкала уже ниже — не трогаем.
 * Здоровье офлайн не меняется. Отрицательное/нулевое время (часы назад) ничего не меняет.
 */
export function offlineDecay(n: Needs, elapsedMs: number): Needs {
  if (!(elapsedMs > 0) || !Number.isFinite(elapsedMs)) return n;
  const minutes = elapsedMs / 60000;
  for (const id of DECAY_IDS) {
    const cur = n[id];
    if (cur <= OFFLINE_FLOOR) continue;
    n[id] = Math.max(OFFLINE_FLOOR, cur - NEED_DECAY_PER_MIN[id] * OFFLINE_DECAY_MULT * minutes);
  }
  return n;
}

export function gain(n: Needs, id: NeedId, amount: number): void {
  n[id] = clamp(n[id] + amount, 0, 100);
}

/** Самая низкая потребность (для пульсации иконки). null — если все в порядке. */
export function lowestNeed(n: Needs, threshold = 60): NeedId | null {
  let best: NeedId | null = null;
  for (const id of NEED_IDS) if (n[id] < threshold && (best === null || n[id] < n[best])) best = id;
  return best;
}

/** Комната, где решается потребность. */
export const NEED_ROOM: Record<NeedId, 'living' | 'kitchen' | 'bath' | 'bedroom'> = {
  food: 'kitchen',
  sleep: 'bedroom',
  toilet: 'bath',
  clean: 'bath',
  health: 'bath',
  fun: 'living',
};

/** Зелёный → жёлтый → красный */
export function needColor(v: number): string {
  const t = clamp(v / 100, 0, 1);
  const hue = Math.round(t * 120);
  return `hsl(${hue} 80% 48%)`;
}

/** Насколько кот «чуть-чуть» грустит: 0…0.6 */
export function moodFromNeeds(n: Needs, threshold = 25): number {
  const low = Math.min(...NEED_IDS.map((id) => n[id]));
  if (low >= threshold) return 0;
  return clamp((threshold - low) / threshold, 0, 1) * 0.6;
}
