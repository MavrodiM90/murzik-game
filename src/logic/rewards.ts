import { MINIGAME } from '../config';
import { clamp } from './math';

/** Монеты за мини-игру: зависят от результата, но не меньше MINIGAME.minReward. */
export function miniGameReward(score: number, goodScore: number): number {
  if (!Number.isFinite(score) || score < 0) score = 0;
  const k = clamp(score / Math.max(1, goodScore), 0, 1);
  return Math.round(MINIGAME.minReward + k * (MINIGAME.maxReward - MINIGAME.minReward));
}
