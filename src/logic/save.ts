import { PARENTAL, START_COINS } from '../config';
import { DEFAULT_OWNED, FAVORITE_FOOD, getItem } from './catalog';
import { clamp } from './math';
import { fullNeeds, sanitizeNeeds, type Needs } from './needs';

export const SAVE_KEY = 'murzik.save';
export const SAVE_VERSION = 3;

export type RoomKey = 'living' | 'kitchen' | 'bath' | 'bedroom';
export type PauseKey = (typeof PARENTAL.pauseOptions)[number];

export interface TimerState {
  limitMin: number; // 0 — выкл
  pause: PauseKey;
  /** накопленное время игры в текущем окне, мс */
  playedMs: number;
  /** до какого момента (epoch мс) кот «спит»; 0 — не заблокировано */
  lockUntil: number;
  /** когда блокировка началась и её исходная длительность — для пересчёта при переводе часов назад */
  lockStartedAt: number;
  lockDurationMs: number;
  /** последнее наблюдаемое время — детектор перевода часов назад */
  lastSeen: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  lastSeen: number;
  needs: Needs;
  coins: number;
  owned: string[];
  equipped: { hat: string | null; glasses: string | null; bow: string | null; scarf: string | null };
  fur: string;
  wall: Record<RoomKey, string>;
  floor: Record<RoomKey, string>;
  inventory: Record<string, number>;
  favoriteFood: string;
  lastChestAt: number;
  settings: { volume: number; voiceRepeat: boolean; micSensitivity: 1 | 2 | 3 };
  timer: TimerState;
}

const ROOMS: RoomKey[] = ['living', 'kitchen', 'bath', 'bedroom'];

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    needs: fullNeeds(),
    coins: START_COINS,
    owned: [...DEFAULT_OWNED],
    equipped: { hat: null, glasses: null, bow: null, scarf: null },
    fur: 'fur_orange',
    wall: { living: 'wall_peach', kitchen: 'wall_peach', bath: 'wall_peach', bedroom: 'wall_peach' },
    floor: { living: 'floor_wood', kitchen: 'floor_wood', bath: 'floor_wood', bedroom: 'floor_wood' },
    inventory: { fish: 3, cake: 2 },
    favoriteFood: FAVORITE_FOOD,
    lastChestAt: 0,
    settings: { volume: 0.8, voiceRepeat: true, micSensitivity: 2 },
    timer: { limitMin: 0, pause: '1h', playedMs: 0, lockUntil: 0, lockStartedAt: 0, lockDurationMs: 0, lastSeen: now },
  };
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d;

/** Шаги миграции: каждый поднимает версию на 1. */
const MIGRATIONS: Record<number, (raw: Raw, now: number) => Raw> = {
  // v1 (шкалы и время визита) → v2: экономика и гардероб
  1: (raw, now) => {
    const d = defaultSave(now);
    return {
      ...raw,
      version: 2,
      coins: raw.coins ?? d.coins,
      owned: raw.owned ?? d.owned,
      equipped: raw.equipped ?? d.equipped,
      fur: raw.fur ?? d.fur,
      wall: raw.wall ?? d.wall,
      floor: raw.floor ?? d.floor,
      inventory: raw.inventory ?? d.inventory,
      favoriteFood: raw.favoriteFood ?? d.favoriteFood,
      lastChestAt: raw.lastChestAt ?? 0,
    };
  },
  // v2 → v3: настройки и родительский таймер
  2: (raw, now) => {
    const d = defaultSave(now);
    return { ...raw, version: 3, settings: raw.settings ?? d.settings, timer: raw.timer ?? d.timer };
  },
};

/** Любой JSON → корректное сохранение текущей версии. Не бросает исключений. */
export function migrate(input: unknown, now = Date.now()): SaveData {
  if (!isObj(input)) return defaultSave(now);
  let raw: Raw = input;
  let v = typeof raw.version === 'number' && Number.isFinite(raw.version) ? Math.floor(raw.version) : 1;
  if (v < 1) v = 1;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    raw = step(raw, now);
    v = Number(raw.version);
  }
  return sanitize(raw, now);
}

