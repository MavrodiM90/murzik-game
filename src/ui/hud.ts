import { NEED_IDS, type NeedId } from '../config';
import type { Game } from '../game';
import { lowestNeed, needColor, NEED_ROOM } from '../logic/needs';
import { ROOM_ORDER, type RoomId } from '../render/rooms';
import { BathTools } from './bathTools';
import { FoodTray } from './foodTray';
import { icon } from './icons';
import { ShopPanel } from './shop';

export interface Panel {
  close(): void;
}

export interface ToolSpec {
  id: string;
  icon: string;
  label: string;
  onTap(): void;
  /** подсветка включённого инструмента */
  active?: () => boolean;
}

export function makeButton(iconName: string, label: string, cls = '', onTap?: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${cls}`.trim();
  b.setAttribute('aria-label', label);
  b.innerHTML = icon(iconName);
  if (onTap) b.addEventListener('click', onTap);
  return b;
}

/** Весь интерфейс поверх 3D: только иконки, цвет и анимация, крупные цели ≥64 px. */
export class Hud {
  readonly root: HTMLElement;
  private needEls = new Map<NeedId, HTMLElement>();
  private coinsEl!: HTMLElement;
  private arrowL!: HTMLButtonElement;
  private arrowR!: HTMLButtonElement;
  private homeBtn!: HTMLButtonElement;
  private toolsEl!: HTMLElement;
  private sideEl!: HTMLElement;
  private panel: Panel | null = null;
  readonly bath: BathTools;
  readonly tray: FoodTray;
  readonly shop: ShopPanel;
  private chestBtn: HTMLButtonElement | null = null;
  private chestAcc = 0;
  private extraTools: Partial<Record<RoomId, ToolSpec[]>> = {};
  private toolButtons: { spec: ToolSpec; el: HTMLButtonElement }[] = [];
  private lastLow: NeedId | null = null;

  constructor(
    readonly game: Game,
    root: HTMLElement,
  ) {
    this.root = root;
    this.build();
    this.bath = new BathTools(game, this);
    this.tray = new FoodTray(game, this);
    this.shop = new ShopPanel(game, this);
    this.addSide(makeButton('shop', 'Магазин', 'btn-shop', () => this.shop.toggle('shop')));
    this.addSide(makeButton('wardrobe', 'Гардероб', 'btn-wardrobe', () => this.shop.toggle('wardrobe')));
    game.onUpdate.push((dt) => {
      this.chestAcc += dt;
      if (this.chestAcc > 0.5) {
        this.chestAcc = 0;
        this.refreshChest();
      }
    });
    game.on('needs', () => this.refreshNeeds());
    game.on('coins', () => this.refreshCoins());
    game.on('room', () => this.onRoom());
    game.on('sleep', () => this.refreshNav());
    this.refreshNeeds();
    this.refreshCoins();
    this.onRoom();
  }

  private build(): void {
    const r = this.root;
    r.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'hud-top';
    this.homeBtn = makeButton('home', 'Домой', 'btn-home', () => this.goHome());
    this.coinsEl = document.createElement('div');
    this.coinsEl.className = 'coins';
    this.coinsEl.innerHTML = `<span class="coin-ic">${icon('coin')}</span><b data-coins>0</b>`;
    top.append(this.homeBtn, this.coinsEl);
    r.append(top);

    const needs = document.createElement('div');
    needs.className = 'needs';
    for (const id of NEED_IDS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'need';
      el.dataset.need = id;
      el.setAttribute('aria-label', id);
      el.innerHTML = `<span class="need-in"><span class="fill"></span><span class="need-ic">${icon(id)}</span></span>`;
      el.addEventListener('click', () => this.onNeedTap(id));
      needs.append(el);
      this.needEls.set(id, el);
    }
    r.append(needs);

    this.arrowL = makeButton('left', 'Налево', 'btn-arrow left', () => this.game.stepRoom(-1));
    this.arrowR = makeButton('right', 'Направо', 'btn-arrow right', () => this.game.stepRoom(1));
    r.append(this.arrowL, this.arrowR);

    this.sideEl = document.createElement('div');
    this.sideEl.className = 'side';
    r.append(this.sideEl);

    this.toolsEl = document.createElement('div');
    this.toolsEl.className = 'tools';
    r.append(this.toolsEl);

    this.attachSwipe();
  }

  /** Кнопки сбоку (магазин, гардероб, ушко) — добавляются модулями. */
  addSide(btn: HTMLElement): void {
    this.sideEl.append(btn);
  }

  addTool(room: RoomId, spec: ToolSpec): void {
    (this.extraTools[room] ??= []).push(spec);
    if (this.game.roomId === room) this.renderTools();
  }

  // ---------- панели ----------
  openPanel(p: Panel): void {
    this.closePanel();
    this.panel = p;
  }
  closePanel(except?: Panel): void {
    const p = this.panel;
    if (p && p !== except) {
      this.panel = null;
      p.close();
    }
  }
  clearPanel(p: Panel): void {
    if (this.panel === p) this.panel = null;
  }

  goHome(): void {
    this.closePanel();
    this.bath.stop();
    if (this.game.cat.mode !== 'lying') this.game.goToRoom('living');
    this.game.synth.play('click');
  }

  private onNeedTap(id: NeedId): void {
    this.game.synth.play('tap');
    this.closePanel();
    this.game.goToRoom(NEED_ROOM[id]);
  }

  // ---------- свайп между комнатами ----------
  private attachSwipe(): void {
    const el = this.game.canvas;
    let sx = 0;
    let sy = 0;
    let t0 = 0;
    let active = false;
    // свайп по пустому месту (не по коту) листает комнаты
    el.addEventListener('pointerdown', (e) => {
      if (this.game.cat.pickables.length === 0) return;
      const part = this.game.input.pickPart(e.clientX, e.clientY);
      const extra = this.game.pickExtra(e.clientX, e.clientY);
      active = part === null && extra === null && this.game.canInteract();
      sx = e.clientX;
      sy = e.clientY;
      t0 = performance.now();
    });
    el.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - t0 < 700) {
        this.closePanel();
        this.game.stepRoom(dx < 0 ? 1 : -1);
      }
    });
    el.addEventListener('pointercancel', () => (active = false));
  }

  // ---------- обновление ----------
  private refreshNeeds(): void {
    const n = this.game.save.needs;
    const low = lowestNeed(n);
    for (const id of NEED_IDS) {
      const el = this.needEls.get(id)!;
      const v = n[id];
      el.style.setProperty('--p', `${Math.round(v)}%`);
      el.style.setProperty('--c', needColor(v));
      el.classList.toggle('low', id === low);
    }
    if (low !== this.lastLow) this.lastLow = low;
  }

  private refreshCoins(): void {
    const b = this.coinsEl.querySelector('[data-coins]')!;
    const v = String(this.game.save.coins);
    if (b.textContent !== v) {
      b.textContent = v;
      this.coinsEl.classList.remove('bump');
      void this.coinsEl.offsetWidth;
      this.coinsEl.classList.add('bump');
    }
  }

  refreshNav(): void {
    const locked = this.game.navLocked;
    const i = this.game.roomIndex();
    this.arrowL.hidden = i === 0 || locked;
    this.arrowR.hidden = i === ROOM_ORDER.length - 1 || locked;
    this.homeBtn.classList.toggle('dim', this.game.roomId === 'living');
    this.root.classList.toggle('night', this.game.sleepRequested);
  }

  private onRoom(): void {
    this.closePanel();
    this.bath.stop();
    this.refreshNav();
    this.renderTools();
  }

  /** Инструменты текущей комнаты — большие кнопки внизу. */
  private renderTools(): void {
    this.toolsEl.innerHTML = '';
    this.toolButtons = [];
    const g = this.game;
    const room = g.roomId;
    const specs: ToolSpec[] = [];
    switch (room) {
      case 'kitchen':
        specs.push({ id: 'fridge', icon: 'fridge', label: 'Холодильник', onTap: () => this.tray.toggle('food') });
        break;
      case 'bath':
        specs.push(
          { id: 'sponge', icon: 'sponge', label: 'Губка', onTap: () => this.bath.toggle('sponge'), active: () => this.bath.tool === 'sponge' },
          { id: 'shower', icon: 'shower', label: 'Душ', onTap: () => this.bath.toggle('shower'), active: () => this.bath.tool === 'shower' },
          { id: 'potty', icon: 'potty', label: 'Горшок', onTap: () => this.pottyTap() },
          { id: 'cabinet', icon: 'cabinet', label: 'Аптечка', onTap: () => this.tray.toggle('medicine') },
        );
        break;
      case 'bedroom':
        specs.push({
          id: 'lamp',
          icon: 'lamp',
          label: 'Лампа',
          onTap: () => g.setLampOn(!g.lampOn),
          active: () => !g.lampOn,
        });
        break;
      case 'living':
        specs.push({ id: 'chest', icon: 'chest', label: 'Сундучок', onTap: () => this.chestTap() });
        break;
      default:
        break;
    }
    specs.push(...(this.extraTools[room] ?? []));
    for (const s of specs) {
      const b = makeButton(s.icon, s.label, `btn-tool tool-${s.id}`, () => {
        g.synth.play('click');
        s.onTap();
        this.refreshToolStates();
      });
      this.toolsEl.append(b);
      this.toolButtons.push({ spec: s, el: b });
    }
    this.chestBtn = this.toolsEl.querySelector('.tool-chest');
    this.refreshChest();
    this.refreshToolStates();
  }

  private chestTap(): void {
    const reward = this.game.openChest();
    if (reward > 0) {
      const el = document.createElement('div');
      el.className = 'chest-reward';
      el.innerHTML = `<span class="ci">${icon('coin')}</span><b>+${reward}</b>`;
      this.root.append(el);
      window.setTimeout(() => el.remove(), 1800);
    } else this.chestBtn?.classList.add('shake');
    window.setTimeout(() => this.chestBtn?.classList.remove('shake'), 500);
    this.refreshChest();
  }

  private refreshChest(): void {
    const b = this.chestBtn;
    if (!b) return;
    const st = this.game.chest();
    b.classList.toggle('ready', st.ready);
    b.classList.toggle('wait', !st.ready);
    const frac = st.ready ? 1 : 1 - st.remainingMs / (4 * 60 * 60 * 1000);
    b.style.setProperty('--prog', `${Math.round(Math.max(0, Math.min(1, frac)) * 360)}deg`);
  }

  refreshToolStates(): void {
    for (const t of this.toolButtons) t.el.classList.toggle('on', !!t.spec.active?.());
  }

  private pottyTap(): void {
    this.bath.stop();
    this.closePanel();
    this.game.usePotty();
  }

  /** Вызывается из game.onTapExtraHook */
  handleExtra(id: string): void {
    switch (id) {
      case 'fridge':
        this.tray.toggle('food');
        break;
      case 'lamp':
        this.game.setLampOn(!this.game.lampOn);
        break;
      case 'shower':
        this.bath.toggle('shower');
        break;
      case 'potty':
        this.pottyTap();
        break;
      case 'tv':
        this.extraHandlers.tv?.();
        break;
      default:
        break;
    }
    this.refreshToolStates();
  }

  extraHandlers: Record<string, () => void> = {};
}
