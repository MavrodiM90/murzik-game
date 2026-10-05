import { Vector3 } from 'three';
import type { Game } from '../game';
import { FAVORITE_FOOD, FOODS, getItem } from '../logic/catalog';
import { foodCount } from '../logic/economy';
import type { Hud, Panel } from './hud';
import { icon } from './icons';

type Mode = 'food' | 'medicine';

/**
 * Лоток с едой (холодильник) или аптечкой. Предмет можно утащить пальцем ко рту
 * (кот открывает рот) или просто тапнуть — тогда он сам «полетит» ко рту.
 */
export class FoodTray implements Panel {
  private el: HTMLElement | null = null;
  private mode: Mode | null = null;
  private ghost: HTMLElement | null = null;
  private dragging = false;
  private tmp = new Vector3();
  private busy = false;

  constructor(
    private game: Game,
    private hud: Hud,
  ) {
    game.on('inventory', () => this.render());
  }

  get isOpen(): boolean {
    return !!this.el;
  }

  toggle(mode: Mode): void {
    if (this.el && this.mode === mode) this.close();
    else this.open(mode);
  }

  open(mode: Mode): void {
    this.hud.closePanel(this);
    this.close(true);
    this.mode = mode;
    const el = document.createElement('div');
    el.className = `tray tray-${mode}`;
    this.el = el;
    this.hud.root.append(el);
    this.hud.openPanel(this);
    this.render();
    this.game.synth.play('chime');
  }

  close(silent = false): void {
    this.cancelGhost();
    this.el?.remove();
    this.el = null;
    this.mode = null;
    this.game.cat.mouthHint = 0;
    if (!silent) this.hud.clearPanel(this);
  }

  private items(): string[] {
    if (this.mode === 'medicine') return ['vitamin'];
    return FOODS.filter((f) => f.free || foodCount(this.game.save, f.id) > 0).map((f) => f.id);
  }

  private render(): void {
    const el = this.el;
    if (!el) return;
    el.innerHTML = '';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-close';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = icon('close');
    close.addEventListener('click', () => this.close());
    const row = document.createElement('div');
    row.className = 'tray-row';
    for (const id of this.items()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tray-item';
      b.dataset.item = id;
      b.setAttribute('aria-label', getItem(id)?.name ?? id);
      let badge = '';
      if (this.mode === 'food') {
        const n = foodCount(this.game.save, id);
        if (Number.isFinite(n)) badge = `<i class="badge">${n}</i>`;
        if (id === this.game.save.favoriteFood || id === FAVORITE_FOOD) badge += `<i class="fav">${icon('heart')}</i>`;
      }
      b.innerHTML = `${icon(id)}${badge}`;
      b.addEventListener('pointerdown', (e) => this.startDrag(e, id, b));
      row.append(b);
    }
    el.append(row, close);
  }

  private mouthScreen(): { x: number; y: number } {
    const p = this.game.cat.anchorWorld('mouth', this.tmp);
    return this.game.stage.worldToScreen(p, { x: 0, y: 0 });
  }

  private nearMouth(x: number, y: number): boolean {
    const m = this.mouthScreen();
    const wpp = this.game.stage.worldPerPixel();
    // проверяем центр «призрака» еды: он висит над пальцем
    return Math.hypot(x - m.x, y - 52 - m.y) < 1.5 / wpp;
  }

  private startDrag(e: PointerEvent, id: string, src: HTMLElement): void {
    if (this.busy || this.game.sleeping) return;
    e.preventDefault();
    this.game.synth.unlock();
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.innerHTML = icon(id);
    document.body.append(ghost);
    this.ghost = ghost;
    this.dragging = true;
    src.classList.add('lifted');
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = 0;
    this.moveGhost(e.clientX, e.clientY);
    const cat = this.game.cat;
    cat.stopWalking();
    const onMove = (ev: PointerEvent): void => {
      moved = Math.max(moved, Math.hypot(ev.clientX - sx, ev.clientY - sy));
      this.moveGhost(ev.clientX, ev.clientY);
      this.game.stage.pointerToWorld(ev.clientX, ev.clientY, this.tmp);
      cat.lookAt(this.tmp);
      cat.mouthHint = this.nearMouth(ev.clientX, ev.clientY) ? 1 : 0;
    };
    const finish = (ev: PointerEvent, cancelled: boolean): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      src.classList.remove('lifted');
      this.dragging = false;
      if (cancelled) {
        this.cancelGhost();
        cat.mouthHint = 0;
        return;
      }
      const tap = moved < 12;
      if (tap || this.nearMouth(ev.clientX, ev.clientY)) this.feedWithFlight(id, ev.clientX, ev.clientY);
      else {
        this.cancelGhost();
        cat.mouthHint = 0;
      }
    };
    const onUp = (ev: PointerEvent): void => finish(ev, false);
    const onCancel = (ev: PointerEvent): void => finish(ev, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  private moveGhost(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.transform = `translate(${x - 44}px, ${y - 96}px) scale(1.1)`;
  }

  /** Предмет влетает в рот, затем кот ест. */
  private feedWithFlight(id: string, x: number, y: number): void {
    const ghost = this.ghost;
    if (!ghost) return;
    this.busy = true;
    const m = this.mouthScreen();
    this.game.cat.mouthHint = 1;
    ghost.style.transition = 'transform 220ms ease-in, opacity 220ms';
    const sx = x - 44;
    const sy = y - 96;
    void ghost.offsetWidth;
    ghost.style.transform = `translate(${m.x - 44 + (m.x - sx) * 0}px, ${m.y - 44}px) scale(0.4)`;
    ghost.style.opacity = '0.2';
    window.setTimeout(() => {
      this.cancelGhost();
      this.game.cat.mouthHint = 0;
      this.busy = false;
      if (this.mode === 'medicine') this.game.giveVitamin();
      else this.game.feed(id);
      void sy;
      this.render();
    }, 230);
  }

  private cancelGhost(): void {
    this.ghost?.remove();
    this.ghost = null;
  }

  get isDragging(): boolean {
    return this.dragging;
  }
}