export function sanitize(raw: Raw, now: number): SaveData {
  const d = defaultSave(now);
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((x): x is string => typeof x === 'string' && !!getItem(x)) : d.owned;
  const ownedSet = new Set([...owned, ...DEFAULT_OWNED]);
  const eq = isObj(raw.equipped) ? raw.equipped : {};
  const eqSlot = (slot: 'hat' | 'glasses' | 'bow' | 'scarf'): string | null => {
    const id = eq[slot];
    return typeof id === 'string' && ownedSet.has(id) && getItem(id)?.kind === slot ? id : null;
  };
  const room = (src: unknown, def: Record<RoomKey, string>, kind: 'wall' | 'floor'): Record<RoomKey, string> => {
    const out = { ...def };
    if (isObj(src)) {
      for (const r of ROOMS) {
        const id = src[r];
        if (typeof id === 'string' && ownedSet.has(id) && getItem(id)?.kind === kind) out[r] = id;
      }
    }
    return out;
  };
  const inv: Record<string, number> = {};
  if (isObj(raw.inventory)) {
    for (const [k, val] of Object.entries(raw.inventory)) {
      const it = getItem(k);
      if (it && it.kind === 'food' && !it.free) inv[k] = Math.floor(num(val, 0, 0, 999));
    }
  }
  const fur = typeof raw.fur === 'string' && ownedSet.has(raw.fur) && getItem(raw.fur)?.kind === 'fur' ? raw.fur : d.fur;
  const s = isObj(raw.settings) ? raw.settings : {};
  const t = isObj(raw.timer) ? raw.timer : {};
  const ms = s.micSensitivity;
  const pause = (PARENTAL.pauseOptions as readonly unknown[]).includes(t.pause) ? (t.pause as PauseKey) : d.timer.pause;
  const limit = (PARENTAL.timerOptionsMin as readonly unknown[]).includes(t.limitMin) ? (t.limitMin as number) : 0;
  return {
    version: SAVE_VERSION,
    createdAt: num(raw.createdAt, now, 0),
    lastSeen: num(raw.lastSeen, now, 0),
    needs: sanitizeNeeds(raw.needs),
    coins: Math.floor(num(raw.coins, START_COINS, 0, 99_999_999)),
    owned: [...ownedSet],
    equipped: { hat: eqSlot('hat'), glasses: eqSlot('glasses'), bow: eqSlot('bow'), scarf: eqSlot('scarf') },
    fur,
    wall: room(raw.wall, d.wall, 'wall'),
    floor: room(raw.floor, d.floor, 'floor'),
    inventory: inv,
    favoriteFood: typeof raw.favoriteFood === 'string' && getItem(raw.favoriteFood)?.kind === 'food' ? raw.favoriteFood : FAVORITE_FOOD,
    lastChestAt: num(raw.lastChestAt, 0, 0),
    settings: {
      volume: num(s.volume, d.settings.volume, 0, 1),
      voiceRepeat: typeof s.voiceRepeat === 'boolean' ? s.voiceRepeat : true,
      micSensitivity: ms === 1 || ms === 3 ? ms : 2,
    },
    timer: {
      limitMin: limit,
      pause,
      playedMs: num(t.playedMs, 0, 0, 1e10),
      lockUntil: num(t.lockUntil, 0, 0),
      lockStartedAt: num(t.lockStartedAt, 0, 0),
      lockDurationMs: num(t.lockDurationMs, 0, 0, 1e10),
      lastSeen: num(t.lastSeen, now, 0),
    },
  };
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave(now = Date.now(), storage: StorageLike | null = defaultStorage()): SaveData {
  try {
    const txt = storage?.getItem(SAVE_KEY);
    if (!txt) return defaultSave(now);
    return migrate(JSON.parse(txt), now);
  } catch {
    return defaultSave(now);
  }
}

export function writeSave(save: SaveData, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* ок */
  }
}
