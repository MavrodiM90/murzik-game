// Все настраиваемые числа и цвета игры — в одном месте.

export const CAT_NAME = 'Мурзик';
export const START_COINS = 5000;

export type NeedId = 'food' | 'sleep' | 'toilet' | 'clean' | 'health' | 'fun';
export const NEED_IDS: NeedId[] = ['food', 'sleep', 'toilet', 'clean', 'health', 'fun'];

/** Падение шкал в пунктах за минуту игры. 100 → ~30 за 2–3 часа (70/0.4 = 175 мин, 70/0.55 = 127 мин). */
export const NEED_DECAY_PER_MIN: Record<Exclude<NeedId, 'health'>, number> = {
  food: 0.5,
  sleep: 0.4,
  toilet: 0.45,
  clean: 0.4,
  fun: 0.55,
};
/** Здоровье падает только если другие шкалы низкие: пунктов/мин на каждую шкалу ниже порога. */
export const HEALTH_DECAY_PER_LOW_NEED_PER_MIN = 0.15;
export const HEALTH_LOW_NEED_THRESHOLD = 30;
/** Пока игра закрыта, шкалы падают максимум до этого значения и ниже не опускаются. */
export const OFFLINE_FLOOR = 40;
/** Скорость падения шкал офлайн (пунктов/мин) — как в игре. */
export const OFFLINE_DECAY_MULT = 1;
/** Пока кот спит, остальные шкалы падают медленнее. */
export const SLEEP_DECAY_MULT = 0.3;
/** Рост шкалы сна во время сна, пунктов/сек. */
export const SLEEP_GAIN_PER_SEC = 1.6;
/** Ниже этого значения кот «чуть-чуть» грустит. */
export const SAD_THRESHOLD = 25;

export const FOOD_GAIN = { normal: 22, favorite: 40, disliked: 14 } as const;
export const VITAMIN_GAIN = 60;
export const TOILET_AFTER_EAT_COST = 3;

export const COLORS = {
  furOrange: 0xff9a3c,
  furWhite: 0xfff7ec,
  earInner: 0xffa8a8,
  nose: 0xff7a93,
  mouthInside: 0x8b1d2c,
  tongue: 0xff6b81,
  eyeWhite: 0xffffff,
  pupil: 0x1a1020,
  outline: 0x2a1a14,
  stripe: 0xe07a1f,
  blush: 0xffa3a0,
} as const;

export const FUR_VARIANTS = [
  { id: 'fur_orange', fur: 0xff9a3c, belly: 0xfff7ec, stripe: 0xe07a1f, price: 0 },
  { id: 'fur_gray', fur: 0x9aa7b8, belly: 0xf3f6fb, stripe: 0x7c8aa0, price: 300 },
  { id: 'fur_cream', fur: 0xf5d9a6, belly: 0xffffff, stripe: 0xdcbc82, price: 300 },
  { id: 'fur_choco', fur: 0x9b6a4a, belly: 0xffeedd, stripe: 0x7a4f35, price: 400 },
  { id: 'fur_black', fur: 0x4b4b5a, belly: 0xe9e9f2, stripe: 0x37373f, price: 400 },
  { id: 'fur_pink', fur: 0xffb3cf, belly: 0xffffff, stripe: 0xf08fb2, price: 500 },
] as const;

export const WALL_COLORS = [
  { id: 'wall_peach', color: 0xffe3c7, price: 0 },
  { id: 'wall_mint', color: 0xc9f0d8, price: 150 },
  { id: 'wall_sky', color: 0xc7e4ff, price: 150 },
  { id: 'wall_lilac', color: 0xe3d3ff, price: 150 },
  { id: 'wall_lemon', color: 0xfff3a8, price: 150 },
  { id: 'wall_rose', color: 0xffc9dc, price: 150 },
] as const;

export const FLOOR_COLORS = [
  { id: 'floor_wood', color: 0xd9a066, price: 0 },
  { id: 'floor_light', color: 0xf0d9b0, price: 120 },
  { id: 'floor_green', color: 0x8fd18f, price: 120 },
  { id: 'floor_blue', color: 0x8fb8f0, price: 120 },
  { id: 'floor_pink', color: 0xf0a8c0, price: 120 },
  { id: 'floor_gray', color: 0xbcc2cc, price: 120 },
] as const;

// ---- Мир и физика броска ----
export const WORLD = {
  roomWidth: 7.6, // видимая ширина на плоскости кота
  roomHalfWidth: 3.8,
  ceiling: 13,
  roomSpacing: 12,
  catScale: 1.15,
  catRadiusX: 1.45, // ограничивающий «овал» кота в мировых единицах
  catRadiusY: 2.25,
  restY: 2.25, // высота центра кота, когда он стоит
} as const;

export const PHYSICS = {
  gravity: 38,
  restitutionFloor: 0.45,
  restitutionWall: 0.6,
  airDrag: 0.15,
  groundFriction: 6,
  maxSpeed: 34,
  maxSpin: 14,
  settleSpeed: 1.2,
  maxFlightTime: 9, // защита от застревания: после этого принудительно приземляем
  substep: 1 / 120,
} as const;

export const GESTURE = {
  tapMaxMs: 280,
  tapMaxMove: 16,
  grabHoldMs: 450,
  slapSpeed: 1.2, // px/мс за первые движения
  slapMinDist: 40,
  petMinPath: 30,
  tickleTaps: 6,
  tickleWindowMs: 2200,
  doubleTapMs: 340,
  velocityWindowMs: 90,
  throwSpeedScale: 1,
} as const;

export const TIMING = {
  idleMinSec: 6,
  idleMaxSec: 15,
  dizzySec: 2,
  chestIntervalMs: 4 * 60 * 60 * 1000,
  saveIntervalMs: 5000,
} as const;

export const MINIGAME = {
  durationSec: 50,
  minReward: 20,
  maxReward: 100,
} as const;

export const VOICE = {
  defaultThreshold: 0.04, // RMS
  silenceSec: 0.8,
  maxRecordSec: 5,
  minVoicedSec: 0.25,
  playbackRate: 1.6,
  preRollSec: 0.25,
} as const;

export const PARENTAL = {
  gearHoldMs: 3000,
  timerOptionsMin: [0, 10, 15, 20, 30, 45] as const,
  pauseOptions: ['30m', '1h', '2h', 'tomorrow'] as const,
  tomorrowHour: 6,
  clockBackTolerationMs: 60_000,
} as const;
