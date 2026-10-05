import { Vector3 } from 'three';
import { randRange } from '../logic/math';
import { icon } from '../ui/icons';
import type { MiniGame, MiniGameCtx } from './types';

interface Fish {
  el: HTMLElement;
  x: number;
  y: number;
  vy: number;
  rot: number;
}

/** «Поймай рыбку»: рыбки падают, корзинку двигаем пальцем. Проиграть нельзя. */
export class CatchFish implements MiniGame {
  readonly id = 'fish';
  readonly icon = 'catch';
  readonly goodScore = 22;
  score = 0;
  private ctx!: MiniGameCtx;
  private basket!: HTMLElement;
  private fish: Fish[] = [];
  private spawnIn = 0.4;
  private targetX = 0;
  private bx = 0;
  private by = 0;
  private abort = new AbortController();
  private tmp = new Vector3();
  private pending: Fish[] = [];

  start(ctx: MiniGameCtx): void {
    this.ctx = ctx;
    this.bx = this.targetX = ctx.width / 2;
    this.by = ctx.height - 190;
    ctx.game.setFocus(0.12);
    this.basket = document.createElement('div');
    this.basket.className = 'mg-basket';
    this.basket.innerHTML = icon('basket');
    ctx.stage.append(this.basket);
    const s = ctx.stage;
    const move = (e: PointerEvent): void => {
      const r = s.getBoundingClientRect();
      this.targetX = Math.max(60, Math.min(ctx.width - 60, e.clientX - r.left));
    };
    s.addEventListener('pointerdown', move, { signal: this.abort.signal });
    s.addEventListener('pointermove', move, { signal: this.abort.signal });
    this.place();
  }

  private place(): void {
    this.basket.style.transform = `translate(${this.bx - 70}px, ${this.by}px)`;
  }

  private spawn(): void {
    const el = document.createElement('div');
    el.className = 'mg-fish';
    el.innerHTML = icon('fish');
    el.style.filter = `hue-rotate(${Math.round(randRange(-60, 160))}deg)`;
    this.ctx.stage.append(el);
    const f: Fish = {
      el,
      x: randRange(50, this.ctx.width - 50),
      y: -70,
      vy: randRange(170, 250) * (this.ctx.height / 800),
      rot: randRange(-0.4, 0.4),
    };
    this.fish.push(f);
  }

  update(dt: number): void {
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = randRange(0.7, 1.1);
    }
    this.bx += (this.targetX - this.bx) * Math.min(1, dt * 14);
    this.place();
    const remaining: Fish[] = [];
    for (const f of this.fish) {
      f.y += f.vy * dt;
      f.rot += dt * 0.8;
      const caught = f.y > this.by - 20 && f.y < this.by + 60 && Math.abs(f.x - this.bx) < 78;
      if (caught) {
        this.score++;
        this.ctx.onPoint();
        const r = this.ctx.stage.getBoundingClientRect();
        this.ctx.game.stage.pointerToWorld(r.left + f.x, r.top + f.y, this.tmp);
        this.ctx.game.particles.burst('star', { x: this.tmp.x, y: this.tmp.y, z: 1.6 }, 4, 2.6, { life: 0.6, size: 0.4, gravity: 3 });
        this.ctx.game.synth.play(this.score % 2 ? 'bubble' : 'coin');
        f.el.remove();
        this.basket.classList.remove('catch');
        void this.basket.offsetWidth;
        this.basket.classList.add('catch');
        if (this.score % 4 === 0 && this.ctx.game.cat.mode === 'stand') this.ctx.game.cat.play('cheer');
        continue;
      }
      if (f.y > this.ctx.height + 60) {
        f.el.remove();
        this.ctx.game.synth.play('splash');
        continue;
      }
      f.el.style.transform = `translate(${f.x - 45}px, ${f.y}px) rotate(${Math.sin(f.rot) * 0.5}rad)`;
      remaining.push(f);
    }
    this.fish = remaining;
    void this.pending;
  }

  stop(): void {
    this.abort.abort();
    for (const f of this.fish) f.el.remove();
    this.fish = [];
    this.basket?.remove();
    this.ctx.game.setFocus(0);
  }
}
