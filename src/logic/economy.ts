import { getItem, type AccessorySlot } from './catalog';
import type { RoomKey, SaveData } from './save';

export type BuyResult = { ok: true } | { ok: false; reason: 'unknown' | 'owned' | 'poor' | 'free' };

export function canAfford(save: SaveData, price: number): boolean {
  return save.coins >= price;
}

export const isOwned = (save: SaveData, id: string): boolean => save.owned.includes(id);

/** Покупка: еда — порциями (можно покупать снова), остальное — один раз. Никаких реальных денег. */
export function buy(save: SaveData, id: string): BuyResult {
  const item = getItem(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (item.kind === 'food') {
    if (item.free) return { ok: false, reason: 'free' };
    if (!canAfford(save, item.price)) return { ok: false, reason: 'poor' };
    save.coins -= item.price;
    save.inventory[id] = (save.inventory[id] ?? 0) + (item.batch ?? 1);
    return { ok: true };
  }
  if (isOwned(save, id)) return { ok: false, reason: 'owned' };
  if (!canAfford(save, item.price)) return { ok: false, reason: 'poor' };
  save.coins -= item.price;
  save.owned.push(id);
  return { ok: true };
}

export function earn(save: SaveData, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  save.coins = Math.min(99_999_999, save.coins + Math.floor(amount));
}

export function equip(save: SaveData, id: string): boolean {
  const item = getItem(id);
  if (!item || !['hat', 'glasses', 'bow', 'scarf'].includes(item.kind) || !isOwned(save, id)) return false;
  save.equipped[item.kind as AccessorySlot] = id;
  return true;
}

export function unequip(save: SaveData, slot: AccessorySlot): void {
  save.equipped[slot] = null;
}

export function setFur(save: SaveData, id: string): boolean {
  if (getItem(id)?.kind !== 'fur' || !isOwned(save, id)) return false;
  save.fur = id;
  return true;
}

export function setRoomStyle(save: SaveData, kind: 'wall' | 'floor', room: RoomKey, id: string): boolean {
  if (getItem(id)?.kind !== kind || !isOwned(save, id)) return false;
  save[kind][room] = id;
  return true;
}

/** Взять порцию еды из холодильника. */
export function consumeFood(save: SaveData, id: string): boolean {
  const item = getItem(id);
  if (!item || item.kind !== 'food') return false;
  if (item.free) return true;
  const n = save.inventory[id] ?? 0;
  if (n <= 0) return false;
  save.inventory[id] = n - 1;
  return true;
}

export function foodCount(save: SaveData, id: string): number {
  const item = getItem(id);
  if (!item) return 0;
  return item.free ? Infinity : (save.inventory[id] ?? 0);
}
