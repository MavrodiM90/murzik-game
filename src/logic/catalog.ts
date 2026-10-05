import { FLOOR_COLORS, FUR_VARIANTS, WALL_COLORS } from '../config';

export type AccessorySlot = 'hat' | 'glasses' | 'bow' | 'scarf';
export type ItemKind = 'food' | AccessorySlot | 'fur' | 'wall' | 'floor';

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  price: number;
  /** для еды: сколько порций даёт покупка */
  batch?: number;
  /** бесплатная и неограниченная (лежит в холодильнике всегда) */
  free?: boolean;
  /** для еды: нелюбимая (брокколи) */
  disliked?: boolean;
  color?: number;
}

export const FOODS: Item[] = [
  { id: 'apple', kind: 'food', name: 'Яблоко', price: 0, free: true },
  { id: 'broccoli', kind: 'food', name: 'Брокколи', price: 0, free: true, disliked: true },
  { id: 'milk', kind: 'food', name: 'Молоко', price: 0, free: true },
  { id: 'fish', kind: 'food', name: 'Рыбка', price: 15, batch: 5 },
  { id: 'cheese', kind: 'food', name: 'Сыр', price: 12, batch: 5 },
  { id: 'sausage', kind: 'food', name: 'Сосиска', price: 18, batch: 5 },
  { id: 'cookie', kind: 'food', name: 'Печенька', price: 10, batch: 5 },
  { id: 'cake', kind: 'food', name: 'Тортик', price: 30, batch: 3 },
  { id: 'icecream', kind: 'food', name: 'Мороженое', price: 25, batch: 3 },
];

export const HATS: Item[] = [
  { id: 'hat_cap', kind: 'hat', name: 'Кепка', price: 120 },
  { id: 'hat_beanie', kind: 'hat', name: 'Шапочка', price: 100 },
  { id: 'hat_party', kind: 'hat', name: 'Праздничный колпак', price: 150 },
  { id: 'hat_crown', kind: 'hat', name: 'Корона', price: 400 },
  { id: 'hat_top', kind: 'hat', name: 'Цилиндр', price: 300 },
  { id: 'hat_chef', kind: 'hat', name: 'Поварской колпак', price: 200 },
  { id: 'hat_wizard', kind: 'hat', name: 'Колпак волшебника', price: 350 },
  { id: 'hat_cowboy', kind: 'hat', name: 'Ковбойская шляпа', price: 280 },
  { id: 'hat_flower', kind: 'hat', name: 'Веночек', price: 180 },
  { id: 'hat_propeller', kind: 'hat', name: 'Пропеллер', price: 220 },
  { id: 'hat_helmet', kind: 'hat', name: 'Космошлем', price: 450 },
];

export const GLASSES: Item[] = [
  { id: 'gl_round', kind: 'glasses', name: 'Круглые очки', price: 150 },
  { id: 'gl_sun', kind: 'glasses', name: 'Тёмные очки', price: 200 },
  { id: 'gl_heart', kind: 'glasses', name: 'Очки-сердечки', price: 250 },
  { id: 'gl_star', kind: 'glasses', name: 'Очки-звёздочки', price: 250 },
  { id: 'gl_goggles', kind: 'glasses', name: 'Лётные очки', price: 300 },
];

export const BOWS: Item[] = [
  { id: 'bow_red', kind: 'bow', name: 'Красный бантик', price: 90, color: 0xff4d6d },
  { id: 'bow_blue', kind: 'bow', name: 'Синий бантик', price: 90, color: 0x4da3ff },
  { id: 'bow_pink', kind: 'bow', name: 'Розовый бантик', price: 90, color: 0xff9fd0 },
  { id: 'bow_yellow', kind: 'bow', name: 'Жёлтый бантик', price: 90, color: 0xffd23f },
  { id: 'bow_dots', kind: 'bow', name: 'Бантик в горошек', price: 140, color: 0xb48cff },
];

export const SCARVES: Item[] = [
  { id: 'sc_red', kind: 'scarf', name: 'Красный шарфик', price: 110, color: 0xff4d4d },
  { id: 'sc_blue', kind: 'scarf', name: 'Синий шарфик', price: 110, color: 0x4d8dff },
  { id: 'sc_green', kind: 'scarf', name: 'Зелёный шарфик', price: 110, color: 0x4ccf7a },
  { id: 'sc_yellow', kind: 'scarf', name: 'Жёлтый шарфик', price: 110, color: 0xffd23f },
  { id: 'sc_stripe', kind: 'scarf', name: 'Полосатый шарфик', price: 160, color: 0xff7aa8 },
];

export const FURS: Item[] = FUR_VARIANTS.map((f) => ({ id: f.id, kind: 'fur' as const, name: 'Окрас', price: f.price, color: f.fur }));
export const WALLS: Item[] = WALL_COLORS.map((w) => ({ id: w.id, kind: 'wall' as const, name: 'Обои', price: w.price, color: w.color }));
export const FLOORS: Item[] = FLOOR_COLORS.map((f) => ({ id: f.id, kind: 'floor' as const, name: 'Пол', price: f.price, color: f.color }));

export const ALL_ITEMS: Item[] = [...FOODS, ...HATS, ...GLASSES, ...BOWS, ...SCARVES, ...FURS, ...WALLS, ...FLOORS];
const byId = new Map(ALL_ITEMS.map((i) => [i.id, i]));
export const getItem = (id: string): Item | undefined => byId.get(id);
export const itemsOfKind = (k: ItemKind): Item[] => ALL_ITEMS.filter((i) => i.kind === k);

/** Предметы, доступные сразу (цена 0 и не еда) */
export const DEFAULT_OWNED: string[] = ALL_ITEMS.filter((i) => i.kind !== 'food' && i.price === 0).map((i) => i.id);
export const FAVORITE_FOOD = 'fish';
