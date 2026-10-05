import { icon } from '../ui/icons';
import type { MiniGame, MiniGameCtx } from './types';

const SYMBOLS = ['star', 'heart', 'moon', 'sun', 'fish', 'flower', 'ball', 'balloon'];

interface Card {
  el: HTMLButtonElement;
  symbol: string;
  open: boolean;
  matched: boolean;
}

/** «Найди пару»: 6 карточек (3 пары) с крупными картинками. Раунды повторяются, пока не кончится время. */
export class Memory implements MiniGame {
  readonly id = 'memory';
  readonly icon = 'cards';
  readonly goodScore = 6;
  score = 0;
  private ctx!: MiniGameCtx;
  private grid!: HTMLElement;
  private cards: Card[] = [];
  private openCards: Card[] = [];
  private lock = false;
  private timers: number[] = [];

  start(ctx: MiniGameCtx): void {
    this.ctx = ctx;
    ctx.game.setFocus(0);
    this.grid = document.createElement('div');
    this.grid.className = 'mem-grid';
    ctx.stage.append(this.grid);
    this.deal();
  }

  private deal(): void {
    this.grid.innerHTML = '';
    this.cards = [];
    this.openCards = [];
    this.lock = false;
    const picks = [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, 3);
    const symbols = [...picks, ...picks].sort(() => Math.random() - 0.5);
    for (const sym of symbols) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mem-card';
      el.dataset.icon = sym;
      el.setAttribute('aria-label', 'Карточка');
      el.innerHTML = `<span class="face back">${icon('question')}</span><span class="face front">${icon(sym)}</span>`;
      const card: Card = { el, symbol: sym, open: false, matched: false };
      el.addEventListener('click', () => this.flip(card));
      this.grid.append(el);
      this.cards.push(card);
    }
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private flip(c: Card): void {
    if (this.lock || c.open || c.matched) return;
    c.open = true;
    c.el.classList.add('open');
    this.ctx.game.synth.play('tap');
    this.openCards.push(c);
    if (this.openCards.length < 2) return;
    const [a, b] = this.openCards as [Card, Card];
    this.lock = true;
    if (a.symbol === b.symbol) {
      this.later(() => {
        a.matched = b.matched = true;
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        this.score++;
        this.ctx.onPoint();
        this.ctx.game.synth.play('chime');
        this.ctx.game.fx('sparkle', 'head', 6);
        if (this.ctx.game.cat.mode === 'stand') this.ctx.game.cat.play('cheer');
        this.openCards = [];
        this.lock = false;
        if (this.cards.every((x) => x.matched)) this.later(() => this.deal(), 1100);
      }, 350);
    } else {
      this.later(() => {
        a.open = b.open = false;
        a.el.classList.remove('open');
        b.el.classList.remove('open');
        this.openCards = [];
        this.lock = false;
      }, 950);
    }
  }

  update(): void {
    /* всё на событиях */
  }

  stop(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.grid?.remove();
  }
}
