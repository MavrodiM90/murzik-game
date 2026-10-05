import type { Game } from '../game';
import { FOODS, getItem, itemsOfKind, type Item, type ItemKind } from '../logic/catalog';
import { foodCount, isOwned } from '../logic/economy';
import type { Hud, Panel } from './hud';
import { icon } from './icons';

export type ShopMode = 'shop' | 'wardrobe';

interface Tab {
  kind: ItemKind;
  icon: string;
}

const TABS: Tab[] = [
  { kind: 'hat', icon: 'hat' },
  { kind: 'glasses', icon: 'glasses' },
  { kind: 'bow', icon: 'bow' },
  { kind: 'scarf', icon: 'scarf' },
  { kind: 'fur', icon: 'fur' },
  { kind: 'wall', icon: 'wall' },
  { kind: 'floor', icon: 'floor' },
  { kind: 'food', icon: 'apple' },
];

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Магазин и гардероб — одна панель снизу. Реальных денег нет: только игровые монеты. */
export class ShopPanel implements Panel {
  private el: HTMLElement | null = null;
  mode: ShopMode = 'shop';
  private kind: ItemKind = 'hat';
  private selected: string | null = null;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {}

  get isOpen(): boolean {
    return !!this.el;
  }

  open(mode: ShopMode): void {
    this.hud.closePanel(this);
    this.close(true);
    this.mode = mode;
    this.selected = null;
    if (mode === 'wardrobe' && this.kind === 'food') this.kind = 'hat';
    const el = document.createElement('div');
    el.className = `shop shop-${mode}`;
    this.el = el;
    this.hud.root.append(el);
    this.hud.openPanel(this);
    this.game.setFocus(0.2);
    this.game.synth.play('chime');
    this.render();
  }

  toggle(mode: ShopMode): void {
    if (this.el && this.mode === mode) this.close();
    else this.open(mode);
  }

  close(silent = false): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.selected = null;
    this.game.setFocus(0);
    this.game.applyAppearance();
    if (!silent) this.hud.clearPanel(this);
  }

  private tabs(): Tab[] {
    return this.mode === 'shop' ? TABS : TABS.filter((t) => t.kind !== 'food');
  }

  private items(): Item[] {
    if (this.kind === 'food') return FOODS.filter((f) => !f.free);
    const all = itemsOfKind(this.kind);
    return this.mode === 'wardrobe' ? all.filter((i) => isOwned(this.game.save, i.id)) : all;
  }

  private isActive(it: Item): boolean {
    const s = this.game.save;
    switch (it.kind) {
      case 'hat':
      case 'glasses':
      case 'bow':
      case 'scarf':
        return s.equipped[it.kind] === it.id;
      case 'fur':
        return s.fur === it.id;
      case 'wall':
        return s.wall[this.game.roomId] === it.id;
      case 'floor':
        return s.floor[this.game.roomId] === it.id;
      default:
        return false;
    }
  }

  private thumb(it: Item): string {
    if (['hat', 'glasses', 'bow', 'scarf'].includes(it.kind)) {
      const url = this.game.thumbs.get(it.id);
      return url ? `<img src="${url}" alt="" draggable="false">` : icon(it.kind);
    }
    if (it.kind === 'food') return icon(it.id);
    if (it.kind === 'fur') {
      const fur = hex(it.color ?? 0xff9a3c);
      return `<span class="sw sw-fur" style="--c:${fur}"><i></i></span>`;
    }
    return `<span class="sw sw-${it.kind}" style="--c:${hex(it.color ?? 0xffffff)}"></span>`;
  }

  render(): void {
    const el = this.el;
    if (!el) return;
    el.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'shop-head';
    const tabs = document.createElement('div');
    tabs.className = 'shop-tabs';
    for (const t of this.tabs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `shop-tab${t.kind === this.kind ? ' on' : ''}`;
      b.dataset.kind = t.kind;
      b.setAttribute('aria-label', t.kind);
      b.innerHTML = icon(t.icon);
      b.addEventListener('click', () => {
        this.kind = t.kind;
        this.selected = null;
        this.game.applyAppearance();
        this.game.synth.play('tap');
        this.render();
      });
      tabs.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-close shop-close';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = icon('close');
    close.addEventListener('click', () => this.close());
    head.append(tabs, close);

    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    const items = this.items();
    if (items.length === 0) grid.innerHTML = `<div class="empty">${icon('shop')}</div>`;
    for (const it of items) {
      const owned = it.kind === 'food' ? false : isOwned(this.game.save, it.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.item = it.id;
      card.setAttribute('aria-label', it.name);
      if (this.isActive(it)) card.classList.add('active');
      if (this.selected === it.id) card.classList.add('sel');
      let tag = '';
      if (it.kind === 'food') {
        tag = `<span class="price"><i class="c">${icon('coin')}</i>${it.price}</span><span class="badge">${foodCount(this.game.save, it.id)}</span>`;
      } else if (this.mode === 'shop' && !owned && it.price > 0) {
        tag = `<span class="price"><i class="c">${icon('coin')}</i>${it.price}</span>`;
      } else if (owned && this.mode === 'shop') {
        tag = `<span class="own">${icon('check')}</span>`;
      }
      card.innerHTML = `<span class="thumb">${this.thumb(it)}</span>${tag}`;
      card.addEventListener('click', () => this.onCard(it));
      grid.append(card);
    }
    el.append(head, grid);
    if (this.mode === 'shop' && this.selected) {
      const it = getItem(this.selected);
      if (it && it.kind !== 'food' && !isOwned(this.game.save, it.id)) {
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'btn btn-buy';
        buy.setAttribute('aria-label', 'Купить');
        buy.innerHTML = `${icon('check')}<span class="price"><i class="c">${icon('coin')}</i>${it.price}</span>`;
        buy.addEventListener('click', () => this.buy(it));
        el.append(buy);
      }
    }
  }

  private onCard(it: Item): void {
    const g = this.game;
    g.synth.play('tap');
    if (it.kind === 'food') {
      this.buy(it);
      return;
    }
    const owned = isOwned(g.save, it.id);
    if (owned) {
      this.selected = null;
      g.toggleItem(it.id);
    } else if (this.mode === 'shop') {
      this.selected = it.id;
      g.previewItem(it.id);
    }
    this.render();
  }

  private buy(it: Item): void {
    const res = this.game.buyItem(it.id);
    if (!res.ok && res.reason === 'poor') {
      const c = this.hud.root.querySelector('.coins');
      c?.classList.remove('shake');
      void (c as HTMLElement | null)?.offsetWidth;
      c?.classList.add('shake');
    }
    if (res.ok) this.selected = null;
    this.render();
  }
}
