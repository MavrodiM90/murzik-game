import { TIMING } from '../config';
import { randRange, type Rng } from './math';

export interface ChestStatus {
  ready: boolean;
  remainingMs: number;
  /** часы ушли назад — отсчёт нужно начать заново (lastChestAt = now) */
  clockWentBack: boolean;
}

export function chestStatus(lastChestAt: number, now: number): ChestStatus {
  if (lastChestAt <= 0) return { ready: true, remainingMs: 0, clockWentBack: false };
  if (now < lastChestAt) return { ready: false, remainingMs: TIMING.chestIntervalMs, clockWentBack: true };
  const remaining = lastChestAt + TIMING.chestIntervalMs - now;
  return { ready: remaining <= 0, remainingMs: Math.max(0, remaining), clockWentBack: false };
}

export function chestReward(rng: Rng = Math.random): number {
  return Math.round(randRange(40, 120, rng));
}
